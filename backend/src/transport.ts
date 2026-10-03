import { Router } from "express";
import { z } from "zod";
import type { Server } from "socket.io";
import { allowRoles, requireAuth } from "./auth.js";
import { pool } from "./db.js";
import { audit, fail, route, transaction } from "./http.js";
import { generateDeviceSecret, hashDeviceSecret } from "./domain.js";

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const busSchema = z
  .object({
    code: z.string().trim().min(2).max(20),
    registrationNumber: z.string().trim().min(3).max(30),
    routeName: z.string().trim().min(2).max(100),
    driverName: z.string().trim().min(2).max(100),
    driverContact: z.string().trim().max(40).default(""),
    driverDetails: z.string().trim().max(1000).default(""),
    startingPoint: z.string().trim().max(100).default(""),
    destination: z.string().trim().min(2).max(100).default("Campus"),
    capacity: z.coerce.number().int().min(1).max(150),
    startsAt: clock.nullable().default(null),
    scheduleEnabled: z.boolean().default(false),
    scheduleDays: z
      .array(z.number().int().min(0).max(6))
      .default([1, 2, 3, 4, 5]),
    stops: z
      .array(
        z.object({
          id: z.string().uuid().optional(),
          name: z.string().trim().min(2).max(100),
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          offsetMinutes: z.number().int().min(0).max(1440).default(0),
        }),
      )
      .max(60)
      .default([]),
  })
  .refine(
    (v) => !v.scheduleEnabled || (v.startsAt && v.scheduleDays.length > 0),
    {
      message:
        "Set a start time and operating days before enabling scheduled trips",
    },
  );

export const busSelect = `SELECT b.id,b.code,b.registration_number,b.route_name,b.driver_name,b.driver_contact,b.driver_details,b.starting_point,b.destination,b.capacity,b.starts_at,b.schedule_enabled,b.schedule_days,
  b.status,b.last_latitude,b.last_longitude,b.last_seen_at,
  (SELECT count(*)::int FROM students WHERE assigned_bus_id=b.id AND active) AS assigned_students,
  b.capacity-(SELECT count(*)::int FROM students WHERE assigned_bus_id=b.id AND active) AS remaining_seats,
  (SELECT id FROM trips WHERE bus_id=b.id AND status='ACTIVE' LIMIT 1) AS active_trip_id,
  t.id AS last_trip_id,t.started_at AS last_trip_started_at,t.arrived_at AS last_trip_arrived_at,t.status AS trip_status,t.started_at AS trip_started_at,t.arrived_at AS trip_arrived_at,
  (SELECT count(*)::int FROM bus_attendance WHERE trip_id=t.id AND status='PRESENT') AS boarded_students,
  COALESCE((SELECT json_agg(st ORDER BY st.sequence) FROM bus_stops st WHERE st.bus_id=b.id AND st.active),'[]'::json) AS stops
  FROM buses b LEFT JOIN LATERAL(SELECT * FROM trips WHERE bus_id=b.id ORDER BY started_at DESC LIMIT 1) t ON true`;

