import { useState, type FormEvent } from "react";
import { Plus, X, MapPin, BusFront, Pencil, Trash2 } from "lucide-react";
import { api } from "../api";
import type { Bus, Student, BusStop } from "../types";
import JourneyMap from "./JourneyMap";
import { plannedStopTime } from "../transport-time";
import { downloadCsv } from "./TransportReports";

type StopInput = {
  id?: string;
  name: string;
  latitude: number | string;
  longitude: number | string;
  offsetMinutes: number;
};
export function BusEditor({
  bus,
  token,
  onClose,
  onSaved,
}: {
  bus: Bus | null;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [stops, setStops] = useState<StopInput[]>(
    bus?.stops.map((s) => ({
      id: s.id,
      name: s.name,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      offsetMinutes: s.offset_minutes,
    })) || [],
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(""),
    [days, setDays] = useState(bus?.schedule_days || [1, 2, 3, 4, 5]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const payload = {
      code: d.get("code"),
      registrationNumber: d.get("registrationNumber"),
      routeName: d.get("routeName"),
      driverName: d.get("driverName"),
      driverContact: d.get("driverContact"),
      driverDetails: d.get("driverDetails"),
      capacity: Number(d.get("capacity")),
      startingPoint: d.get("startingPoint"),
      destination: d.get("destination"),
      startsAt: d.get("startsAt") || null,
      scheduleEnabled: d.get("scheduleEnabled") === "on",
      scheduleDays: days,
      stops: stops.map((s) => ({
        ...s,
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
      })),
    };
    try {
      const result = await api<{ deviceKey?: string }>(
        "/api/buses" + (bus ? "/" + bus.id : ""),
        { method: bus ? "PATCH" : "POST", body: JSON.stringify(payload) },
        token,
      );
      onSaved();
      if (result.deviceKey) setKey(result.deviceKey);
      else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bus save failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel-backdrop">
      <aside className="side-panel bus-editor">
        <div className="panel-head">
          <div>
            <span className="section-kicker">TRANSPORT CONFIGURATION</span>
            <h2>{bus ? "Edit " + bus.code : "Register a bus"}</h2>
            <p>Route, driver, stops and scheduled trip settings.</p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close bus editor"
          >
            <X />
          </button>
        </div>
        {key ? (
          <div className="panel-form">
            <h3>Bus registered</h3>
            <p>
              Copy this device key for the bus hardware. It will not be shown
              again.
            </p>
            <code className="device-secret">{key}</code>
            <button
              className="button button-primary"
              onClick={() => void navigator.clipboard.writeText(key)}
            >
              Copy device key
            </button>
            <button className="button button-ghost" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form className="panel-form" onSubmit={(e) => void submit(e)}>
            <div className="form-pair">
              <label>
                Bus number
                <input
                  name="code"
                  required
                  minLength={2}
                  defaultValue={bus?.code}
                />
              </label>
              <label>
                Vehicle registration
                <input
                  name="registrationNumber"
                  required
                  minLength={3}
                  defaultValue={bus?.registration_number}
                />
              </label>
            </div>
            <label>
              Route name
              <input
                name="routeName"
                required
                minLength={2}
                defaultValue={bus?.route_name}
              />
            </label>
            <div className="form-pair">
              <label>
                Starting point
                <input
                  name="startingPoint"
                  required
                  defaultValue={bus?.starting_point}
                />
              </label>
              <label>
                Destination
                <input
                  name="destination"
                  required
                  defaultValue={bus?.destination || "Campus"}
                />
              </label>
            </div>
            <div className="form-pair">
              <label>
                Driver name
                <input
                  name="driverName"
                  required
                  minLength={2}
                  defaultValue={bus?.driver_name}
                />
              </label>
              <label>
                Driver phone
                <input
                  name="driverContact"
                  type="tel"
                  defaultValue={bus?.driver_contact}
                />
              </label>
            </div>
            <label>
              Driver details
              <textarea
                name="driverDetails"
                defaultValue={bus?.driver_details}
                placeholder="License / transport office details"
              />
            </label>
            <div className="form-pair">
              <label>
                Total seats
                <input
                  name="capacity"
                  type="number"
                  min={1}
                  max={150}
                  required
                  defaultValue={bus?.capacity || 45}
                />
              </label>
              <label>
                Daily departure
                <input
                  name="startsAt"
                  type="time"
                  defaultValue={bus?.starts_at?.slice(0, 5) || ""}
                />
              </label>
            </div>
            <label className="consent-line">
              <input
                name="scheduleEnabled"
                type="checkbox"
                defaultChecked={bus?.schedule_enabled}
              />{" "}
              Start trips automatically at the configured time (campus timezone)
            </label>
            <small className="registration-help">
              A departure time that has already passed starts the first eligible
              trip at the next 30-second check. Complete open trips before the
              next departure.
            </small>
            <div className="weekday-pills">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (day, i) => (
                  <button
                    type="button"
                    className={days.includes(i) ? "active" : ""}
                    key={day}
                    onClick={() =>
                      setDays((v) =>
                        v.includes(i) ? v.filter((x) => x !== i) : [...v, i],
                      )
                    }
                  >
                    {day}
                  </button>
                ),
              )}
            </div>
            <div className="card-head">
              <h3>Stops in route order</h3>
              <button
                type="button"
                className="portal-text-button"
                onClick={() =>
                  setStops((v) => [
                    ...v,
                    { name: "", latitude: "", longitude: "", offsetMinutes: 0 },
                  ])
                }
              >
                <Plus size={15} /> Add stop
              </button>
            </div>
            {stops.map((stop, i) => (
              <fieldset className="stop-editor" key={stop.id || "new-" + i}>
                <legend>Stop {i + 1}</legend>
                <div className="split-actions">
                  {[-1, 1].map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      className="portal-text-button"
                      disabled={
                        i + direction < 0 || i + direction >= stops.length
                      }
                      onClick={() =>
                        setStops((v) => {
                          const next = [...v];
                          [next[i], next[i + direction]] = [
                            next[i + direction],
                            next[i],
                          ];
                          return next;
                        })
                      }
                    >
                      {direction < 0 ? "Move up" : "Move down"}
                    </button>
                  ))}
                </div>
                <label>
                  Name
                  <input
                    required
                    minLength={2}
                    value={stop.name}
                    onChange={(e) =>
                      setStops((v) =>
                        v.map((s, j) =>
                          j === i ? { ...s, name: e.target.value } : s,
                        ),
                      )
                    }
                  />
                </label>
                <div className="form-pair">
                  <label>
                    Latitude
                    <input
                      required
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={stop.latitude}
                      onChange={(e) =>
                        setStops((v) =>
                          v.map((s, j) =>
                            j === i ? { ...s, latitude: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Longitude
                    <input
                      required
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={stop.longitude}
                      onChange={(e) =>
                        setStops((v) =>
                          v.map((s, j) =>
                            j === i ? { ...s, longitude: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <label>
                  Minutes after departure
                  <input
                    required
                    type="number"
                    min={0}
                    max={1440}
                    value={stop.offsetMinutes}
                    onChange={(e) =>
                      setStops((v) =>
                        v.map((s, j) =>
                          j === i
                            ? { ...s, offsetMinutes: Number(e.target.value) }
                            : s,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="portal-text-button"
                  onClick={() => setStops((v) => v.filter((_, j) => j !== i))}
                >
                  Remove stop
                </button>
              </fieldset>
            ))}
            {error && <div className="form-error">{error}</div>}
            <button className="button button-primary" disabled={busy}>
              {busy
                ? "Saving…"
                : bus
                  ? "Save bus changes"
                  : "Create bus and device key"}
            </button>
          </form>
        )}
      </aside>
    </div>
  );
}
function Allocation({
  buses,
  students,
  token,
  onSaved,
}: {
  buses: Bus[];
  students: Student[];
  token: string;
  onSaved: () => void;
}) {
  const [id, setId] = useState(""),
    [busId, setBusId] = useState(""),
    [stopId, setStopId] = useState(""),
    [seat, setSeat] = useState<number | null>(null),
    [residency, setResidency] = useState("DAY_SCHOLAR"),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const bus = buses.find((b) => b.id === busId);
  const chooseStudent = (id: string) => {
    setId(id);
    const s = students.find((s) => s.id === id);
    setBusId(s?.assigned_bus_id || "");
    setStopId(s?.boarding_stop_id || "");
    setSeat(s?.seat_number ?? null);
    setResidency(s?.residency || "DAY_SCHOLAR");
    setMessage("");
  };
  const save = async () => {
    try {
      await api(
        "/api/students/" + id + "/allocation",
        {
          method: "PATCH",
          body: JSON.stringify({
            busId: busId || null,
            stopId: stopId || null,
            seatNumber: seat,
            residency,
          }),
        },
        token,
      );
      setError("");
      setMessage("Student allocation saved across the linked portals.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Allocation failed");
    }
  };
  return (
    <section className="dash-card">
      <div className="card-head">
        <div>
          <h3>Student allocation & seat management</h3>
          <span>
            Assign the bus, boarding point and optional numbered seat.
          </span>
        </div>
      </div>
      <div className="allocation-form">
        <label>
          Student
          <select value={id} onChange={(e) => chooseStudent(e.target.value)}>
            <option value="">Choose student</option>
            {students
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.registration_number}
                </option>
              ))}
          </select>
        </label>
        <label>
          Residency
          <select
            value={residency}
            onChange={(e) => setResidency(e.target.value)}
          >
            <option value="DAY_SCHOLAR">Day scholar</option>
            <option value="HOSTEL">Hostel student</option>
          </select>
        </label>
        <label>
          Assigned bus
          <select
            value={busId}
            onChange={(e) => {
              setBusId(e.target.value);
              setStopId("");
              setSeat(null);
            }}
          >
            <option value="">Unassigned</option>
            {buses.map((b) => (
              <option value={b.id} key={b.id}>
                {b.code} · {b.remaining_seats} seats free
              </option>
            ))}
          </select>
        </label>
        <label>
          Boarding point
          <select value={stopId} onChange={(e) => setStopId(e.target.value)}>
            <option value="">Not selected</option>
            {bus?.stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.sequence + 1}. {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {bus && (
        <>
          <p className="registration-help">
            Choose a seat, or leave unnumbered. Filled seats are already
            allocated.
          </p>
          <div className="seat-grid">
            {Array.from({ length: bus.capacity }, (_, i) => i + 1).map((n) => {
              const occupied = students.some(
                (s) =>
                  s.id !== id &&
                  s.active &&
                  s.assigned_bus_id === busId &&
                  s.seat_number === n,
              );
              return (
                <button
                  key={n}
                  disabled={occupied}
                  className={seat === n ? "selected" : ""}
                  onClick={() => setSeat(seat === n ? null : n)}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
      {message && <p className="parent-link-success">{message}</p>}
      <button
        className="button button-primary button-compact"
        disabled={!id}
        onClick={() => void save()}
      >
        Save allocation {seat ? "· Seat " + seat : ""}
      </button>
    </section>
  );
}
export default function TransportManagement({
  buses,
  students,
  token,
  onRefresh,
}: {
  buses: Bus[];
  students: Student[];
  token: string;
  onRefresh: () => void;
}) {
  const [editor, setEditor] = useState<Bus | null | undefined>(undefined),
    [selectedId, setSelectedId] = useState(""),
    [error, setError] = useState(""),
    [removing, setRemoving] = useState<Bus | null>(null);
  const selected = buses.find((b) => b.id === selectedId);
  const remove = async () => {
    if (!removing) return;
    try {
      await api("/api/buses/" + removing.id, { method: "DELETE" }, token);
      setRemoving(null);
      setSelectedId("");
      onRefresh();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete bus");
    }
  };
  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <span className="section-kicker">TRANSPORT MANAGEMENT</span>
          <h2>Buses, drivers & allocation</h2>
          <p>
            Complete route information, operating schedules and student seats.
          </p>
        </div>
        <button
          className="button button-primary button-compact"
          onClick={() => setEditor(null)}
        >
          <Plus size={16} /> Add bus
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="faculty-bus-grid">
        {buses.map((b) => (
          <article className="faculty-bus-card" key={b.id}>
            <div>
              <BusFront />
              <div>
                <strong>{b.code}</strong>
                <small>{b.registration_number}</small>
              </div>
              <span className="portal-badge">
                {b.status.replaceAll("_", " ")}
              </span>
            </div>
            <p>
              {b.starting_point || b.route_name} → {b.destination}
            </p>
            <small>
              {b.assigned_students} occupied · {b.remaining_seats} remaining ·{" "}
              {b.capacity} seats
              <br />
              {b.driver_name} ·{" "}
              {b.starts_at?.slice(0, 5) || "Departure not configured"}
            </small>
            <div className="split-actions">
              <button
                className="portal-text-button"
                onClick={() => setSelectedId(b.id)}
              >
                <MapPin size={14} /> Details
              </button>
              <button
                className="portal-text-button"
                onClick={() => setEditor(b)}
              >
                <Pencil size={14} /> Edit
              </button>
              <button
                className="portal-text-button"
                onClick={() => setRemoving(b)}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </article>
        ))}
      </div>
      {selected && (
        <section className="dash-card">
          <div className="card-head">
            <div>
              <h3>
                {selected.code} · {selected.route_name}
              </h3>
              <span>
                {selected.registration_number} · {selected.starting_point} →{" "}
                {selected.destination}
              </span>
            </div>
            <button
              className="icon-button"
              onClick={() => setSelectedId("")}
              aria-label="Close bus details"
            >
              <X size={17} />
            </button>
          </div>
          <div className="portal-journey-status">
            <div>
              <span>DRIVER</span>
              <strong>{selected.driver_name}</strong>
              <small>
                {selected.driver_contact || "Contact not configured"}
                <br />
                {selected.driver_details || "No extra driver details"}
              </small>
            </div>
            <div>
              <span>SEATS</span>
              <strong>
                {selected.assigned_students}/{selected.capacity} occupied
              </strong>
              <small>{selected.remaining_seats} remaining</small>
            </div>
            <div>
              <span>DEPARTURE</span>
              <strong>
                {selected.starts_at?.slice(0, 5) || "Not configured"}
              </strong>
              <small>
                {selected.schedule_enabled
                  ? "Scheduled trips enabled"
                  : "Manual departure"}
              </small>
            </div>
          </div>
          <ol className="stop-list">
            {selected.stops.map((st: BusStop) => (
              <li key={st.id}>
                <span>{st.sequence + 1}</span>
                <div>
                  <strong>{st.name}</strong>
                  <small>
                    Planned{" "}
                    {plannedStopTime(selected.starts_at, st.offset_minutes)} ·{" "}
                    {st.offset_minutes} min · {st.latitude}, {st.longitude}
                  </small>
                </div>
              </li>
            ))}
          </ol>
          <JourneyMap buses={[selected]} />
          <button
            className="button button-ghost button-compact"
            onClick={() =>
              void downloadCsv(selected.id, token).catch((e) =>
                setError(e.message),
              )
            }
          >
            Download this bus’s attendance CSV
          </button>
        </section>
      )}
      <Allocation
        buses={buses}
        students={students}
        token={token}
        onSaved={onRefresh}
      />
      {editor !== undefined && (
        <BusEditor
          bus={editor}
          token={token}
          onClose={() => setEditor(undefined)}
          onSaved={onRefresh}
        />
      )}
      {removing && (
        <div className="modal-backdrop">
          <section className="dash-card delete-confirm" role="alertdialog">
            <h3>Delete {removing.code} from the active fleet?</h3>
            <p>
              Student assignments will be cleared. Trip and attendance history
              will remain available in reports. A running trip must be completed
              first.
            </p>
            <div className="split-actions">
              <button
                className="button button-primary button-compact"
                onClick={() => void remove()}
              >
                Delete bus
              </button>
              <button
                className="button button-ghost button-compact"
                onClick={() => setRemoving(null)}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
