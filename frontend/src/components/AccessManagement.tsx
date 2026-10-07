import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "../api";
import {
  dashboardPaths,
  roleLabels,
  roleDescriptions,
  type Role,
} from "../roles";

type Recovery = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  requested_at: string;
};
type Account = { id: string; name: string; email: string; role: Role };
type StaffRegistration = {
  id: string;
  name: string;
  email: string;
  role: Role;
  requested_at: string;
};
export default function AccessManagement({
  token,
  refreshKey,
}: {
  token: string;
  refreshKey: number;
}) {
  const [requests, setRequests] = useState<Recovery[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [registrations, setRegistrations] = useState<StaffRegistration[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const secretPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (secret)
      secretPanel.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  }, [secret]);
  const load = useCallback(async () => {
    try {
      const [recovery, status, users, registrations] = await Promise.all([
        api<{ requests: Recovery[] }>("/api/access/recovery", {}, token),
        api<{ emailConfigured: boolean }>("/api/access/status", {}, token),
        api<{ users: Account[] }>("/api/users", {}, token),
        api<{ registrations: StaffRegistration[] }>(
          "/api/access/registrations",
          {},
          token,
        ),
      ]);
      setRequests(recovery.requests);
      setAccounts(users.users);
      setRegistrations(registrations.registrations);
      setEmailConfigured(status.emailConfigured);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Cannot load account access.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-stack access-management">
      <div className="page-title-row">
        <div>
          <span className="section-kicker">ACCOUNT ACCESS</span>
          <h2>One campus. Five roles.</h2>
          <p>
            Approve staff registrations and help account holders recover access
            after verifying their identity.
          </p>
        </div>
        <button
          className="button button-ghost button-compact"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="access-role-grid">
        {(Object.keys(roleLabels) as Role[]).map((role) => (
          <article className="dash-card access-role-card" key={role}>
            <span className="section-kicker">{roleLabels[role]}</span>
            <h3>{accounts.filter((a) => a.role === role).length} accounts</h3>
            <p>{roleDescriptions[role]}</p>
            <a href={dashboardPaths[role]} target="_blank" rel="noreferrer">
              Open {roleLabels[role].toLowerCase()} sign-in
            </a>
          </article>
        ))}
      </div>
      {secret && (
        <section className="dash-card access-secret" ref={secretPanel}>
          <div className="card-head">
            <div>
              <h3>Share privately with this person</h3>
              <span>{secret.label}</span>
            </div>
            <KeyRound size={20} />
          </div>
          <p>
            This value is shown only now. Copy it before dismissing. Do not
            share it publicly.
          </p>
          <div className="access-secret-actions">
            <input
              type="password"
              aria-label="Private one-time value"
              value={secret.value}
              readOnly
              autoComplete="off"
            />
            <button
              className="button button-primary button-compact"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret.value);
                  setCopied(true);
                } catch {
                  setError(
                    "Clipboard unavailable. Select the masked value and copy it manually.",
                  );
                }
              }}
            >
              <Copy size={14} />
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              className="button button-ghost button-compact"
              onClick={() => setSecret(null)}
            >
              Dismiss
            </button>
          </div>
        </section>
      )}
      <section className="dash-card">
        <div className="card-head">
          <div>
            <h3>Staff registrations</h3>
            <span>
              Applicants register with name, email and password. Approve campus
              Admin, Faculty or Transport access after verification.
            </span>
          </div>
          <ShieldCheck size={20} />
        </div>
        <div className="portal-list">
          {registrations.map((request) => (
            <div className="access-recovery-row" key={request.id}>
              <div>
                <strong>
                  {request.name} · {roleLabels[request.role]}
                </strong>
                <small>{request.email}</small>
                <small>
                  Requested {new Date(request.requested_at).toLocaleString()}
                </small>
              </div>
              <label className="access-confirm">
                <input
                  type="checkbox"
                  checked={Boolean(confirmed[request.id])}
                  disabled={busy}
                  onChange={(e) =>
                    setConfirmed((old) => ({
                      ...old,
                      [request.id]: e.target.checked,
                    }))
                  }
                />{" "}
                I verified this applicant for {roleLabels[request.role]} access
              </label>
              <button
                className="button button-primary button-compact"
                disabled={busy || !confirmed[request.id]}
                onClick={() =>
                  void run(async () => {
                    await api(
                      `/api/access/registrations/${request.id}/approve`,
                      {
                        method: "POST",
                        body: JSON.stringify({ identityConfirmed: true }),
                      },
                      token,
                    );
                    setConfirmed((old) => ({ ...old, [request.id]: false }));
                  })
                }
              >
                Approve {roleLabels[request.role]}
              </button>
              <button
                className="button button-ghost button-compact"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(
                      `/api/access/registrations/${request.id}/decline`,
                      { method: "POST" },
                      token,
                    );
                    setConfirmed((old) => ({ ...old, [request.id]: false }));
                  })
                }
              >
                Decline
              </button>
            </div>
          ))}
          {!registrations.length && (
            <div className="portal-empty">
              {loading
                ? "Loading staff requests…"
                : "No pending staff registrations."}
            </div>
          )}
        </div>
      </section>
      <section className="dash-card">
        <div className="card-head">
          <div>
            <h3>Password recovery</h3>
            <span>
              {emailConfigured
                ? "Email recovery is configured; you can also assist verified users."
                : "Administrator-assisted recovery · no reset emails are sent."}
            </span>
          </div>
          <KeyRound size={19} />
        </div>
        <p className="access-help">
          Confirm identity through your campus process before issuing a link.
          Links expire after 20 minutes. Issuing another link replaces the
          previous one; completing a reset signs out previous sessions.
        </p>
        <div className="portal-list">
          {requests.map((request) => (
            <div className="access-recovery-row" key={request.id}>
              <div>
                <strong>
                  {request.name} · {roleLabels[request.role]}
                </strong>
                <small>
                  {request.email} ·{" "}
                  {request.status === "LINK_ISSUED"
                    ? "Link issued"
                    : "Awaiting verification"}
                </small>
                <small>
                  Requested {new Date(request.requested_at).toLocaleString()}
                </small>
              </div>
              <label className="access-confirm">
                <input
                  type="checkbox"
                  checked={Boolean(confirmed[request.id])}
                  disabled={busy}
                  onChange={(e) =>
                    setConfirmed((old) => ({
                      ...old,
                      [request.id]: e.target.checked,
                    }))
                  }
                />{" "}
                I verified this person’s identity
              </label>
              <button
                className="button button-primary button-compact"
                disabled={busy || !confirmed[request.id]}
                onClick={() =>
                  void run(async () => {
                    const result = await api<{
                      link: string;
                      expiresMinutes: number;
                    }>(
                      `/api/access/recovery/${request.id}/link`,
                      {
                        method: "POST",
                        body: JSON.stringify({ identityConfirmed: true }),
                      },
                      token,
                    );
                    setSecret({
                      label: `Password reset for ${request.email} · expires in ${result.expiresMinutes} minutes`,
                      value: result.link,
                    });
                    setCopied(false);
                    setConfirmed((old) => ({ ...old, [request.id]: false }));
                  })
                }
              >
                Issue reset link
              </button>
            </div>
          ))}
          {!requests.length && (
            <div className="portal-empty">
              {loading
                ? "Loading recovery requests…"
                : "No pending recovery requests. Users can request help through Forgot password."}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
