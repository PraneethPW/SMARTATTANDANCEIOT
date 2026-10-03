import { Router } from "express";
import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Server } from "socket.io";
import type { PoolClient } from "pg";
import { allowRoles, requireAuth, type SessionUser } from "./auth.js";
import { pool } from "./db.js";
import { route, transaction, fail, audit } from "./http.js";
import { normalizeRfid } from "./domain.js";
import { describeFace, faceDistance } from "./face-engine.js";
import { headTurnPassed } from "./face-rules.js";
import { notifyStudent } from "./tracking.js";

export async function makeChallenge(
  c: PoolClient,
  studentId: string,
  category: "BUS" | "CLASS" | "HOSTEL",
  tripId: string | null,
  sessionId: string | null,
  eventId: string | null,
  actor: string | null,
) {
  const result = await c.query(
    `INSERT INTO attendance_challenges(student_id,category,trip_id,session_id,source_event_id,created_by,turn_direction)
  VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(source_event_id) WHERE source_event_id IS NOT NULL DO UPDATE SET source_event_id=EXCLUDED.source_event_id
  RETURNING id,student_id,category,turn_direction,expires_at,status`,
    [
      studentId,
      category,
      tripId,
      sessionId,
      eventId,
      actor,
      randomInt(2) ? "LEFT" : "RIGHT",
    ],
  );
  return result.rows[0];
}
export async function prepareBusAttendance(event: {
  id: string;
  student_id: string;
  trip_id: string;
  bus_id: string;
  received_at: Date;
}) {
  return transaction(async (c) => {
    const trip = await c.query(
      "SELECT status FROM trips WHERE id=$1 FOR UPDATE",
      [event.trip_id],
    );
    if (trip.rows[0]?.status !== "ACTIVE") return null;
    const b = await c.query(
      "SELECT b.driver_name,b.registration_number,st.name AS boarding_point FROM buses b JOIN students s ON s.id=$2 LEFT JOIN bus_stops st ON st.id=s.boarding_stop_id WHERE b.id=$1",
      [event.bus_id, event.student_id],
    );
    const current = await c.query(
      "SELECT status FROM bus_attendance WHERE trip_id=$1 AND student_id=$2",
      [event.trip_id, event.student_id],
    );
    if (current.rows[0]?.status === "PRESENT") return null;
    // One live challenge per person/trip. A repeat scan refreshes an expired challenge without double attendance.
    const pending = await c.query(
      "SELECT id FROM attendance_challenges WHERE trip_id=$1 AND student_id=$2 AND category='BUS' AND status='PENDING' AND expires_at>now()",
      [event.trip_id, event.student_id],
    );
    if (pending.rowCount) return { id: pending.rows[0].id };
    const challenge = await makeChallenge(
      c,
      event.student_id,
      "BUS",
      event.trip_id,
      null,
      event.id,
      null,
    );
    await c.query(
      `INSERT INTO bus_attendance(trip_id,student_id,bus_id,source_event_id,challenge_id,boarding_point,boarded_at,driver_name,vehicle_number)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(trip_id,student_id) DO UPDATE SET status='PENDING_FACE',source_event_id=EXCLUDED.source_event_id,challenge_id=EXCLUDED.challenge_id,boarded_at=EXCLUDED.boarded_at`,
      [
        event.trip_id,
        event.student_id,
        event.bus_id,
        event.id,
        challenge.id,
        b.rows[0].boarding_point,
        event.received_at,
        b.rows[0].driver_name,
        b.rows[0].registration_number,
      ],
    );
    return challenge;
  });
}
async function mayAccessStudent(user: SessionUser, id: string) {
  if (["ADMIN", "FACULTY", "TRANSPORT"].includes(user.role)) return;
  if (
    user.role !== "STUDENT" ||
    !(
      await pool.query(
        "SELECT 1 FROM student_user_links WHERE user_id=$1 AND student_id=$2 AND relationship='SELF'",
        [user.id, id],
      )
    ).rowCount
  )
    fail(403, "This student is not linked to your account");
}
export async function requireOpenSession(
  c: PoolClient,
  id: string,
  user?: SessionUser,
) {
  const result = await c.query(
    `SELECT ats.*,t.starts_at,t.ends_at,
  (ats.session_date=(clock_timestamp() AT TIME ZONE current_setting('TimeZone'))::date AND t.weekday=EXTRACT(DOW FROM (clock_timestamp() AT TIME ZONE current_setting('TimeZone')))::int AND (clock_timestamp() AT TIME ZONE current_setting('TimeZone'))::time>=t.starts_at AND (clock_timestamp() AT TIME ZONE current_setting('TimeZone'))::time<t.ends_at) AS is_open
  FROM attendance_sessions ats JOIN timetables t ON t.id=ats.timetable_id WHERE ats.id=$1`,
    [id],
  );
  const s = result.rows[0];
  if (!s) fail(404, "Class session not found");
  if (user && user.role === "FACULTY" && s.faculty_id !== user.id)
    fail(403, "This class belongs to another faculty member");
  if (!s.is_open)
    fail(
      409,
      "Class attendance is available only during the scheduled session",
    );
  return s;
}

