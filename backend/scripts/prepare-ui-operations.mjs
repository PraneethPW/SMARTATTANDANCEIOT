import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const file = new URL("../../../operations-test-session.json", import.meta.url),
  s = JSON.parse(await readFile(file, "utf8"));
if (!/^ops_test_/.test(s.schema))
  throw new Error("Only isolated operations test sessions are allowed");
const base = "http://127.0.0.1:" + s.port;
const call = async (
  path,
  method = "GET",
  body,
  token = s.transport.token,
  extra = {},
) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(path + ": " + data.error);
  return data;
};
const created = await call("/api/buses", "POST", {
  code: "UI-BUS",
  registrationNumber: "TEST-UI-PLATE",
  routeName: "Test north route",
  driverName: "Test campus driver",
  driverContact: "5550101000",
  driverDetails: "Isolated test record",
  capacity: 4,
  startingPoint: "Test north stop",
  destination: "Campus",
  startsAt: "07:30",
  stops: [
    {
      name: "Test north stop",
      latitude: 9.56,
      longitude: 77.67,
      offsetMinutes: 0,
    },
    {
      name: "Test east stop",
      latitude: 9.567,
      longitude: 77.676,
      offsetMinutes: 12,
    },
    { name: "Campus", latitude: 9.5747, longitude: 77.6798, offsetMinutes: 25 },
  ],
});
const buses = (await call("/api/buses")).buses,
  bus = buses.find((b) => b.id === created.bus.id),
  student = (await call("/api/portal", "GET", undefined, s.student.token))
    .students[0];
await call("/api/students/" + student.id + "/allocation", "PATCH", {
  busId: bus.id,
  stopId: bus.stops[0].id,
  seatNumber: 1,
});
await call("/api/trips", "POST", { busId: bus.id });
await call(
  "/api/device/events",
  "POST",
  {
    busCode: bus.code,
    eventId: randomUUID(),
    type: "GPS",
    latitude: 9.5601,
    longitude: 77.6701,
    deviceTimestamp: new Date().toISOString(),
  },
  null,
  { "X-Device-Key": created.deviceKey },
);
s.ui = { busId: bus.id, deviceKey: created.deviceKey };
await writeFile(file, JSON.stringify(s, null, 2));
console.log("Isolated UI bus, allocation and GPS packet are ready.");
