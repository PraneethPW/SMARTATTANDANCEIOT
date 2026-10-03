import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
type Notice = {
  id: string;
  body: string;
  kind: string;
  created_at: string;
  read_at: string | null;
};
export default function Notifications({ token }: { token: string }) {
  const [notices, setNotices] = useState<Notice[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const refresh = useCallback(
    () =>
      api<{ notifications: Notice[] }>("/api/notifications", {}, token)
        .then((x) => setNotices(x.notifications))
        .catch((e) => setError(e.message)),
    [token],
  );
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => clearInterval(timer);
  }, [refresh]);
  const enable = async () => {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error(
          "This browser does not support background push. In-app alerts are available.",
        );
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await api<{ publicKey: string }>(
        "/api/notifications/push/key",
        {},
        token,
      );
      const decoded = atob(publicKey.replaceAll("-", "+").replaceAll("_", "/"));
      const key = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      await api(
        "/api/notifications/push",
        { method: "POST", body: JSON.stringify(subscription.toJSON()) },
        token,
      );
      setMessage("Mobile notifications enabled on this browser.");
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not enable notifications",
      );
    }
  };
  return (
    <section className="dash-card">
      <div className="card-head">
        <div>
          <h3>Journey notifications</h3>
          <span>Approaching your stop, boarding and campus arrival</span>
        </div>
        <button
          className="button button-primary button-compact"
          onClick={() => void enable()}
        >
          Enable mobile alerts
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="parent-link-success">{message}</p>}
      <div className="portal-list">
        {notices.map((n) => (
          <button
            className="notification-row"
            key={n.id}
            onClick={() =>
              void api(
                "/api/notifications/" + n.id,
                { method: "PATCH" },
                token,
              ).then(refresh)
            }
          >
            <span className={!n.read_at ? "live-dot" : ""} />
            <div>
              <strong>{n.body}</strong>
              <small>
                {new Date(n.created_at).toLocaleString()} ·{" "}
                {n.read_at ? "Read" : "Unread"}
              </small>
            </div>
          </button>
        ))}
        {!notices.length && (
          <div className="portal-empty">
            No journey alerts yet. Configure your boarding stop to receive
            proximity alerts.
          </div>
        )}
      </div>
    </section>
  );
}
