import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X } from "lucide-react";
import { api } from "../api";
type Challenge = {
  id: string;
  student_id: string;
  name: string;
  registration_number: string;
  category: string;
  turn_direction: string;
  expires_at: string;
  enrolled: boolean;
};

function CameraCapture({
  direction,
  onCaptured,
  onClose,
}: {
  direction?: string;
  onCaptured: (front: string, turn?: string) => Promise<void>;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null);
  const [front, setFront] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      })
      .then((s) => {
        if (disposed) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch((e) => setError(e.message));
    if (!navigator.mediaDevices)
      setError("A camera requires a secure HTTPS connection.");
    return () => {
      disposed = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const capture = async () => {
    if (!video.current || !ready) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      640 / video.current.videoWidth,
      640 / video.current.videoHeight,
      1,
    );
    canvas.width = Math.round(video.current.videoWidth * scale);
    canvas.height = Math.round(video.current.videoHeight * scale);
    canvas
      .getContext("2d")!
      .drawImage(video.current, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.8);
    if (direction && !front) {
      setFront(image);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCaptured(
        direction ? front : image,
        direction ? image : undefined,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Face verification failed");
      if (direction) setFront("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop camera-backdrop">
      <section
        className="dash-card camera-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Camera verification"
      >
        <div className="card-head">
          <div>
            <h3>
              {direction ? "RFID → Face verification" : "Face enrollment"}
            </h3>
            <span>
              {direction
                ? front
                  ? `Turn your head to your ${direction.toLowerCase()}, then capture again.`
                  : "Look straight at the camera and capture the first frame."
                : "Show one clear face. Campus staff will check the enrollment."}
            </span>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close camera"
          >
            <X />
          </button>
        </div>
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          onLoadedData={() => setReady(true)}
        />
        {error && <div className="form-error">{error}</div>}
        <div className="split-actions">
          <button
            className="button button-primary"
            disabled={!ready || busy}
            onClick={() => void capture()}
          >
            <Camera size={17} />
            {busy
              ? "Checking face on server…"
              : front
                ? "Capture head turn & verify"
                : "Capture face"}
          </button>
          {front && (
            <button
              className="button button-ghost"
              onClick={() => setFront("")}
            >
              Retake first frame
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
export function FaceChecks({
  token,
  studentId,
}: {
  token: string;
  studentId?: string;
}) {
  const [challenges, setChallenges] = useState<Challenge[]>([]),
    [selected, setSelected] = useState<Challenge | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    try {
      const data = await api<{ challenges: Challenge[] }>(
        "/api/verification/pending",
        {},
        token,
      );
      setChallenges(
        data.challenges.filter((x) => !studentId || x.student_id === studentId),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load RFID checks");
    }
  }, [token, studentId]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  return (
    <section className="dash-card">
      <div className="card-head">
        <div>
          <h3>Pending RFID → Face checks</h3>
          <span>
            Scans expire after three minutes. A completed face check never
            substitutes for a classroom scan.
          </span>
        </div>
        <button
          className="icon-button"
          onClick={() => void refresh()}
          aria-label="Refresh face checks"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}
      {message && <p className="parent-link-success">{message}</p>}
      {challenges.map((c) => (
        <div className="portal-list-row" key={c.id}>
          <div>
            <strong>
              {c.name} · {c.category.toLowerCase()} attendance
            </strong>
            <small>
              {c.registration_number} · Scan received · Expires{" "}
              {new Date(c.expires_at).toLocaleTimeString()}
            </small>
          </div>
          <button
            className="button button-primary button-compact"
            disabled={!c.enrolled}
            onClick={() => setSelected(c)}
          >
            {c.enrolled ? "Verify face" : "Enrollment approval needed"}
          </button>
        </div>
      ))}
      {!challenges.length && (
        <div className="portal-empty">
          No pending RFID scans. Scan the card on the bus, classroom or hostel
          reader first.
        </div>
      )}
      {selected && (
        <CameraCapture
          direction={selected.turn_direction}
          onClose={() => setSelected(null)}
          onCaptured={async (frontImage, turnImage) => {
            await api(
              "/api/verification/" + selected.id + "/complete",
              {
                method: "POST",
                body: JSON.stringify({ frontImage, turnImage }),
              },
              token,
            );
            setMessage(
              selected.category === "CLASS"
                ? "Class face check completed. Faculty can now confirm Present."
                : selected.category + " attendance completed.",
            );
            await refresh();
          }}
        />
      )}
    </section>
  );
}
export function FaceEnrollment({
  token,
  studentId,
}: {
  token: string;
  studentId: string;
}) {
  const [enrollment, setEnrollment] = useState<{
      approved_at: string | null;
      created_at: string;
    } | null>(null),
    [camera, setCamera] = useState(false),
    [consent, setConsent] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(
    () =>
      api<{ enrollment: typeof enrollment }>(
        "/api/verification/profile/" + studentId,
        {},
        token,
      )
        .then((x) => setEnrollment(x.enrollment))
        .catch((e) => setError(e.message)),
    [studentId, token],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <section className="dash-card">
      <div className="card-head">
        <div>
          <h3>My face enrollment</h3>
          <span>
            {enrollment
              ? enrollment.approved_at
                ? "Approved by campus staff"
                : "Pending campus identity check"
              : "Enroll before RFID + face attendance can be completed"}
          </span>
        </div>
      </div>
      <p className="registration-help">
        Your camera frame is sent to the campus API for a face descriptor and an
        enrollment portrait. Attendance captures are processed for verification
        and are not stored as photos. Campus staff must check your identity
        before approving the enrollment.
      </p>
      <label className="consent-line">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />{" "}
        I consent to face enrollment and attendance verification for my campus
        account.
      </label>
      <button
        className="button button-primary button-compact"
        disabled={!consent}
        onClick={() => setCamera(true)}
      >
        {enrollment ? "Replace enrollment" : "Enroll using camera"}
      </button>
      {error && <p className="form-error">{error}</p>}
      {camera && (
        <CameraCapture
          onClose={() => setCamera(false)}
          onCaptured={async (image) => {
            await api(
              "/api/verification/enroll/" + studentId,
              {
                method: "POST",
                body: JSON.stringify({ image, consent: true }),
              },
              token,
            );
            await refresh();
          }}
        />
      )}
    </section>
  );
}
export function FaceEnrollmentReview({ token }: { token: string }) {
  const [rows, setRows] = useState<
      {
        student_id: string;
        name: string;
        registration_number: string;
        portrait: string;
        approved_at: string | null;
      }[]
    >([]),
    [checked, setChecked] = useState<Record<string, boolean>>({}),
    [error, setError] = useState("");
  const refresh = useCallback(
    () =>
      api<{ enrollments: typeof rows }>(
        "/api/verification/enrollments",
        {},
        token,
      )
        .then((x) => setRows(x.enrollments))
        .catch((e) => setError(e.message)),
    [token],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <section className="dash-card">
      <div className="card-head">
        <div>
          <h3>Face enrollment approvals</h3>
          <span>
            Check the student’s campus identity against the portrait before
            approval.
          </span>
        </div>
        <button onClick={() => void refresh()} className="portal-text-button">
          Refresh
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="enrollment-grid">
        {rows.map((r) => (
          <article className="enrollment-card" key={r.student_id}>
            <img src={r.portrait} alt={`Enrollment portrait for ${r.name}`} />
            <strong>{r.name}</strong>
            <small>{r.registration_number}</small>
            {r.approved_at ? (
              <span className="portal-badge">Approved</span>
            ) : (
              <>
                <label className="consent-line">
                  <input
                    type="checkbox"
                    checked={!!checked[r.student_id]}
                    onChange={(e) =>
                      setChecked((x) => ({
                        ...x,
                        [r.student_id]: e.target.checked,
                      }))
                    }
                  />{" "}
                  Campus identity checked
                </label>
                <button
                  className="button button-primary button-compact"
                  disabled={!checked[r.student_id]}
                  onClick={() =>
                    void api(
                      "/api/verification/enrollments/" +
                        r.student_id +
                        "/approve",
                      {
                        method: "POST",
                        body: JSON.stringify({ identityChecked: true }),
                      },
                      token,
                    )
                      .then(refresh)
                      .catch((e) => setError(e.message))
                  }
                >
                  Approve enrollment
                </button>
              </>
            )}
          </article>
        ))}
      </div>
      {!rows.length && (
        <div className="portal-empty">
          Students have not submitted face enrollments yet.
        </div>
      )}
    </section>
  );
}
