import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BusFront,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, type Session } from "../api";
import { roleLabels, roleDescriptions, type Role } from "../roles";

type Props = {
  open: boolean;
  initialMode?: "login" | "signup" | "reset";
  portalRole?: Role | null;
  resetToken?: string;
  onResetComplete?: () => void;
  onClose: () => void;
  onAuthenticated: (session: Session) => void;
};

export default function AuthModal({
  open,
  initialMode = "login",
  portalRole: entryRole,
  resetToken = "",
  onResetComplete,
  onClose,
  onAuthenticated,
}: Props) {
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [mode, setMode] = useState<
    "login" | "signup" | "bootstrap" | "forgot" | "reset" | "reset-done"
  >("login");
  const [selectedRole, setSelectedRole] = useState<Role>("FACULTY");
  const portalRole = entryRole ?? selectedRole;
  const staff = ["ADMIN", "FACULTY", "TRANSPORT"].includes(portalRole);
  const [message, setMessage] = useState("");
  const [recoveryMode, setRecoveryMode] = useState("administrator");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [residency, setResidency] = useState("DAY_SCHOLAR");
  const [buses, setBuses] = useState<
    Array<{ code: string; route_name: string }>
  >([]);

  useEffect(() => setShowPassword(false), [open, mode, portalRole]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setInitialized(null);
    setError("");
    setMessage("");
    setMode(initialMode);
    api<{ initialized: boolean }>("/api/setup/status")
      .then((data) => {
        if (!active) return;
        setInitialized(data.initialized);
        setMode(
          data.initialized || initialMode === "reset"
            ? initialMode
            : "bootstrap",
        );
      })
      .catch((err: Error) => {
        if (active) setError(`Cannot reach the API: ${err.message}`);
      });
    api<{ mode: string }>("/api/auth/recovery-options")
      .then((data) => {
        if (active) setRecoveryMode(data.mode);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, initialMode]);

  useEffect(() => {
    if (!open || portalRole !== "STUDENT") return;
    api<{ buses: Array<{ code: string; route_name: string }> }>(
      "/api/registration/buses",
    )
      .then((result) => setBuses(result.buses))
      .catch((cause: Error) =>
        setError(`Could not load registered buses: ${cause.message}`),
      );
  }, [open, portalRole]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      password: String(data.get("password") || ""),
      role: portalRole,
      invitationCode: String(data.get("invitationCode") || ""),
      registrationNumber: String(data.get("registrationNumber") || ""),
      rfidUid: String(data.get("rfidUid") || ""),
      department: String(data.get("department") || ""),
      academicYear: Number(data.get("academicYear")),
      section: String(data.get("section") || ""),
      busCode: String(data.get("busCode") || ""),
      residency,
      parentName: String(data.get("parentName") || ""),
      parentContact: String(data.get("parentContact") || ""),
    };
    try {
      if (mode === "signup" && portalRole === "ADMIN") {
        const response = await api<{ message: string }>(
          "/api/auth/admin-signup",
          {
            method: "POST",
            body: JSON.stringify({
              name: payload.name,
              email: payload.email,
              password: payload.password,
            }),
          },
        );
        setMode("login");
        setMessage(response.message);
        return;
      }
      if (mode === "forgot") {
        const response = await api<{ message: string }>(
          "/api/auth/forgot-password",
          {
            method: "POST",
            body: JSON.stringify({ email: payload.email, role: portalRole }),
          },
        );
        setMessage(response.message);
        return;
      }
      if (mode === "reset") {
        if (payload.password !== String(data.get("confirmPassword") || ""))
          throw new Error("Passwords do not match.");
        await api("/api/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({
            token: resetToken,
            password: payload.password,
          }),
        });
        localStorage.removeItem("transitsync-session");
        window.dispatchEvent(new Event("transitsync:session-expired"));
        setMode("reset-done");
        return;
      }
      const session =
        mode === "bootstrap"
          ? await api<Session>("/api/auth/bootstrap", {
              method: "POST",
              body: JSON.stringify(payload),
            })
          : mode === "signup"
            ? await api<Session>(
                portalRole === "STUDENT"
                  ? "/api/auth/student-signup"
                  : portalRole === "PARENT"
                    ? "/api/auth/parent-signup"
                    : "/api/auth/staff-signup",
                { method: "POST", body: JSON.stringify(payload) },
              )
            : await api<Session>("/api/auth/login", {
                method: "POST",
                body: JSON.stringify({
                  email: payload.email,
                  password: payload.password,
                  role: portalRole,
                }),
              });
      localStorage.setItem("transitsync-session", JSON.stringify(session));
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="auth-modal"
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
          >
            <button
              className="icon-button modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div className="auth-visual">
              <div className="auth-grid" />
              <span className="brand-mark auth-logo">
                <BusFront size={24} />
              </span>
              <div>
                <span className="section-kicker">SECURE OPERATIONS</span>
                <h2>
                  One live view.
                  <br />
                  Every trusted event.
                </h2>
                <p>
                  Device evidence and academic decisions stay separate,
                  traceable, and visible in real time.
                </p>
              </div>
              <div className="auth-badges">
                <span>
                  <ShieldCheck size={15} /> Role-based access
                </span>
                <span>
                  <LockKeyhole size={15} /> Hashed credentials
                </span>
              </div>
            </div>
            <div className="auth-form-panel">
              <button className="back-link" onClick={onClose}>
                <ArrowLeft size={15} /> Back to experience
              </button>
              <div className="auth-heading">
                <span>
                  {mode === "forgot" ||
                  mode === "reset" ||
                  mode === "reset-done"
                    ? "ACCOUNT RECOVERY"
                    : mode === "bootstrap"
                      ? "FIRST-RUN SETUP"
                      : mode === "signup"
                        ? portalRole
                          ? `${portalRole} REGISTRATION`
                          : "JOIN THE LIVE OPERATION"
                        : portalRole
                          ? `${portalRole} PORTAL`
                          : "CONTROL CENTER"}
                </span>
                <h3>
                  {mode === "forgot"
                    ? "Forgot your password?"
                    : mode === "reset"
                      ? "Choose a new password"
                      : mode === "reset-done"
                        ? "Password changed"
                        : mode === "bootstrap"
                          ? "Initialize workspace"
                          : mode === "signup"
                            ? portalRole
                              ? `Register as ${portalRole.toLowerCase()}`
                              : "Create your account"
                            : portalRole
                              ? `Open your ${portalRole.toLowerCase()} dashboard`
                              : "Welcome back"}
                </h3>
                <p>
                  {mode === "forgot"
                    ? recoveryMode === "email"
                      ? "Enter your registered email. Check its inbox for a single-use reset link."
                      : "Enter your registered email. Your campus administrator can verify your identity and give you a single-use reset link."
                    : mode === "reset"
                      ? "Set a password of at least 10 characters. Reset links expire after 20 minutes and can be used once."
                      : mode === "reset-done"
                        ? "Your password was updated and previous sessions were signed out. Continue to sign in with your new password."
                        : mode === "bootstrap"
                          ? "Create the first administrator. Setup closes automatically afterward."
                          : mode === "signup"
                            ? portalRole === "STUDENT"
                              ? "Enter your academic and bus details. A new registration becomes active immediately; an existing record must match its RFID card and class."
                              : portalRole === "PARENT"
                                ? "Your child’s registration number and the parent mobile number on their record must match. Your name is used only for your account."
                                : portalRole === "ADMIN"
                                  ? "Register with your name, email and password. An existing campus administrator will verify and approve your access."
                                  : "Register with the invitation code issued for your email and selected staff role."
                            : portalRole
                              ? roleDescriptions[portalRole]
                              : "Sign in with your institutional account. Faculty and transport accounts are created by a campus administrator."}
                </p>
              </div>
              {!entryRole && ["login", "signup", "forgot"].includes(mode) && (
                <fieldset className="auth-role-picker" disabled={busy}>
                  <legend>Choose your role</legend>
                  {(
                    [
                      "ADMIN",
                      "TRANSPORT",
                      "FACULTY",
                      "STUDENT",
                      "PARENT",
                    ] as Role[]
                  ).map((role) => (
                    <button
                      type="button"
                      key={role}
                      aria-pressed={portalRole === role}
                      className={portalRole === role ? "active" : ""}
                      onClick={() => {
                        setSelectedRole(role);
                        setError("");
                        setMessage("");
                      }}
                    >
                      {roleLabels[role]}
                    </button>
                  ))}
                </fieldset>
              )}
              {mode === "reset-done" ? (
                <button
                  className="button button-primary auth-submit"
                  onClick={onResetComplete}
                >
                  Continue to sign in
                </button>
              ) : (
                <form key={portalRole + mode} onSubmit={submit}>
                  {(mode === "bootstrap" || mode === "signup") && (
                    <label>
                      {mode === "bootstrap"
                        ? "Administrator name"
                        : "Full name"}
                      <input
                        name="name"
                        required
                        minLength={2}
                        placeholder="Your full name"
                        autoComplete="name"
                      />
                    </label>
                  )}
                  {mode !== "reset" && (
                    <label>
                      Email address
                      <input
                        name="email"
                        type="email"
                        required
                        placeholder="admin@college.edu"
                        autoComplete="email"
                      />
                    </label>
                  )}
                  {mode === "signup" && staff && portalRole !== "ADMIN" && (
                    <label>
                      Campus invitation code
                      <input
                        name="invitationCode"
                        type="password"
                        required
                        minLength={64}
                        maxLength={64}
                        autoComplete="off"
                        placeholder="Code from your administrator"
                      />
                    </label>
                  )}
                  {mode === "signup" && !staff && (
                    <label>
                      Student registration number
                      <input
                        name="registrationNumber"
                        required
                        maxLength={40}
                        placeholder="Your campus registration number"
                      />
                    </label>
                  )}
                  {mode === "signup" && portalRole === "STUDENT" && (
                    <>
                      <label>
                        RFID card UID
                        <input
                          name="rfidUid"
                          required
                          minLength={4}
                          maxLength={64}
                          placeholder="UID printed on your campus card"
                        />
                      </label>
                      <div className="form-pair">
                        <label>
                          Department
                          <input
                            name="department"
                            required
                            minLength={2}
                            placeholder="CSE"
                          />
                        </label>
                        <label>
                          Year
                          <input
                            name="academicYear"
                            type="number"
                            min="1"
                            max="8"
                            required
                          />
                        </label>
                      </div>
                      <label>
                        Section
                        <input name="section" required placeholder="A" />
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
                        {residency === "HOSTEL" ? " (optional)" : ""}
                        <select
                          name="busCode"
                          required={residency === "DAY_SCHOLAR"}
                          defaultValue=""
                        >
                          <option value="">Select your registered bus</option>
                          {buses.map((bus) => (
                            <option key={bus.code} value={bus.code}>
                              {bus.code} · {bus.route_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!buses.length && residency === "DAY_SCHOLAR" && (
                        <div className="form-error">
                          No campus buses are registered yet. Ask the transport
                          office to add your bus first.
                        </div>
                      )}
                      <div className="form-pair">
                        <label>
                          Parent name (optional)
                          <input
                            name="parentName"
                            minLength={2}
                            placeholder="For the campus record"
                          />
                        </label>
                        <label>
                          Parent mobile (optional)
                          <input
                            name="parentContact"
                            type="tel"
                            minLength={6}
                            placeholder="Mobile number"
                          />
                        </label>
                      </div>
                      <small className="registration-help">
                        A parent can register using this student’s registration
                        number and recorded mobile number. Parent name is not
                        checked.
                      </small>
                    </>
                  )}
                  {mode === "signup" && portalRole === "PARENT" && (
                    <label>
                      Parent mobile number on student record
                      <input
                        name="parentContact"
                        type="tel"
                        required
                        minLength={6}
                        placeholder="Mobile number on file"
                      />
                    </label>
                  )}
                  {mode !== "forgot" && (
                    <label>
                      Password
                      <div className="password-field">
                        <input
                          name="password"
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={mode === "login" ? 1 : 10}
                          autoComplete={
                            mode === "login"
                              ? "current-password"
                              : "new-password"
                          }
                          placeholder="••••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label="Toggle password"
                        >
                          {showPassword ? (
                            <EyeOff size={17} />
                          ) : (
                            <Eye size={17} />
                          )}
                        </button>
                      </div>
                    </label>
                  )}
                  {mode === "reset" && (
                    <label>
                      Confirm new password
                      <input
                        name="confirmPassword"
                        type="password"
                        required
                        minLength={10}
                        maxLength={128}
                        autoComplete="new-password"
                      />
                    </label>
                  )}
                  {mode === "reset" && !/^[a-f0-9]{64}$/.test(resetToken) && (
                    <div className="form-error">
                      This reset link is incomplete. Request a new link from
                      your campus administrator.
                    </div>
                  )}
                  {error && (
                    <div className="form-error" role="alert">
                      {error}
                    </div>
                  )}
                  {message && (
                    <div className="auth-message" role="status">
                      {message}
                    </div>
                  )}
                  <button
                    className="button button-primary auth-submit"
                    disabled={
                      busy ||
                      initialized === null ||
                      (mode === "reset" &&
                        !/^[a-f0-9]{64}$/.test(resetToken)) ||
                      (mode === "signup" &&
                        portalRole === "STUDENT" &&
                        residency === "DAY_SCHOLAR" &&
                        !buses.length)
                    }
                  >
                    {busy ? <LoaderCircle className="spin" size={18} /> : null}
                    {mode === "forgot"
                      ? "Request password recovery"
                      : mode === "reset"
                        ? "Save new password"
                        : mode === "bootstrap"
                          ? "Create secure workspace"
                          : mode === "signup"
                            ? portalRole === "ADMIN"
                              ? "Submit Admin registration"
                              : portalRole
                                ? `Register & open ${portalRole.toLowerCase()} dashboard`
                                : "Create account & continue"
                            : portalRole
                              ? `Open ${portalRole.toLowerCase()} dashboard`
                              : "Enter control center"}
                  </button>
                  {initialized && (mode === "login" || mode === "signup") && (
                    <div className="auth-switch">
                      <span>
                        {mode === "login"
                          ? "New to TransitSync?"
                          : "Already have an account?"}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setMode(mode === "login" ? "signup" : "login");
                          setError("");
                          setMessage("");
                        }}
                      >
                        {mode === "login"
                          ? `Register as ${portalRole.toLowerCase()}`
                          : "Sign in instead"}
                      </button>
                    </div>
                  )}
                  {initialized && (mode === "login" || mode === "signup") && (
                    <button
                      type="button"
                      className="auth-recovery-link"
                      disabled={busy}
                      onClick={() => {
                        setMode("forgot");
                        setError("");
                        setMessage("");
                      }}
                    >
                      Forgot password?
                    </button>
                  )}
                  {(mode === "forgot" || mode === "reset") && (
                    <button
                      type="button"
                      className="auth-recovery-link"
                      disabled={busy}
                      onClick={() => {
                        setMode(mode === "reset" ? "forgot" : "login");
                        setError("");
                        setMessage("");
                      }}
                    >
                      {mode === "reset"
                        ? "Request a new reset link"
                        : "Back to sign in"}
                    </button>
                  )}
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