export function transportRouter(io: Server) {
  const r = Router();
  r.use(
    ["/buses", "/trips", "/students/:studentId/allocation"],
    requireAuth,
    allowRoles("ADMIN", "FACULTY", "TRANSPORT"),
  );
  const changed = () => {
    io.to("operations").emit("bus:changed");
    io.to("portal").emit("portal:changed");
  };
  r.get(
    "/buses",
    route(async (_req, res) =>
      res.json({
        buses: (
          await pool.query(
            busSelect + " WHERE b.deleted_at IS NULL ORDER BY b.code",
          )
        ).rows,
      }),
    ),
  );
  const save = route(async (req, res) => {
    const v = busSchema.parse(req.body);
    const id = req.params.busId
      ? z.string().uuid().parse(req.params.busId)
      : null;
    const secret = id ? null : generateDeviceSecret();
    const bus = await transaction(async (c) => {
      if (id) {
        const old = await c.query(
          "SELECT * FROM buses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
          [id],
        );
        if (!old.rows[0]) fail(404, "Bus not found");
        const occupied = await c.query(
          "SELECT count(*)::int AS n,max(seat_number) AS highest FROM students WHERE assigned_bus_id=$1 AND active",
          [id],
        );
        if (
          occupied.rows[0].n > v.capacity ||
          (occupied.rows[0].highest ?? 0) > v.capacity
        )
          fail(
            409,
            "Capacity cannot be lower than the allocated students or seat numbers",
          );
      }
      const fields = [
        v.code.toUpperCase(),
        v.registrationNumber.toUpperCase(),
        v.routeName,
        v.driverName,
        v.capacity,
        v.startingPoint,
        v.destination,
        v.driverContact,
        v.driverDetails,
        v.startsAt,
        v.scheduleEnabled,
        [...new Set(v.scheduleDays)],
      ];
      const result = id
        ? await c.query(
            `UPDATE buses SET code=$1,registration_number=$2,route_name=$3,driver_name=$4,capacity=$5,starting_point=$6,destination=$7,driver_contact=$8,driver_details=$9,starts_at=$10,schedule_enabled=$11,schedule_days=$12 WHERE id=$13 RETURNING id,code`,
            [...fields, id],
          )
        : await c.query(
            `INSERT INTO buses(code,registration_number,route_name,driver_name,capacity,starting_point,destination,driver_contact,driver_details,starts_at,schedule_enabled,schedule_days,device_key_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,code`,
            [...fields, hashDeviceSecret(secret!)],
          );
      const busId = result.rows[0].id;
      await c.query("UPDATE bus_stops SET active=false WHERE bus_id=$1", [
        busId,
      ]);
      for (const [sequence, st] of v.stops.entries()) {
        if (st.id) {
          const updated = await c.query(
            "UPDATE bus_stops SET name=$1,sequence=$2,latitude=$3,longitude=$4,offset_minutes=$5,active=true WHERE id=$6 AND bus_id=$7 RETURNING id",
            [
              st.name,
              sequence,
              st.latitude,
              st.longitude,
              st.offsetMinutes,
              st.id,
              busId,
            ],
          );
          if (!updated.rowCount) fail(400, "Stop does not belong to this bus");
        } else
          await c.query(
            "INSERT INTO bus_stops(bus_id,name,sequence,latitude,longitude,offset_minutes) VALUES($1,$2,$3,$4,$5,$6)",
            [
              busId,
              st.name,
              sequence,
              st.latitude,
              st.longitude,
              st.offsetMinutes,
            ],
          );
      }
      await c.query(
        "UPDATE students SET boarding_stop_id=NULL WHERE assigned_bus_id=$1 AND boarding_stop_id IN(SELECT id FROM bus_stops WHERE bus_id=$1 AND NOT active)",
        [busId],
      );
      await audit(
        c,
        req.user!.id,
        id ? "UPDATE_BUS" : "CREATE_BUS",
        "bus",
        busId,
        null,
        { ...v },
      );
      return result.rows[0];
    });
    changed();
    res
      .status(id ? 200 : 201)
      .json({
        bus,
        ...(secret
          ? {
              deviceKey: secret,
              warning:
                "Copy this device key now. It cannot be retrieved later.",
            }
          : {}),
      });
  });
  r.post("/buses", allowRoles("ADMIN", "TRANSPORT"), save);
  r.patch("/buses/:busId", allowRoles("ADMIN", "TRANSPORT"), save);
  r.post(
    "/trips",
    allowRoles("ADMIN", "TRANSPORT"),
    route(async (req, res) => {
      const { busId } = z.object({ busId: z.string().uuid() }).parse(req.body);
      const trip = await transaction(async (c) => {
        const bus = await c.query(
          "SELECT id,schedule_enabled FROM buses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
          [busId],
        );
        if (!bus.rows[0]) fail(404, "Bus not found");
        if (
          (
            await c.query(
              "SELECT id FROM trips WHERE bus_id=$1 AND status IN('ACTIVE','ARRIVED')",
              [busId],
            )
          ).rowCount
        )
          fail(409, "Complete the current trip before starting another");
        const result = await c.query(
          `INSERT INTO trips(bus_id,created_by,scheduled_date) VALUES($1,$2,CASE WHEN $3::boolean AND NOT EXISTS(SELECT 1 FROM trips WHERE bus_id=$1 AND scheduled_date=current_date) THEN current_date END) RETURNING *`,
          [busId, req.user!.id, bus.rows[0].schedule_enabled],
        );
        await snapshotTrip(c, result.rows[0].id, busId);
        await initializeManifest(c, result.rows[0].id, busId);
        await c.query(
          "UPDATE buses SET status='IN_TRANSIT',last_latitude=NULL,last_longitude=NULL,last_seen_at=NULL WHERE id=$1",
          [busId],
        );
        return result.rows[0];
      });
      io.to("operations").emit("trip:started", trip);
      io.to("portal").emit("portal:changed");
      res.status(201).json({ trip });
    }),
  );
  r.delete(
    "/buses/:busId",
    allowRoles("ADMIN", "TRANSPORT"),
    route(async (req, res) => {
      const id = z.string().uuid().parse(req.params.busId);
      await transaction(async (c) => {
        const found = await c.query(
          "SELECT * FROM buses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
          [id],
        );
        if (!found.rows[0]) fail(404, "Bus not found");
        const open = await c.query(
          "SELECT id FROM trips WHERE bus_id=$1 AND status IN('ACTIVE','ARRIVED')",
          [id],
        );
        if (open.rowCount)
          fail(409, "Complete the current trip before deleting this bus");
        await c.query(
          "UPDATE students SET assigned_bus_id=NULL,boarding_stop_id=NULL,seat_number=NULL WHERE assigned_bus_id=$1",
          [id],
        );
        await c.query(
          "UPDATE buses SET deleted_at=now(),schedule_enabled=false,status='OFFLINE' WHERE id=$1",
          [id],
        );
        await audit(
          c,
          req.user!.id,
          "REMOVE_BUS",
          "bus",
          id,
          { code: found.rows[0].code },
          { archived: true },
        );
      });
      changed();
      res.json({ deleted: true, historyPreserved: true });
    }),
  );
  r.patch(
    "/students/:studentId/allocation",
    allowRoles("ADMIN", "TRANSPORT"),
    route(async (req, res) => {
      const id = z.string().uuid().parse(req.params.studentId);
      const v = z
        .object({
          busId: z.string().uuid().nullable(),
          stopId: z.string().uuid().nullable().default(null),
          seatNumber: z.number().int().positive().nullable().default(null),
          residency: z.enum(["DAY_SCHOLAR", "HOSTEL"]).default("DAY_SCHOLAR"),
        })
        .parse(req.body);
      await transaction(async (c) => {
        if (v.busId) {
          const bus = await c.query(
            "SELECT capacity FROM buses WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
            [v.busId],
          );
          if (!bus.rows[0]) fail(404, "Bus not found");
          const count = await c.query(
            "SELECT count(*)::int AS n FROM students WHERE assigned_bus_id=$1 AND active AND id<>$2",
            [v.busId, id],
          );
          if (count.rows[0].n >= bus.rows[0].capacity)
            fail(409, "This bus has no remaining seats");
          if (v.seatNumber && v.seatNumber > bus.rows[0].capacity)
            fail(400, "Seat number exceeds bus capacity");
          if (
            v.stopId &&
            !(
              await c.query(
                "SELECT id FROM bus_stops WHERE id=$1 AND bus_id=$2 AND active",
                [v.stopId, v.busId],
              )
            ).rowCount
          )
            fail(400, "Choose a boarding stop on the assigned bus");
        } else if (v.stopId || v.seatNumber)
          fail(400, "Assign a bus before choosing a stop or seat");
        const result = await c.query(
          "UPDATE students SET assigned_bus_id=$1,boarding_stop_id=$2,seat_number=$3,residency=$4 WHERE id=$5 AND active RETURNING id",
          [v.busId, v.stopId, v.seatNumber, v.residency, id],
        );
        if (!result.rowCount) fail(404, "Student not found");
        await audit(c, req.user!.id, "ALLOCATE_BUS", "student", id, null, v);
      });
      changed();
      res.json({ allocated: true });
    }),
  );
  return r;
}

