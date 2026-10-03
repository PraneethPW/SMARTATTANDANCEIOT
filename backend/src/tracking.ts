import { Router } from "express";
import webpush from "web-push";
import { z } from "zod";
import type { Server } from "socket.io";
import { pool } from "./db.js";
import { requireAuth } from "./auth.js";
import { route } from "./http.js";
import { haversineMeters } from "./domain.js";

let ready: Promise<{ publicKey: string; privateKey: string }> | undefined;
async function pushKeys() {
  return (ready ??= (async () => {
    const keys = webpush.generateVAPIDKeys();
    await pool.query(
      "INSERT INTO system_settings(key,value) VALUES('web_push_vapid',$1) ON CONFLICT(key) DO NOTHING",
      [JSON.stringify(keys)],
    );
    const found = await pool.query(
      "SELECT value FROM system_settings WHERE key='web_push_vapid'",
    );
    const saved = found.rows[0].value as typeof keys;
    webpush.setVapidDetails(
      process.env.WEB_PUSH_CONTACT ||
        "https://frontend-neon-gamma-12.vercel.app",
      saved.publicKey,
      saved.privateKey,
    );
    return saved;
  })().catch((e) => {
    ready = undefined;
    throw e;
  }));
}
export async function notifyStudent(
  io: Server,
  studentId: string,
  tripId: string,
  kind: string,
  body: string,
  contextKey = "",
) {
  const inserted = await pool.query(
    `INSERT INTO notifications(user_id,student_id,trip_id,kind,body,context_key)
  SELECT l.user_id,l.student_id,$2,$3,CASE WHEN u.role='PARENT' THEN s.name||' · '||$4 ELSE $4 END,$5 FROM student_user_links l JOIN users u ON u.id=l.user_id JOIN students s ON s.id=l.student_id WHERE l.student_id=$1
  ON CONFLICT(user_id,student_id,trip_id,kind,context_key) DO NOTHING RETURNING user_id,id,body`,
    [studentId, tripId, kind, body, contextKey],
  );
  if (!inserted.rowCount) return;
  for (const row of inserted.rows)
    io.to("user:" + row.user_id).emit("notification:new", {
      id: row.id,
      kind,
      body: row.body,
    });
  io.to("portal").emit("portal:changed");
  try {
    await pushKeys();
    const subscriptions = await pool.query(
      "SELECT user_id,endpoint,subscription FROM push_subscriptions WHERE user_id=ANY($1::uuid[])",
      [inserted.rows.map((x) => x.user_id)],
    );
    await Promise.allSettled(
      subscriptions.rows.map(async (sub) => {
        try {
          await webpush.sendNotification(
            sub.subscription,
            JSON.stringify({
              title: "TransitSync",
              body: inserted.rows.find((n) => n.user_id === sub.user_id)?.body,
              notificationId: inserted.rows.find(
                (n) => n.user_id === sub.user_id,
              )?.id,
            }),
            { TTL: 300 },
          );
        } catch (e) {
          if ([404, 410].includes((e as { statusCode: number }).statusCode))
            await pool.query(
              "DELETE FROM push_subscriptions WHERE endpoint=$1",
              [sub.endpoint],
            );
        }
      }),
    );
  } catch {
    console.warn(
      "Push notification delivery unavailable; in-app notification retained",
    );
  }
}
export async function checkBoardingStops(
  io: Server,
  busId: string,
  tripId: string,
  latitude: number,
  longitude: number,
) {
  const stops = await pool.query(
    `SELECT s.id,st.id AS stop_id,st.name,st.latitude,st.longitude FROM students s JOIN bus_stops st ON st.id=s.boarding_stop_id
  WHERE s.active AND s.assigned_bus_id=$1 AND st.active`,
    [busId],
  );
  for (const s of stops.rows) {
    const distance = haversineMeters(
      { latitude, longitude },
      { latitude: s.latitude, longitude: s.longitude },
    );
    if (distance <= 100)
      await notifyStudent(
        io,
        s.id,
        tripId,
        "STOP_REACHED",
        `Your bus has reached ${s.name}.`,
        s.stop_id,
      );
    else if (distance <= 500)
      await notifyStudent(
        io,
        s.id,
        tripId,
        "STOP_APPROACHING",
        `Your bus is approaching ${s.name}.`,
        s.stop_id,
      );
  }
}
export async function notifyCampusArrival(io: Server, tripId: string) {
  const students = await pool.query(
    "SELECT student_id FROM bus_attendance WHERE trip_id=$1 AND status='PRESENT'",
    [tripId],
  );
  for (const s of students.rows)
    await notifyStudent(
      io,
      s.student_id,
      tripId,
      "CAMPUS_ARRIVAL",
      "Your bus reached campus.",
    );
}
export function trackingRouter() {
  const r = Router();
  r.use("/notifications", requireAuth);
  r.get(
    "/notifications",
    route(async (req, res) =>
      res.json({
        notifications: (
          await pool.query(
            "SELECT id,student_id,trip_id,kind,body,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
            [req.user!.id],
          )
        ).rows,
      }),
    ),
  );
  r.patch(
    "/notifications/:id",
    route(async (req, res) => {
      await pool.query(
        "UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2",
        [z.string().uuid().parse(req.params.id), req.user!.id],
      );
      res.json({ read: true });
    }),
  );
  r.get(
    "/notifications/push/key",
    route(async (_req, res) =>
      res.json({ publicKey: (await pushKeys()).publicKey }),
    ),
  );
  r.post(
    "/notifications/push",
    route(async (req, res) => {
      const sub = z
        .object({
          endpoint: z.string().url().startsWith("https://"),
          keys: z.object({
            p256dh: z.string().min(10),
            auth: z.string().min(10),
          }),
        })
        .parse(req.body);
      // Accept only Web Push providers, never arbitrary endpoints into the internal network.
      const hostname = new URL(sub.endpoint).hostname;
      if (
        ![
          "fcm.googleapis.com",
          "updates.push.services.mozilla.com",
          "web.push.apple.com",
        ].includes(hostname)
      )
        return res.status(400).json({ error: "Unsupported push provider" });
      await pool.query(
        "INSERT INTO push_subscriptions(user_id,endpoint,subscription) VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,subscription=EXCLUDED.subscription",
        [req.user!.id, sub.endpoint, JSON.stringify(sub)],
      );
      res.json({ subscribed: true });
    }),
  );
  r.delete(
    "/notifications/push",
    route(async (req, res) => {
      const input = z.object({ endpoint: z.string().url() }).parse(req.body);
      await pool.query(
        "DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2",
        [req.user!.id, input.endpoint],
      );
      res.json({ unsubscribed: true });
    }),
  );
  return r;
}
