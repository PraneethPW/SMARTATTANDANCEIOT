import pg from "pg";
import { writeFile } from "node:fs/promises";
const url = new URL(process.env.DATABASE_URL);
if (url.searchParams.has("sslmode"))
  url.searchParams.set("sslmode", "verify-full");
const pool = new pg.Pool({ connectionString: url.toString() });
try {
  const counts = (
    await pool.query(
      `SELECT (SELECT count(*)::int FROM public.users) AS users,(SELECT count(*)::int FROM public.students) AS students,(SELECT count(*)::int FROM public.buses) AS buses,(SELECT count(*)::int FROM public.trips) AS trips,(SELECT count(*)::int FROM public.attendance_records) AS class_records,(SELECT count(*)::int FROM public.device_events) AS device_events`,
    )
  ).rows[0];
  const duplicatePeriods = (
    await pool.query(
      "SELECT count(*)::int AS n FROM(SELECT session_date,timetable_id FROM public.attendance_sessions WHERE timetable_id IS NOT NULL GROUP BY session_date,timetable_id HAVING count(*)>1) q",
    )
  ).rows[0].n;
  await writeFile(
    new URL("../../../operations-production-baseline.json", import.meta.url),
    JSON.stringify(
      { counts, duplicatePeriods, checkedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ counts, duplicatePeriods }));
  if (duplicatePeriods)
    throw new Error(
      "Existing timetable periods have duplicate sessions; resolve migration strategy before deploying.",
    );
} finally {
  await pool.end();
}
