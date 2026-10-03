// Run through `railway run node scripts/verify-operations.mjs` to use a temporary,
// isolated schema. This script never modifies production application tables.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
const schema = "ops_test_" + Date.now() + "_" + randomBytes(3).toString("hex");
const url = new URL(process.env.DATABASE_URL);
if (url.searchParams.has("sslmode"))
  url.searchParams.set("sslmode", "verify-full");
if (url.hostname.endsWith(".neon.tech"))
  url.hostname = url.hostname.replace("-pooler.", ".");
const pool = new pg.Pool({
  connectionString: url.toString(),
  options: "-c timezone=Asia/Kolkata -c search_path=" + schema,
});
const port = Number(
    process.argv.find((a) => a.startsWith("--port="))?.slice(7) || 9091,
  ),
  base = "http://127.0.0.1:" + port,
  password = randomBytes(22).toString("base64url");
let server,
  keep = false,
  log = "";
const passed = [];
async function call(
  path,
  method = "GET",
  body,
  token,
  headers = {},
  expected = 200,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (r.headers.get("content-type") || "").includes("json")
    ? await r.json()
    : await r.text();
  assert.equal(
    r.status,
    expected,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  return data;
}
const check = (name) => {
  passed.push(name);
  console.log("PASS " + name);
};
try {
  await pool.query("CREATE SCHEMA " + schema);
  server = spawn(process.execPath, ["dist/server.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      DATABASE_SCHEMA: schema,
      APP_TIMEZONE: "Asia/Kolkata",
      JWT_SECRET: randomBytes(40).toString("hex"),
      CORS_ORIGINS: "http://localhost:5173",
      CAMPUS_LATITUDE: "9.5747",
      CAMPUS_LONGITUDE: "77.6798",
    },
  });
  server.stdout.on("data", (b) => (log += b.toString()));
  server.stderr.on("data", (b) => (log += b.toString()));
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(base + "/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error("Test server startup failed: " + log);
  check("isolated schema migrations and API health");
  await pool.query("SET search_path TO " + schema);
  const admin = await call(
    "/api/auth/bootstrap",
    "POST",
    { name: "Operations Test Admin", email: "ops.admin@example.org", password },
    undefined,
    {},
    201,
  );
  const faculty = await call(
    "/api/users",
    "POST",
    {
      name: "Operations Test Faculty",
      email: "ops.faculty@example.org",
      password,
      role: "FACULTY",
    },
    admin.token,
    {},
    201,
  );
  const transport = await call(
    "/api/users",
    "POST",
    {
      name: "Operations Test Transport",
      email: "ops.transport@example.org",
      password,
      role: "TRANSPORT",
    },
    admin.token,
    {},
    201,
  );
  const ft = (
      await call("/api/auth/login", "POST", {
        email: faculty.user.email,
        password,
      })
    ).token,
    tt = (
      await call("/api/auth/login", "POST", {
        email: transport.user.email,
        password,
      })
    ).token;
  const busInput = {
    code: "TEST-BUS",
    registrationNumber: "TEST-PLATE",
    routeName: "Test route",
    driverName: "Test driver",
    driverContact: "5550101000",
    driverDetails: "Test licence",
    capacity: 1,
    startingPoint: "Test stop",
    destination: "Campus",
    startsAt: "07:30",
    stops: [
      { name: "Test stop", latitude: 9.56, longitude: 77.67, offsetMinutes: 0 },
      {
        name: "Campus",
        latitude: 9.5747,
        longitude: 77.6798,
        offsetMinutes: 25,
      },
    ],
  };
  const b = await call("/api/buses", "POST", busInput, tt, {}, 201),
    busId = b.bus.id;
  const student = await call(
    "/api/auth/student-signup",
    "POST",
    {
      name: "Operations Test Student",
      email: "ops.student@example.org",
      password,
      registrationNumber: "OPS-S001",
      rfidUid: "04AABB01",
      department: "TEST",
      academicYear: 1,
      section: "A",
      busCode: "TEST-BUS",
      parentContact: "+91 99999 00001",
    },
    undefined,
    {},
    201,
  );
  const parent = await call(
    "/api/auth/parent-signup",
    "POST",
    {
      name: "Operations Test Parent",
      email: "ops.parent@example.org",
      password,
      registrationNumber: "ops-s001",
      parentContact: "9999900001",
    },
    undefined,
    {},
    201,
  );
  const studentId = (await call("/api/portal", "GET", undefined, student.token))
    .students[0].id;
  await call(
    "/api/auth/student-signup",
    "POST",
    {
      name: "Overflow Test Student",
      email: "overflow@example.org",
      password,
      registrationNumber: "OPS-S002",
      rfidUid: "04AABB02",
      department: "TEST",
      academicYear: 1,
      section: "A",
      busCode: "TEST-BUS",
    },
    undefined,
    {},
    409,
  );
  const hostel = await call(
    "/api/auth/student-signup",
    "POST",
    {
      name: "Operations Test Hostel",
      email: "ops.hostel@example.org",
      password,
      registrationNumber: "OPS-H001",
      rfidUid: "04AABB03",
      department: "TEST",
      academicYear: 1,
      section: "A",
      residency: "HOSTEL",
    },
    undefined,
    {},
    201,
  );
  const hostelId = (await call("/api/portal", "GET", undefined, hostel.token))
    .students[0].id;
  const bus = (await call("/api/buses", "GET", undefined, tt)).buses[0];
  assert.equal(bus.remaining_seats, 0);
  await call(
    "/api/students/" + studentId + "/allocation",
    "PATCH",
    { busId, stopId: bus.stops[0].id, seatNumber: 1 },
    tt,
  );
  check(
    "student signup, parent mobile matching, hostel signup and capacity enforcement",
  );
  await call(
    "/api/students/" + hostelId + "/allocation",
    "PATCH",
    { busId, seatNumber: 1, residency: "HOSTEL" },
    tt,
    {},
    409,
  );
  const trip = (await call("/api/trips", "POST", { busId }, tt, {}, 201)).trip;
  await call("/api/buses/" + busId, "DELETE", undefined, tt, {}, 409);
  check("active bus deletion guard and trip manifest");
  const packet = {
    busCode: "TEST-BUS",
    eventId: randomUUID(),
    type: "RFID_SCAN",
    rfidUid: "04AABB01",
    deviceTimestamp: new Date().toISOString(),
  };
  const scanned = await call(
    "/api/device/events",
    "POST",
    packet,
    undefined,
    { "X-Device-Key": b.deviceKey },
    202,
  );
  assert.ok(scanned.challenge?.id);
  const busRows = (await call("/api/bus-attendance", "GET", undefined, tt))
    .attendance;
  assert.equal(busRows[0].status, "PENDING_FACE");
  assert.equal(
    (await call("/api/attendance", "GET", undefined, ft)).attendance.length,
    0,
  );
  assert.equal(
    (await call("/api/portal", "GET", undefined, parent.token)).busAttendance[0]
      .status,
    "PENDING_FACE",
  );
  await call(
    "/api/verification/" + scanned.challenge.id + "/complete",
    "POST",
    {
      frontImage: "data:image/jpeg;base64,AAAA",
      turnImage: "data:image/jpeg;base64,AAAA",
    },
    student.token,
    {},
    409,
  );
  await call(
    "/api/verification/" + scanned.challenge.id + "/complete",
    "POST",
    {
      frontImage: "data:image/jpeg;base64,AAAA",
      turnImage: "data:image/jpeg;base64,AAAA",
    },
    hostel.token,
    {},
    403,
  );
  check(
    "RFID stays pending, no academic auto-mark, face approval and identity scope gates",
  );
  const blank =
    "data:image/jpeg;base64," +
    (
      await sharp({
        create: { width: 320, height: 240, channels: 3, background: "#ffffff" },
      })
        .jpeg()
        .toBuffer()
    ).toString("base64");
  await call(
    "/api/verification/enroll/" + studentId,
    "POST",
    { image: blank, consent: true },
    student.token,
    {},
    422,
  );
  check("real WASM face models load and reject a frame without a face");
  const now = (await pool.query("SELECT EXTRACT(DOW FROM now())::int AS day"))
    .rows[0];
  const slotInput = {
    department: "TEST",
    academicYear: 1,
    section: "A",
    weekday: now.day,
    startsAt: "00:00",
    endsAt: "23:59",
    subjectCode: "TEST101",
    subjectName: "Test class",
    facultyId: faculty.user.id,
    period: "Period 1",
    room: "TEST-ROOM",
  };
  const timetable = (
    await call("/api/timetables", "POST", slotInput, admin.token, {}, 201)
  ).timetable;
  const session = (
    await call(
      "/api/classes/" + timetable.id + "/start",
      "POST",
      undefined,
      ft,
      {},
      201,
    )
  ).session;
  const roster = await call(
    "/api/classes/sessions/" + session.id,
    "GET",
    undefined,
    ft,
  );
  const record = roster.students.find(
    (s) => s.registration_number === "OPS-S001",
  );
  await call(
    "/api/attendance/" + record.id,
    "PATCH",
    { status: "PRESENT" },
    ft,
    {},
    409,
  );
  await call("/api/attendance/" + record.id, "PATCH", { status: "ABSENT" }, ft);
  assert.equal(
    (await call("/api/portal", "GET", undefined, student.token)).attendance[0]
      .status,
    "ABSENT",
  );
  assert.equal(
    (await call("/api/portal", "GET", undefined, parent.token)).attendance[0]
      .status,
    "ABSENT",
  );
  const classScan = await call(
    "/api/classes/sessions/" + session.id + "/scan",
    "POST",
    { rfidUid: "04AABB01" },
    ft,
    {},
    201,
  );
  assert.equal(classScan.challenge.category, "CLASS");
  const next = (
    await call(
      "/api/timetables",
      "POST",
      { ...slotInput, startsAt: "00:01", period: "Period 2" },
      admin.token,
      {},
      201,
    )
  ).timetable;
  const session2 = (
    await call(
      "/api/classes/" + next.id + "/start",
      "POST",
      undefined,
      ft,
      {},
      201,
    )
  ).session;
  assert.notEqual(session.id, session2.id);
  const closed = (
    await call(
      "/api/timetables",
      "POST",
      { ...slotInput, weekday: (now.day + 1) % 7 },
      admin.token,
      {},
      201,
    )
  ).timetable;
  await call(
    "/api/classes/" + closed.id + "/start",
    "POST",
    undefined,
    ft,
    {},
    409,
  );
  await call(
    "/api/classes/" + timetable.id + "/start",
    "POST",
    undefined,
    tt,
    {},
    403,
  );
  check(
    "faculty sessions, independent repeat periods, schedule gates, and shared student/parent class records",
  );
  await call(
    "/api/device/events",
    "POST",
    {
      busCode: "TEST-BUS",
      eventId: randomUUID(),
      type: "GPS",
      latitude: 9.5601,
      longitude: 77.6701,
      deviceTimestamp: new Date().toISOString(),
    },
    undefined,
    { "X-Device-Key": b.deviceKey },
    202,
  );
  let notices = await call(
    "/api/notifications",
    "GET",
    undefined,
    student.token,
  );
  assert.equal(
    notices.notifications.filter((n) => n.kind === "STOP_REACHED").length,
    1,
  );
  await call(
    "/api/device/events",
    "POST",
    {
      busCode: "TEST-BUS",
      eventId: randomUUID(),
      type: "GPS",
      latitude: 9.5601,
      longitude: 77.6701,
      deviceTimestamp: new Date().toISOString(),
    },
    undefined,
    { "X-Device-Key": b.deviceKey },
    202,
  );
  notices = await call("/api/notifications", "GET", undefined, student.token);
  assert.equal(
    notices.notifications.filter((n) => n.kind === "STOP_REACHED").length,
    1,
  );
  assert.equal(
    (await call("/api/notifications", "GET", undefined, parent.token))
      .notifications.length,
    1,
  );
  check(
    "actual GPS persistence, boarding notifications and duplicate suppression",
  );
  const second = await call(
    "/api/buses",
    "POST",
    { ...busInput, code: "OTHER-BUS", registrationNumber: "OTHER-PLATE" },
    tt,
    {},
    201,
  );
  assert.deepEqual(
    (await call("/api/portal", "GET", undefined, parent.token)).buses.map(
      (b) => b.id,
    ),
    [busId],
  );
  await call("/api/bus-attendance", "GET", undefined, parent.token, {}, 403);
  check("parent GPS only linked buses and staff report access");
  await call("/api/trips/" + trip.id + "/arrive", "POST", {}, tt);
  await call("/api/trips/" + trip.id + "/complete", "POST", {}, tt);
  assert.equal(
    (await call("/api/bus-attendance", "GET", undefined, tt)).attendance[0]
      .status,
    "ABSENT",
  );
  await call("/api/device/events", "POST", packet, undefined, {
    "X-Device-Key": b.deviceKey,
  });
  await call("/api/buses/" + busId, "DELETE", undefined, tt);
  assert.equal(
    (await call("/api/buses", "GET", undefined, tt)).buses.some(
      (b) => b.id === busId,
    ),
    false,
  );
  const csv = await call(
    "/api/bus-attendance/export?busId=" + busId,
    "GET",
    undefined,
    tt,
  );
  assert.match(csv, /OPS-S001/);
  const report = await call("/api/analytics/transport", "GET", undefined, tt);
  assert.equal(report.trips[0].absent, 1);
  check(
    "trip close, retry idempotency, bus deletion preserving history and CSV/analytics",
  );
  await call(
    "/api/buses/" + second.bus.id,
    "PATCH",
    {
      ...busInput,
      code: "OTHER-BUS",
      registrationNumber: "OTHER-PLATE",
      startsAt: "00:00",
      scheduleEnabled: true,
      scheduleDays: [now.day],
    },
    tt,
  );
  let scheduled = false;
  for (let i = 0; i < 65; i++) {
    const buses = (await call("/api/buses", "GET", undefined, tt)).buses;
    if (buses[0]?.active_trip_id) {
      scheduled = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(scheduled);
  const n = (
    await pool.query("SELECT count(*)::int AS n FROM trips WHERE bus_id=$1", [
      second.bus.id,
    ])
  ).rows[0].n;
  assert.equal(n, 1);
  check("scheduled departure starts exactly one trip");
  if (process.argv.includes("--keep")) {
    keep = true;
    await writeFile(
      new URL("../../../operations-test-session.json", import.meta.url),
      JSON.stringify(
        {
          schema,
          port,
          pid: server.pid,
          password,
          admin,
          faculty: { ...faculty, token: ft },
          transport: { ...transport, token: tt },
          student,
          parent,
          hostel,
        },
        null,
        2,
      ),
    );
    console.log(
      "Test server retained for UI checks; session saved locally outside the repository.",
    );
  }
  console.log("Verified " + passed.length + " integration groups.");
} finally {
  if (!keep) {
    server?.kill();
    await pool.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
  }
  await pool.end();
  if (keep) server.unref();
}
