import type { PoolClient } from "pg";
// Arrival updates transport attendance only. Academic attendance is opened by Faculty.
export async function synchronizeTripAttendance(
  client: PoolClient,
  tripId: string,
) {
  const result = await client.query(
    `UPDATE bus_attendance SET arrived_at=now() WHERE trip_id=$1 AND status='PRESENT' RETURNING id`,
    [tripId],
  );
  return { scanned: result.rowCount ?? 0, created: 0, unmatched: 0 };
}
