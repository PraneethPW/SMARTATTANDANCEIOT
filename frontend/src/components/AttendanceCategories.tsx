import { useState } from "react";
import type { BusAttendance } from "../types";
export const displayDate = (v: string) =>
  new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T12:00:00" : v,
  ).toLocaleDateString();
export const displayTime = (v: string | null) =>
  v ? new Date(v).toLocaleString() : "—";
type Academic = {
  id: string;
  status: string;
  subject_name: string;
  subject_code: string;
  session_date: string;
  face_verified_at?: string | null;
};
export default function AttendanceCategories({
  classes,
  bus,
  hostel = [],
  isHostel = false,
}: {
  classes: Academic[];
  bus: BusAttendance[];
  isHostel?: boolean;
  hostel?: { id: string; attendance_date: string; verified_at: string }[];
}) {
  const [category, setCategory] = useState("CLASS");
  const reviewed = classes.filter((x) => x.status !== "PROVISIONAL");
  const completed = bus.filter((x) => ["PRESENT", "ABSENT"].includes(x.status));
  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <span className="section-kicker">INDEPENDENT ATTENDANCE RECORDS</span>
          <h2>Attendance history</h2>
          <p>
            Bus boarding and academic attendance have their own records and
            percentages.
          </p>
        </div>
      </div>
      <div className="filter-pills">
        {["CLASS", "BUS", ...(hostel.length || isHostel ? ["HOSTEL"] : [])].map(
          (x) => (
            <button
              key={x}
              className={category === x ? "active" : ""}
              onClick={() => setCategory(x)}
            >
              {x === "CLASS"
                ? "Class attendance"
                : x === "BUS"
                  ? "Bus attendance"
                  : "Hostel attendance"}
            </button>
          ),
        )}
      </div>
      {category === "CLASS" ? (
        <>
          <div className="metric-line">
            Class attendance:{" "}
            <strong>
              {reviewed.length
                ? Math.round(
                    (reviewed.filter((x) => x.status === "PRESENT").length /
                      reviewed.length) *
                      100,
                  ) + "%"
                : "No reviewed sessions"}
            </strong>
            <small>
              {reviewed.length} reviewed sessions; pending records excluded
            </small>
          </div>
          <div className="portal-list">
            {classes.map((x) => (
              <div className="portal-list-row" key={x.id}>
                <div>
                  <strong>{x.subject_name || x.subject_code}</strong>
                  <small>
                    {displayDate(x.session_date)} · Class attendance ·{" "}
                    {x.face_verified_at
                      ? "RFID + face verified"
                      : x.status === "PROVISIONAL"
                        ? "Awaiting class verification"
                        : x.status === "ABSENT" || x.status === "EXCUSED"
                          ? "Faculty decision · no face check recorded"
                          : "Historical record · no face check recorded"}
                  </small>
                </div>
                <span
                  className={"portal-badge status-" + x.status.toLowerCase()}
                >
                  {x.status}
                </span>
              </div>
            ))}
            {!classes.length && (
              <div className="portal-empty">No class attendance recorded.</div>
            )}
          </div>
        </>
      ) : category === "BUS" ? (
        <>
          <div className="metric-line">
            Bus attendance:{" "}
            <strong>
              {completed.length
                ? Math.round(
                    (completed.filter((x) => x.status === "PRESENT").length /
                      completed.length) *
                      100,
                  ) + "%"
                : "No completed boarding records"}
            </strong>
            <small>
              {completed.length} verified/closed-trip records; pending and
              legacy scans excluded
            </small>
          </div>
          <div className="portal-list">
            {bus.map((x) => (
              <div className="portal-list-row" key={x.id}>
                <div>
                  <strong>
                    {x.bus_code} · {x.route_name}
                  </strong>
                  <small>
                    {displayTime(x.started_at)} ·{" "}
                    {x.boarding_point || "Boarding point not assigned"}
                    <br />
                    Boarding: {displayTime(x.boarded_at)} · Arrival:{" "}
                    {displayTime(x.arrived_at)}
                    <br />
                    {x.driver_name} · {x.vehicle_number} ·{" "}
                    {x.face_verified_at ? "Face verified" : "Face not verified"}
                  </small>
                </div>
                <span
                  className={
                    "portal-badge " + (x.status === "ABSENT" ? "warn" : "")
                  }
                >
                  {x.status.replaceAll("_", " ")}
                </span>
              </div>
            ))}
            {!bus.length && (
              <div className="portal-empty">No bus attendance recorded.</div>
            )}
          </div>
        </>
      ) : (
        <div className="portal-list">
          {hostel.map((x) => (
            <div className="portal-list-row" key={x.id}>
              <div>
                <strong>Hostel · {displayDate(x.attendance_date)}</strong>
                <small>
                  RFID + face verified · {displayTime(x.verified_at)}
                </small>
              </div>
              <span className="portal-badge">Present</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
