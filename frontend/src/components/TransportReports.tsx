import { useCallback, useEffect, useState } from "react";
import { API_URL, api } from "../api";
import type { Bus, BusAttendance } from "../types";
import { displayTime } from "./AttendanceCategories";
export async function downloadCsv(busId: string, token: string) {
  const response = await fetch(
    API_URL + "/api/bus-attendance/export?busId=" + encodeURIComponent(busId),
    { headers: { Authorization: "Bearer " + token } },
  );
  if (!response.ok)
    throw new Error((await response.json()).error || "Export failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bus-attendance-" + busId + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function TransportReports({
  token,
  buses,
  revision,
}: {
  token: string;
  revision: number;
  buses: Bus[];
}) {
  const [reportBuses, setReportBuses] = useState<
    {
      id: string;
      code: string;
      route_name: string;
      deleted_at: string | null;
    }[]
  >([]);
  useEffect(() => {
    void api<{ buses: typeof reportBuses }>(
      "/api/bus-attendance/buses",
      {},
      token,
    )
      .then((r) => setReportBuses(r.buses))
      .catch(() => {});
  }, [token, buses]);
  const [rows, setRows] = useState<BusAttendance[]>([]),
    [busId, setBusId] = useState(""),
    [error, setError] = useState("");
  const refresh = useCallback(
    () =>
      api<{ attendance: BusAttendance[] }>(
        "/api/bus-attendance" + (busId ? "?busId=" + busId : ""),
        {},
        token,
      )
        .then((x) => setRows(x.attendance))
        .catch((e) => setError(e.message)),
    [busId, token, revision],
  );
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => clearInterval(timer);
  }, [refresh]);
  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <span className="section-kicker">TRANSPORT EVIDENCE</span>
          <h2>Bus attendance</h2>
          <p>
            Only RFID + face verification completes boarding. Class attendance
            is recorded separately.
          </p>
        </div>
      </div>
      <div className="table-toolbar">
        <label>
          Bus
          <select value={busId} onChange={(e) => setBusId(e.target.value)}>
            <option value="">All buses</option>
            {reportBuses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.route_name}
                {b.deleted_at ? " · Archived" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button button-primary button-compact"
          disabled={!busId}
          onClick={() =>
            void downloadCsv(busId, token).catch((e) => setError(e.message))
          }
        >
          Download bus CSV
        </button>
        <button className="portal-text-button" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              {[
                "Student",
                "Bus / driver",
                "Boarding point",
                "Status",
                "Boarding time",
                "Arrival",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.student_name}
                  <small>{r.registration_number}</small>
                </td>
                <td>
                  {r.bus_code}
                  <small>
                    {r.vehicle_number} · {r.driver_name}
                  </small>
                </td>
                <td>{r.boarding_point || "Not configured"}</td>
                <td>
                  <span
                    className={
                      "portal-badge " + (r.status === "ABSENT" ? "warn" : "")
                    }
                  >
                    {r.status.replaceAll("_", " ")}
                  </span>
                  <small>
                    {r.face_verified_at
                      ? "Face verified"
                      : "No face verification"}
                  </small>
                </td>
                <td>{displayTime(r.boarded_at)}</td>
                <td>{displayTime(r.arrived_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="portal-empty">
            Bus attendance appears when a trip starts and students scan.
          </p>
        )}
      </div>
    </div>
  );
}