export async function startScheduledTrips(io: Server) {
  const trips = await transaction(async (c) => {
    const due =
      await c.query(`SELECT id FROM buses WHERE deleted_at IS NULL AND schedule_enabled AND starts_at<=localtime AND EXTRACT(DOW FROM now())::int=ANY(schedule_days)
   AND NOT EXISTS(SELECT 1 FROM trips WHERE bus_id=buses.id AND (status IN('ACTIVE','ARRIVED') OR scheduled_date=current_date)) FOR UPDATE SKIP LOCKED`);
    for (const b of due.rows) {
      const t = await c.query(
        "INSERT INTO trips(bus_id,scheduled_date) VALUES($1,current_date) RETURNING id",
        [b.id],
      );
      await snapshotTrip(c, t.rows[0].id, b.id);
      await initializeManifest(c, t.rows[0].id, b.id);
      await c.query(
        "UPDATE buses SET status='IN_TRANSIT',last_latitude=NULL,last_longitude=NULL,last_seen_at=NULL WHERE id=$1",
        [b.id],
      );
    }
    return due.rowCount ?? 0;
  });
  if (trips) {
    io.to("operations").emit("trip:started");
    io.to("portal").emit("portal:changed");
  }
  return trips;
}
async function initializeManifest(
  c: import("pg").PoolClient,
  tripId: string,
  busId: string,
) {
  await c.query(
    `INSERT INTO trip_manifest(trip_id,student_id,boarding_point,seat_number) SELECT $1,s.id,st.name,s.seat_number FROM students s LEFT JOIN bus_stops st ON st.id=s.boarding_stop_id WHERE s.active AND s.assigned_bus_id=$2`,
    [tripId, busId],
  );
  await c.query(
    `INSERT INTO bus_attendance(trip_id,student_id,bus_id,status,boarding_point,driver_name,vehicle_number)
  SELECT $1,m.student_id,$2,'EXPECTED',m.boarding_point,b.driver_name,b.registration_number FROM trip_manifest m JOIN buses b ON b.id=$2 WHERE m.trip_id=$1`,
    [tripId, busId],
  );
}

async function snapshotTrip(
  c: import("pg").PoolClient,
  tripId: string,
  busId: string,
) {
  await c.query(
    "UPDATE trips SET route_name=b.route_name,driver_name=b.driver_name,vehicle_number=b.registration_number,schedule_time=b.starts_at FROM buses b WHERE trips.id=$1 AND b.id=$2",
    [tripId, busId],
  );
}