export function verificationRouter(io: Server) {
  const r = Router();
  r.use(["/verification", "/hostel"], requireAuth);
  const changed = () => {
    io.to("operations").emit("attendance:updated");
    io.to("portal").emit("portal:changed");
  };
  r.get(
    "/verification/profile/:studentId",
    route(async (req, res) => {
      const id = z.string().uuid().parse(req.params.studentId);
      await mayAccessStudent(req.user!, id);
      const result = await pool.query(
        "SELECT student_id,approved_at,created_at FROM face_enrollments WHERE student_id=$1",
        [id],
      );
      res.json({ enrollment: result.rows[0] ?? null });
    }),
  );
  r.post(
    "/verification/enroll/:studentId",
    allowRoles("ADMIN", "STUDENT"),
    route(async (req, res) => {
      const id = z.string().uuid().parse(req.params.studentId);
      await mayAccessStudent(req.user!, id);
      const input = z
        .object({ image: z.string().max(950_000), consent: z.literal(true) })
        .parse(req.body);
      const face = await describeFace(input.image);
      const others = await pool.query(
        "SELECT student_id,descriptor FROM face_enrollments WHERE student_id<>$1 AND approved_at IS NOT NULL",
        [id],
      );
      if (
        others.rows.some(
          (x) => faceDistance(x.descriptor, face.descriptor) < 0.42,
        )
      )
        fail(
          409,
          "This face is already enrolled for another student. Contact the campus administrator.",
        );
      await transaction(async (c) => {
        await c.query(
          `INSERT INTO face_enrollments(student_id,descriptor,portrait,enrolled_by) VALUES($1,$2,$3,$4)
    ON CONFLICT(student_id) DO UPDATE SET descriptor=EXCLUDED.descriptor,portrait=EXCLUDED.portrait,enrolled_by=EXCLUDED.enrolled_by,approved_at=NULL,approved_by=NULL,consent_at=now(),created_at=now()`,
          [id, JSON.stringify(face.descriptor), face.portrait, req.user!.id],
        );
        await audit(c, req.user!.id, "ENROLL_FACE", "student", id, null, {
          pendingApproval: true,
        });
      });
      changed();
      res.status(201).json({ enrolled: true, approved: false });
    }),
  );
  r.get(
    "/verification/enrollments",
    allowRoles("ADMIN", "FACULTY"),
    route(async (_req, res) =>
      res.json({
        enrollments: (
          await pool.query(
            `SELECT f.student_id,f.portrait,f.approved_at,f.created_at,s.name,s.registration_number FROM face_enrollments f JOIN students s ON s.id=f.student_id ORDER BY f.created_at DESC`,
          )
        ).rows,
      }),
    ),
  );
  r.post(
    "/verification/enrollments/:studentId/approve",
    allowRoles("ADMIN", "FACULTY"),
    route(async (req, res) => {
      const id = z.string().uuid().parse(req.params.studentId);
      const v = z.object({ identityChecked: z.literal(true) }).parse(req.body);
      await transaction(async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(7711025)");
        const enrollment = await c.query(
          "SELECT descriptor FROM face_enrollments WHERE student_id=$1 FOR UPDATE",
          [id],
        );
        if (!enrollment.rows[0]) fail(404, "No face enrollment found");
        const others = await c.query(
          "SELECT descriptor FROM face_enrollments WHERE student_id<>$1 AND approved_at IS NOT NULL",
          [id],
        );
        if (
          others.rows.some(
            (x) =>
              faceDistance(x.descriptor, enrollment.rows[0].descriptor) < 0.42,
          )
        )
          fail(
            409,
            "This face matches another approved student enrollment. Check campus identity.",
          );
        const result = await c.query(
          "UPDATE face_enrollments SET approved_by=$1,approved_at=now() WHERE student_id=$2 RETURNING student_id",
          [req.user!.id, id],
        );
        if (!result.rowCount) fail(404, "No face enrollment found");
        await audit(c, req.user!.id, "APPROVE_FACE", "student", id, null, v);
      });
      changed();
      res.json({ approved: true });
    }),
  );
  r.get(
    "/verification/pending",
    allowRoles("ADMIN", "FACULTY", "TRANSPORT", "STUDENT"),
    route(async (req, res) => {
      const result = await pool.query(
        `SELECT c.id,c.student_id,c.category,c.turn_direction,c.expires_at,s.name,s.registration_number,
   EXISTS(SELECT 1 FROM face_enrollments f WHERE f.student_id=c.student_id AND approved_at IS NOT NULL) AS enrolled
   FROM attendance_challenges c JOIN students s ON s.id=c.student_id WHERE c.status='PENDING' AND c.expires_at>now()
    AND ($1::boolean OR EXISTS(SELECT 1 FROM student_user_links l WHERE l.student_id=c.student_id AND l.user_id=$2 AND relationship='SELF')) ORDER BY c.created_at DESC`,
        [req.user!.role !== "STUDENT", req.user!.id],
      );
      res.json({ challenges: result.rows });
    }),
  );
  r.post(
    "/verification/:id/complete",
    allowRoles("ADMIN", "FACULTY", "TRANSPORT", "STUDENT"),
    route(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const v = z
        .object({
          frontImage: z.string().max(950_000),
          turnImage: z.string().max(950_000),
        })
        .parse(req.body);
      const initial = await pool.query(
        "SELECT student_id FROM attendance_challenges WHERE id=$1",
        [id],
      );
      if (!initial.rows[0]) fail(404, "Verification request not found");
      await mayAccessStudent(req.user!, initial.rows[0].student_id);
      const outcome = await transaction(async (c) => {
        const categoryInfo = await c.query(
          "SELECT trip_id FROM attendance_challenges WHERE id=$1",
          [id],
        );
        if (categoryInfo.rows[0]?.trip_id)
          await c.query("SELECT id FROM trips WHERE id=$1 FOR UPDATE", [
            categoryInfo.rows[0].trip_id,
          ]);
        const result = await c.query(
          `SELECT c.*,f.descriptor,f.approved_at FROM attendance_challenges c LEFT JOIN face_enrollments f ON f.student_id=c.student_id WHERE c.id=$1 FOR UPDATE OF c`,
          [id],
        );
        const challenge = result.rows[0];
        if (challenge.status === "VERIFIED")
          return {
            verified: true,
            duplicate: true,
            category: challenge.category,
            studentId: challenge.student_id,
            tripId: challenge.trip_id,
          };
        if (
          challenge.status !== "PENDING" ||
          new Date(challenge.expires_at).getTime() < Date.now()
        )
          fail(409, "RFID verification expired. Scan the card again.");
        if (!challenge.approved_at)
          fail(
            409,
            "Campus staff must approve face enrollment before attendance verification",
          );
        if (challenge.category === "CLASS")
          await requireOpenSession(c, challenge.session_id);
        if (
          challenge.category === "BUS" &&
          !(
            await c.query(
              "SELECT id FROM trips WHERE id=$1 AND status='ACTIVE'",
              [challenge.trip_id],
            )
          ).rowCount
        )
          fail(409, "Boarding verification requires an active trip");
        const front = await describeFace(v.frontImage),
          turned = await describeFace(v.turnImage);
        const distance = Math.max(
          faceDistance(challenge.descriptor, front.descriptor),
          faceDistance(challenge.descriptor, turned.descriptor),
        );
        const turnPassed = headTurnPassed(
          front.pose,
          turned.pose,
          challenge.turn_direction,
        );
        if (new Date(challenge.expires_at).getTime() < Date.now())
          fail(
            409,
            "Verification expired during capture. Scan the card again.",
          );
        if (challenge.category === "CLASS")
          await requireOpenSession(c, challenge.session_id);
        if (
          challenge.category === "BUS" &&
          !(
            await c.query(
              "SELECT id FROM trips WHERE id=$1 AND status='ACTIVE' FOR UPDATE",
              [challenge.trip_id],
            )
          ).rowCount
        )
          fail(
            409,
            "Trip ended during verification. Attendance was not completed.",
          );
        if (distance > 0.48 || !turnPassed) {
          await c.query(
            "UPDATE attendance_challenges SET attempts=attempts+1,status=CASE WHEN attempts>=2 THEN 'FAILED' ELSE 'PENDING' END WHERE id=$1",
            [id],
          );
          return {
            verified: false,
            error:
              distance > 0.48
                ? "Face does not match the approved student enrollment"
                : "Turn your head as requested, then capture the second frame",
            category: challenge.category,
            studentId: challenge.student_id,
            tripId: challenge.trip_id,
          };
        }
        await c.query(
          "UPDATE attendance_challenges SET status='VERIFIED',verified_at=now(),face_distance=$1 WHERE id=$2",
          [distance, id],
        );
        if (challenge.category === "BUS")
          await c.query(
            "UPDATE bus_attendance SET status='PRESENT',face_verified_at=now() WHERE challenge_id=$1",
            [id],
          );
        else if (challenge.category === "CLASS")
          await c.query(
            `UPDATE attendance_records SET face_verified_at=now(),source='CLASS_RFID_FACE' WHERE session_id=$1 AND student_id=$2`,
            [challenge.session_id, challenge.student_id],
          );
        else
          await c.query(
            "INSERT INTO hostel_attendance(student_id,challenge_id) VALUES($1,$2) ON CONFLICT(student_id,attendance_date) DO UPDATE SET challenge_id=EXCLUDED.challenge_id,verified_at=now()",
            [challenge.student_id, id],
          );
        await audit(
          c,
          req.user!.id,
          "FACE_VERIFY",
          challenge.category,
          id,
          null,
          { distance },
        );
        return {
          verified: true,
          duplicate: false,
          category: challenge.category,
          studentId: challenge.student_id,
          tripId: challenge.trip_id,
        };
      });
      if (outcome.verified && outcome.category === "BUS" && !outcome.duplicate)
        await notifyStudent(
          io,
          outcome.studentId,
          outcome.tripId,
          "STUDENT_BOARDED",
          "Student boarded the bus after RFID and face verification.",
        );
      changed();
      res.status(outcome.verified ? 200 : 422).json(outcome);
    }),
  );
  r.post(
    "/hostel/scan",
    allowRoles("ADMIN", "FACULTY", "TRANSPORT"),
    route(async (req, res) => {
      const v = z
        .object({ rfidUid: z.string().min(4).max(64) })
        .parse(req.body);
      const student = await pool.query(
        "SELECT id FROM students WHERE rfid_uid=$1 AND active AND residency='HOSTEL'",
        [normalizeRfid(v.rfidUid)],
      );
      if (!student.rows[0])
        fail(404, "No active hostel student matches this card");
      const challenge = await transaction((c) =>
        makeChallenge(
          c,
          student.rows[0].id,
          "HOSTEL",
          null,
          null,
          null,
          req.user!.id,
        ),
      );
      changed();
      res.status(201).json({ challenge });
    }),
  );
  return r;
}
