import type { PoolClient } from 'pg';

export async function synchronizeTripAttendance(client: PoolClient, tripId: string) {
  const scans = await client.query<{
    event_id: string;
    student_id: string;
    department: string;
    academic_year: number;
    section: string;
  }>(`
    SELECT DISTINCT ON (e.student_id)
      e.id AS event_id, s.id AS student_id, s.department, s.academic_year, s.section
    FROM device_events e
    JOIN students s ON s.id = e.student_id
    WHERE e.trip_id = $1 AND e.type = 'RFID_SCAN' AND e.exception_type IS NULL AND s.active = true
    ORDER BY e.student_id, e.received_at ASC
  `, [tripId]);

  let created = 0;
  let unmatched = 0;
  for (const scan of scans.rows) {
    const timetable = await client.query<{
      id: string;
      subject_code: string;
      subject_name: string;
      faculty_id: string | null;
    }>(`
      SELECT id, subject_code, subject_name, faculty_id
      FROM timetables
      WHERE department = $1 AND academic_year = $2 AND section = $3
        AND weekday = EXTRACT(DOW FROM now())::int
        AND starts_at >= (localtime - interval '30 minutes')
      ORDER BY starts_at ASC
      LIMIT 1
    `, [scan.department, scan.academic_year, scan.section]);

    const match = timetable.rows[0];
    if (!match) {
      unmatched += 1;
      await client.query(`UPDATE device_events SET exception_type = 'TIMETABLE_MISMATCH' WHERE id = $1`, [scan.event_id]);
      continue;
    }

    const session = await client.query<{ id: string }>(`
      INSERT INTO attendance_sessions (
        timetable_id, session_date, department, academic_year, section, subject_code, subject_name, faculty_id
      ) VALUES ($1, current_date, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (session_date, department, academic_year, section, subject_code)
      DO UPDATE SET subject_name = EXCLUDED.subject_name
      RETURNING id
    `, [match.id, scan.department, scan.academic_year, scan.section, match.subject_code, match.subject_name, match.faculty_id]);

    const record = await client.query(`
      INSERT INTO attendance_records (session_id, student_id, trip_id, source_event_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (session_id, student_id) DO NOTHING
      RETURNING id
    `, [session.rows[0]!.id, scan.student_id, tripId, scan.event_id]);
    created += record.rowCount ?? 0;
  }
  return { scanned: scans.rowCount ?? 0, created, unmatched };
}

