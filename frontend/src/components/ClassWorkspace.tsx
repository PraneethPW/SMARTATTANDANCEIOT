import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api } from "../api";
import { FaceChecks, FaceEnrollmentReview } from "./FaceVerification";

type ClassSlot = {
  id: string;
  subject_name: string;
  subject_code: string;
  department: string;
  academic_year: number;
  section: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  period: string;
  room: string;
  faculty_name: string;
  is_open: boolean;
  session_id: string | null;
};
type RosterRow = {
  id: string;
  name: string;
  registration_number: string;
  status: string;
  face_verified_at: string | null;
  bus_code: string | null;
  boarding_point: string | null;
  bus_attendance_status: string | null;
  residency: string;
};
export default function ClassWorkspace({
  token,
  onChanged,
  revision,
}: {
  token: string;
  revision: number;
  onChanged: () => void;
}) {
  const [classes, setClasses] = useState<ClassSlot[]>([]),
    [selected, setSelected] = useState(""),
    [rows, setRows] = useState<RosterRow[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const slot = classes.find((c) => c.id === selected);
  const selection = useRef("");
  const [loaded, setLoaded] = useState(false),
    [rosterLoaded, setRosterLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const data = await api<{ classes: ClassSlot[] }>(
        "/api/classes",
        {},
        token,
      );
      if (selection.current !== selected) return;
      setClasses(data.classes);
      setLoaded(true);
      const s = data.classes.find((c) => c.id === selected);
      if (s?.session_id) {
        const roster = await api<{ students: RosterRow[] }>(
          "/api/classes/sessions/" + s.session_id,
          {},
          token,
        );
        if (selection.current !== selected) return;
        setRows(roster.students);
        setRosterLoaded(true);
      } else setRows([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load classes");
    }
  }, [selected, token, revision]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await api(
        "/api/classes/" + selected + "/start",
        { method: "POST" },
        token,
      );
      await refresh();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start class");
    } finally {
      setBusy(false);
    }
  };
  const scan = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!slot?.session_id) return;
    const form = e.currentTarget;
    setError("");
    try {
      await api(
        "/api/classes/sessions/" + slot.session_id + "/scan",
        {
          method: "POST",
          body: JSON.stringify({ rfidUid: new FormData(form).get("rfidUid") }),
        },
        token,
      );
      setMessage(
        "RFID received. Complete the face check before confirming Present.",
      );
      form.reset();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "RFID scan failed");
    }
  };
  const mark = async (id: string, status: string) => {
    setError("");
    try {
      await api(
        "/api/attendance/" + id,
        { method: "PATCH", body: JSON.stringify({ status }) },
        token,
      );
      await refresh();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Attendance update failed");
    }
  };
  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <span className="section-kicker">FACULTY CLASS ATTENDANCE</span>
          <h2>Classroom attendance</h2>
          <p>
            Timetable opens the session. Classroom RFID and face verification
            provide evidence; faculty confirms the academic record.
          </p>
        </div>
      </div>
      <section className="dash-card">
        <div className="allocation-form">
          <label>
            Assigned class / period
            <select
              value={selected}
              onChange={(e) => {
                selection.current = e.target.value;
                setSelected(e.target.value);
                setRows([]);
                setRosterLoaded(false);
                setMessage("");
                setError("");
              }}
            >
              <option value="">Choose your class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][c.weekday]}{" "}
                  {c.starts_at.slice(0, 5)} · {c.subject_code} · {c.department}{" "}
                  Y{c.academic_year}-{c.section}
                  {c.period ? " · " + c.period : ""}
                  {c.is_open ? " · OPEN" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        {slot && (
          <div className="class-session-header">
            <div>
              <strong>{slot.subject_name}</strong>
              <p>
                {slot.starts_at.slice(0, 5)}–{slot.ends_at.slice(0, 5)} ·{" "}
                {slot.faculty_name} · {slot.room || "Room not configured"}
              </p>
              <span className="portal-badge">
                {slot.is_open
                  ? "Attendance open"
                  : "Outside scheduled class time"}
              </span>
            </div>
            <button
              className="button button-primary button-compact"
              disabled={!slot.is_open || busy}
              onClick={() => void start()}
            >
              {busy
                ? "Opening…"
                : slot.session_id
                  ? "Refresh class roster"
                  : "Start class attendance"}
            </button>
          </div>
        )}
        {!loaded && !error && (
          <p className="portal-empty">Loading assigned classes…</p>
        )}
        {loaded && !classes.length && (
          <div className="portal-empty">
            No timetable is assigned to this account. Add a timetable in
            Registry or ask an administrator to assign it.
          </div>
        )}
        {slot?.session_id && (
          <form className="rfid-form" onSubmit={(e) => void scan(e)}>
            <label>
              Classroom RFID reader
              <input
                name="rfidUid"
                required
                minLength={4}
                autoComplete="off"
                placeholder="Scan or enter the student card UID"
                disabled={!slot.is_open}
              />
            </label>
            <button
              className="button button-primary button-compact"
              disabled={!slot.is_open}
            >
              Receive RFID scan
            </button>
          </form>
        )}
        {error && <p className="form-error">{error}</p>}
        {message && <p className="parent-link-success">{message}</p>}
      </section>
      {slot?.session_id && (
        <section className="dash-card">
          <div className="card-head">
            <div>
              <h3>Class roster · {rows.length} students</h3>
              <span>
                Bus evidence is shown separately and does not mark class
                attendance.
              </span>
            </div>
          </div>
          <div className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Transport evidence</th>
                  <th>Class face check</th>
                  <th>Class status</th>
                  <th>Faculty action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <small>{r.registration_number}</small>
                    </td>
                    <td>
                      {r.residency === "HOSTEL"
                        ? "Hostel student"
                        : r.bus_code || "No bus assigned"}
                      <small>
                        {r.bus_attendance_status?.replaceAll("_", " ") ||
                          "No bus attendance today"}{" "}
                        · {r.boarding_point || "No stop selected"}
                      </small>
                    </td>
                    <td>
                      {r.face_verified_at
                        ? "RFID + face verified"
                        : "Waiting for classroom RFID + face"}
                    </td>
                    <td>{r.status}</td>
                    <td>
                      <div className="split-actions">
                        {["PRESENT", "ABSENT", "EXCUSED"].map((s) => (
                          <button
                            key={s}
                            className="portal-text-button"
                            disabled={
                              !slot.is_open ||
                              (s === "PRESENT" && !r.face_verified_at) ||
                              r.status === s
                            }
                            onClick={() => void mark(r.id, s)}
                          >
                            {s.toLowerCase()}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rosterLoaded && (
            <p className="portal-empty">Loading class roster…</p>
          )}
          {rosterLoaded && !rows.length && (
            <div className="portal-empty">
              No active students match this department, year and section.
            </div>
          )}
        </section>
      )}
      <FaceChecks token={token} />
    </div>
  );
}
export function VerificationWorkspace({
  token,
  canApprove,
}: {
  token: string;
  canApprove: boolean;
}) {
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const scan = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    try {
      await api(
        "/api/hostel/scan",
        {
          method: "POST",
          body: JSON.stringify({ rfidUid: new FormData(form).get("rfidUid") }),
        },
        token,
      );
      setMessage("Hostel RFID received. Complete face verification below.");
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hostel RFID rejected");
    }
  };
  return (
    <div className="page-stack">
      <section className="dash-card">
        <div className="card-head">
          <div>
            <h3>Hostel RFID attendance</h3>
            <span>
              For registered hostel students. Hostel, bus and class attendance
              remain independent.
            </span>
          </div>
        </div>
        <form className="rfid-form" onSubmit={(e) => void scan(e)}>
          <label>
            Hostel RFID reader
            <input
              required
              name="rfidUid"
              minLength={4}
              placeholder="Scan student card"
              autoComplete="off"
            />
          </label>
          <button className="button button-primary button-compact">
            Receive hostel scan
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}
        {message && <p className="parent-link-success">{message}</p>}
      </section>
      <FaceChecks token={token} />
      {canApprove && <FaceEnrollmentReview token={token} />}
    </div>
  );
}
