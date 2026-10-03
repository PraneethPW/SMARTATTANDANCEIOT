import { Router } from "express";
import { z } from "zod";
import { allowRoles, requireAuth } from "./auth.js";
import { pool } from "./db.js";
import { route } from "./http.js";
import { csvCell } from "./csv.js";
export const busAttendanceSelect = `SELECT ba.id,ba.student_id,ba.trip_id,ba.bus_id,ba.status,ba.boarding_point,ba.boarded_at,ba.arrived_at,ba.face_verified_at,ba.driver_name,ba.vehicle_number,
  s.name AS student_name,s.registration_number,b.code AS bus_code,COALESCE(t.route_name,b.route_name) AS route_name,t.started_at,t.status AS trip_status
  FROM bus_attendance ba JOIN students s ON s.id=ba.student_id JOIN buses b ON b.id=ba.bus_id JOIN trips t ON t.id=ba.trip_id`;
export function reportsRouter() {
  const r = Router();
  r.use(
    ["/bus-attendance", "/analytics/transport"],
    requireAuth,
    allowRoles("ADMIN", "FACULTY", "TRANSPORT"),
  );
  r.get(
    "/bus-attendance/buses",
    route(async (_req, res) =>
      res.json({
        buses: (
          await pool.query(
            "SELECT id,code,route_name,deleted_at FROM buses ORDER BY code",
          )
        ).rows,
      }),
    ),
  );
  r.get(
    "/bus-attendance",
    route(async (req, res) => {
      const id = z.string().uuid().optional().parse(req.query.busId);
      const result = await pool.query(
        busAttendanceSelect +
          " WHERE ($1::uuid IS NULL OR ba.bus_id=$1) ORDER BY t.started_at DESC,s.name LIMIT 2000",
        [id ?? null],
      );
      res.json({ attendance: result.rows });
    }),
  );
  r.get(
    "/bus-attendance/export",
    route(async (req, res) => {
      const id = z.string().uuid().parse(req.query.busId);
      const result = await pool.query(
        busAttendanceSelect +
          " WHERE ba.bus_id=$1 ORDER BY t.started_at DESC,s.name LIMIT 20000",
        [id],
      );
      const keys = [
        "student_name",
        "registration_number",
        "bus_code",
        "vehicle_number",
        "driver_name",
        "route_name",
        "boarding_point",
        "status",
        "boarded_at",
        "arrived_at",
        "face_verified_at",
        "trip_status",
      ];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="bus-${id}-attendance.csv"`,
      );
      res.send(
        "\uFEFF" +
          [
            keys.map(csvCell).join(","),
            ...result.rows.map((row) =>
              keys
                .map((k) =>
                  csvCell(
                    row[k] instanceof Date ? row[k].toISOString() : row[k],
                  ),
                )
                .join(","),
            ),
          ].join("\r\n"),
      );
    }),
  );
  r.get(
    "/analytics/transport",
    route(async (_req, res) => {
      const [buses, trips, trend, classes] = await Promise.all([
        pool.query(`SELECT b.code,b.registration_number,b.driver_name,b.route_name,b.starts_at,b.capacity,
    count(s.id)::int AS assigned,b.capacity-count(s.id)::int AS remaining FROM buses b LEFT JOIN students s ON s.assigned_bus_id=b.id AND s.active WHERE b.deleted_at IS NULL GROUP BY b.id ORDER BY b.code`),
        pool.query(`SELECT t.id,b.code,COALESCE(t.vehicle_number,b.registration_number) AS registration_number,COALESCE(t.driver_name,b.driver_name) AS driver_name,COALESCE(t.route_name,b.route_name) AS route_name,t.schedule_time,t.started_at,t.arrived_at,t.completed_at,t.status,
    count(ba.id)::int AS assigned,count(ba.id) FILTER(WHERE ba.status='PRESENT')::int AS present,
    count(ba.id) FILTER(WHERE ba.status='ABSENT')::int AS absent,count(ba.id) FILTER(WHERE ba.status IN('EXPECTED','PENDING_FACE'))::int AS pending
    FROM trips t JOIN buses b ON b.id=t.bus_id LEFT JOIN bus_attendance ba ON ba.trip_id=t.id WHERE t.started_at>now()-interval '30 days' GROUP BY t.id,b.id ORDER BY t.started_at DESC LIMIT 2000`),
        pool.query(`SELECT to_char(t.started_at::date,'YYYY-MM-DD') AS day,count(*) FILTER(WHERE ba.status='PRESENT')::int AS present,count(*) FILTER(WHERE ba.status='ABSENT')::int AS absent
    FROM bus_attendance ba JOIN trips t ON t.id=ba.trip_id WHERE t.started_at>now()-interval '30 days' GROUP BY t.started_at::date ORDER BY t.started_at::date`),
        pool.query(`SELECT to_char(s.session_date,'YYYY-MM-DD') AS day,count(*) FILTER(WHERE ar.status='PRESENT')::int AS present,count(*) FILTER(WHERE ar.status='ABSENT')::int AS absent
    FROM attendance_records ar JOIN attendance_sessions s ON s.id=ar.session_id WHERE s.session_date>=current_date-30 GROUP BY s.session_date ORDER BY s.session_date`),
      ]);
      res.json({
        buses: buses.rows,
        trips: trips.rows.map((t) => ({
          ...t,
          attendance_percentage: t.assigned
            ? Math.round((t.present / t.assigned) * 100)
            : null,
        })),
        busTrend: trend.rows,
        classTrend: classes.rows,
        generatedAt: new Date().toISOString(),
      });
    }),
  );
  return r;
}
