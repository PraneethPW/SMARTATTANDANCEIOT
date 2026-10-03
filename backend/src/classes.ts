import { Router } from "express";
import type { Server } from "socket.io";
import { z } from "zod";
import { allowRoles, requireAuth } from "./auth.js";
import { pool } from "./db.js";
import { audit, fail, route, transaction } from "./http.js";
import { makeChallenge, requireOpenSession } from "./verification.js";
import { normalizeRfid } from "./domain.js";

export function classesRouter(io: Server) {
  const r = Router();
  r.use("/classes", requireAuth, allowRoles("ADMIN", "FACULTY"));
  const changed = () => {
    io.to("operations").emit("attendance:updated");
    io.to("portal").emit("portal:changed");
  };
  r.get(
    "/classes/faculty",
    route(async (req, res) =>
      res.json({
        faculty: (
          await pool.query(
            "SELECT id,name FROM users WHERE role='FACULTY' AND ($1::boolean OR id=$2) ORDER BY name",
            [req.user!.role === "ADMIN", req.user!.id],
          )
        ).rows,
      }),
    ),
  );
  r.get(
    "/classes",
    route(async (req, res) => {
      const result = await pool.query(
        `SELECT t.*,u.name AS faculty_name,
  (t.weekday=EXTRACT(DOW FROM now())::int AND localtime>=t.starts_at AND localtime<t.ends_at) AS is_open,
  (SELECT id FROM attendance_sessions ats WHERE ats.timetable_id=t.id AND ats.session_date=current_date LIMIT 1) AS session_id
  FROM timetables t LEFT JOIN users u ON u.id=t.faculty_id WHERE ($1::boolean OR t.faculty_id=$2) ORDER BY t.weekday,t.starts_at`,
        [req.user!.role === "ADMIN", req.user!.id],
      );
      res.json({ classes: result.rows });
    }),
  );
  r.post(
    "/classes/:timetableId/start",
    route(async (req, res) => {
      const id = z.string().uuid().parse(req.params.timetableId);
      const session = await transaction(async (c) => {
        const timetable = await c.query(
          `SELECT *,weekday=EXTRACT(DOW FROM now())::int AND localtime>=starts_at AND localtime<ends_at AS is_open FROM timetables WHERE id=$1 FOR UPDATE`,
          [id],
        );
        const t = timetable.rows[0];
        if (!t) fail(404, "Timetable session not found");
        if (req.user!.role === "FACULTY" && t.faculty_id !== req.user!.id)
          fail(403, "This timetable belongs to another faculty member");
        if (!t.is_open)
          fail(
            409,
            "Class attendance opens at the scheduled start time and closes at the end time",
          );
        const result = await c.query(
          `INSERT INTO attendance_sessions(timetable_id,session_date,department,academic_year,section,subject_code,subject_name,faculty_id)
    VALUES($1,current_date,$2,$3,$4,$5,$6,$7) ON CONFLICT(session_date,timetable_id) WHERE timetable_id IS NOT NULL DO UPDATE SET timetable_id=EXCLUDED.timetable_id RETURNING id`,
          [
            id,
            t.department,
            t.academic_year,
            t.section,
            t.subject_code,
            t.subject_name,
            t.faculty_id,
          ],
        );
        const sessionId = result.rows[0].id;
        await c.query(
          `INSERT INTO attendance_records(session_id,student_id,source)
    SELECT $1,id,'CLASS_SESSION' FROM students WHERE active AND department=$2 AND academic_year=$3 AND section=$4 ON CONFLICT(session_id,student_id) DO NOTHING`,
          [sessionId, t.department, t.academic_year, t.section],
        );
        await audit(
          c,
          req.user!.id,
          "START_CLASS",
          "attendance_session",
          sessionId,
          null,
          { timetableId: id },
        );
        return { id: sessionId };
      });
      changed();
      res.status(201).json({ session });
    }),
  );
  r.get(
    "/classes/sessions/:id",
    route(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const session = await pool.query(
        "SELECT * FROM attendance_sessions WHERE id=$1",
        [id],
      );
      if (!session.rows[0]) fail(404, "Class session not found");
      if (
        req.user!.role === "FACULTY" &&
        session.rows[0].faculty_id !== req.user!.id
      )
        fail(403, "Class belongs to another faculty member");
      const rows = await pool.query(
        `SELECT ar.id,ar.student_id,ar.status,ar.face_verified_at,s.name,s.registration_number,s.residency,b.code AS bus_code,st.name AS boarding_point,
   (SELECT ba.status FROM bus_attendance ba JOIN trips t ON t.id=ba.trip_id WHERE ba.student_id=s.id AND t.started_at::date=$2::date ORDER BY t.started_at DESC LIMIT 1) AS bus_attendance_status
   FROM attendance_records ar JOIN students s ON s.id=ar.student_id LEFT JOIN buses b ON b.id=s.assigned_bus_id LEFT JOIN bus_stops st ON st.id=s.boarding_stop_id WHERE ar.session_id=$1 ORDER BY s.name`,
        [id, session.rows[0].session_date],
      );
      res.json({ session: session.rows[0], students: rows.rows });
    }),
  );
  r.post(
    "/classes/sessions/:id/scan",
    route(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const v = z
        .object({ rfidUid: z.string().min(4).max(64) })
        .parse(req.body);
      const challenge = await transaction(async (c) => {
        await requireOpenSession(c, id, req.user!);
        const student = await c.query(
          "SELECT s.id FROM students s JOIN attendance_records ar ON ar.student_id=s.id WHERE ar.session_id=$1 AND s.rfid_uid=$2 AND s.active",
          [id, normalizeRfid(v.rfidUid)],
        );
        if (!student.rows[0])
          fail(404, "This RFID card is not on the class roster");
        return makeChallenge(
          c,
          student.rows[0].id,
          "CLASS",
          null,
          id,
          null,
          req.user!.id,
        );
      });
      changed();
      res.status(201).json({ challenge });
    }),
  );
  return r;
}
