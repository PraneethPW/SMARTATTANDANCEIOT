import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
type Report = {
  generatedAt: string;
  buses: {
    code: string;
    registration_number: string;
    driver_name: string;
    route_name: string;
    starts_at: string | null;
    capacity: number;
    assigned: number;
    remaining: number;
  }[];
  trips: {
    id: string;
    code: string;
    registration_number: string;
    driver_name: string;
    route_name: string;
    schedule_time: string | null;
    started_at: string;
    arrived_at: string | null;
    completed_at: string | null;
    status: string;
    assigned: number;
    present: number;
    absent: number;
    pending: number;
    attendance_percentage: number | null;
  }[];
  busTrend: { day: string; present: number; absent: number }[];
  classTrend: { day: string; present: number; absent: number }[];
};
const chartStyle = {
  background: "#111d30",
  border: "1px solid #ffffff20",
  borderRadius: 8,
  color: "#eaf4ff",
};
export default function OperationsAnalytics({ token }: { token: string }) {
  const [data, setData] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [analysis, setAnalysis] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const refresh = () =>
      void api<Report>("/api/analytics/transport", {}, token)
        .then(setData)
        .catch((e) => setError(e.message));
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [token]);
  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ analysis: string }>(
        "/api/ai/insights",
        {
          method: "POST",
          body: JSON.stringify({
            question:
              "Prepare a concise report of bus utilisation, verified bus attendance, independent class attendance, missing evidence and transport operations. State limitations and use only provided aggregates.",
          }),
        },
        token,
      );
      setAnalysis(r.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI report unavailable");
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    if (!data) return;
    const body = [
      "# Campus attendance and transport report",
      "Generated " + data.generatedAt,
      "",
      "## Fleet",
      ...data.buses.map(
        (b) =>
          `${b.code} | ${b.registration_number} | ${b.driver_name} | ${b.route_name} | Departure ${b.starts_at || "not configured"} | Assigned ${b.assigned}/${b.capacity} | Free ${b.remaining}`,
      ),
      "",
      "## Trips (last 30 days)",
      ...data.trips.map(
        (t) =>
          `${t.code} | ${t.registration_number} | ${t.driver_name} | ${t.route_name} | Scheduled ${t.schedule_time || "not configured"} | Start ${t.started_at} | Arrival ${t.arrived_at || "not received"} | Exit ${t.completed_at || "not completed"} | Assigned ${t.assigned} | Present ${t.present} | Absent ${t.absent} | Pending ${t.pending} | Attendance ${t.attendance_percentage === null ? "n/a" : t.attendance_percentage + "%"} | ${t.status}`,
      ),
      "",
      "## AI-supported interpretation",
      analysis ||
        "AI interpretation has not been generated. Numeric summaries above are database aggregates.",
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([body], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "campus-transport-report.md";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <span className="section-kicker">REAL DATABASE ANALYTICS</span>
          <h2>Attendance & transport report</h2>
          <p>
            Bus and class attendance are analysed separately. Trips still in
            progress retain pending students.
          </p>
        </div>
        <button
          disabled={!data}
          className="button button-ghost button-compact"
          onClick={download}
        >
          Download report
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {data && (
        <>
          <section className="registry-summary">
            <div>
              <span>Buses</span>
              <strong>{data.buses.length}</strong>
            </div>
            <div>
              <span>Assigned seats</span>
              <strong>{data.buses.reduce((n, b) => n + b.assigned, 0)}</strong>
            </div>
            <div>
              <span>Available seats</span>
              <strong>{data.buses.reduce((n, b) => n + b.remaining, 0)}</strong>
            </div>
            <div>
              <span>Trips / 30 days</span>
              <strong>{data.trips.length}</strong>
            </div>
          </section>
          <section className="chart-grid">
            {[
              ["Bus attendance", data.busTrend],
              ["Class attendance", data.classTrend],
            ].map(([name, trend]) => (
              <section className="dash-card" key={name as string}>
                <div className="card-head">
                  <h3>{name as string} · 30 days</h3>
                </div>
                {(trend as Report["busTrend"]).length ? (
                  <ResponsiveContainer width="100%" height={230}>
                    <LineChart data={trend as Report["busTrend"]}>
                      <CartesianGrid stroke="#ffffff0c" />
                      <XAxis
                        dataKey="day"
                        stroke="#7d91a6"
                        tickFormatter={(d) => String(d).slice(5)}
                      />
                      <YAxis allowDecimals={false} stroke="#7d91a6" />
                      <Tooltip contentStyle={chartStyle} />
                      <Line name="Present" dataKey="present" stroke="#77f4d0" />
                      <Line name="Absent" dataKey="absent" stroke="#ff7a9b" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="portal-empty">
                    No records in this category yet.
                  </div>
                )}
              </section>
            ))}
          </section>
          <section className="dash-card">
            <div className="card-head">
              <h3>Bus seat utilisation</h3>
              <span>
                Current allocations; independent of completed attendance.
              </span>
            </div>
            {data.buses.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.buses}>
                  <CartesianGrid stroke="#ffffff0c" />
                  <XAxis dataKey="code" stroke="#7d91a6" />
                  <YAxis allowDecimals={false} stroke="#7d91a6" />
                  <Tooltip contentStyle={chartStyle} />
                  <Bar
                    name="Occupied seats"
                    dataKey="assigned"
                    stackId="seats"
                    fill="#77f4d0"
                  />
                  <Bar
                    name="Remaining seats"
                    dataKey="remaining"
                    stackId="seats"
                    fill="#435c79"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="portal-empty">No active buses configured.</div>
            )}
          </section>
          <section className="dash-card">
            <div className="card-head">
              <h3>Trip summary</h3>
              <span>
                Attendance = verified Present ÷ assigned manifest. Pending scans
                are not completed attendance.
              </span>
            </div>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Bus / vehicle</th>
                    <th>Driver / route</th>
                    <th>Start / arrival / exit</th>
                    <th>Assigned</th>
                    <th>Present / absent / pending</th>
                    <th>Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trips.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.code}
                        <small>{t.registration_number}</small>
                      </td>
                      <td>
                        {t.driver_name}
                        <small>{t.route_name}</small>
                      </td>
                      <td>
                        {new Date(t.started_at).toLocaleString()}
                        <small>
                          Scheduled:{" "}
                          {t.schedule_time?.slice(0, 5) || "Not configured"}
                        </small>
                        <small>
                          Arrival:{" "}
                          {t.arrived_at
                            ? new Date(t.arrived_at).toLocaleTimeString()
                            : "Awaiting"}{" "}
                          · Exit:{" "}
                          {t.completed_at
                            ? new Date(t.completed_at).toLocaleTimeString()
                            : "Open"}
                        </small>
                      </td>
                      <td>{t.assigned}</td>
                      <td>
                        {t.present} / {t.absent} / {t.pending}
                      </td>
                      <td>
                        {t.attendance_percentage === null
                          ? "—"
                          : t.attendance_percentage + "%"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="dash-card">
            <div className="card-head">
              <div>
                <h3>AI-supported interpretation</h3>
                <span>
                  Anonymous aggregates only. Requires the campus AI service to
                  be configured.
                </span>
              </div>
              <button
                className="button button-primary button-compact"
                disabled={busy}
                onClick={() => void generate()}
              >
                {busy ? "Generating…" : "Generate AI report"}
              </button>
            </div>
            <p className="analysis-text">
              {analysis ||
                "Generate an interpretation of the real attendance and transport data, then download the complete report."}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
