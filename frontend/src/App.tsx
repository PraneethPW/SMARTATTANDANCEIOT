import { lazy, Suspense, useEffect, useState } from "react";
import { api, disconnectPush, type Session } from "./api";
import AuthModal from "./components/AuthModal";
import Landing from "./components/Landing";
import PortalEntry from "./components/PortalEntry";

const Dashboard = lazy(() => import("./components/Dashboard"));
const Portal = lazy(() => import("./components/Portal"));

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [session, setSession] = useState<Session | null>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("transitsync-session") || "null",
      ) as Session | null;
    } catch {
      return null;
    }
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (next: string) => {
    if (window.location.pathname !== next)
      window.history.pushState({}, "", next);
    setPath(next);
    window.scrollTo(0, 0);
  };
  const logout = () => {
    const token = session?.token;
    localStorage.removeItem("transitsync-session");
    setSession(null);
    setAuthOpen(false);
    navigate("/");
    if (token) void disconnectPush(token);
  };

  useEffect(() => {
    if (!session) return;
    let active = true;
    api("/api/auth/me", {}, session.token).catch(() => {
      if (!active) return;
      localStorage.removeItem("transitsync-session");
      setSession(null);
    });
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const correctPath =
      session.user.role === "STUDENT"
        ? "/student"
        : session.user.role === "PARENT"
          ? "/parent"
          : "/app";
    if (path !== "/" && window.location.pathname !== correctPath) {
      window.history.replaceState({}, "", correctPath);
      setPath(correctPath);
    }
  }, [session, path]);

  if (session && path !== "/")
    return (
      <Suspense
        fallback={
          <div className="page-loader">
            <span>Loading dashboard…</span>
          </div>
        }
      >
        {["PARENT", "STUDENT"].includes(session.user.role) ? (
          <Portal
            session={session}
            onLogout={logout}
            onHome={() => navigate("/")}
          />
        ) : (
          <Dashboard
            session={session}
            onLogout={logout}
            onHome={() => navigate("/")}
          />
        )}
      </Suspense>
    );
  const portalRole =
    path === "/student" ? "STUDENT" : path === "/parent" ? "PARENT" : null;
  return (
    <>
      {portalRole ? (
        <PortalEntry
          role={portalRole}
          onSignIn={() => {
            setAuthMode("login");
            setAuthOpen(true);
          }}
          onRegister={() => {
            setAuthMode("signup");
            setAuthOpen(true);
          }}
          onNavigate={navigate}
        />
      ) : (
        <Landing
          onLogout={session ? logout : undefined}
          onEnter={() => {
            if (session) {
              navigate(
                session.user.role === "STUDENT"
                  ? "/student"
                  : session.user.role === "PARENT"
                    ? "/parent"
                    : "/app",
              );
              return;
            }
            setAuthMode("login");
            setAuthOpen(true);
          }}
        />
      )}
      <AuthModal
        open={authOpen}
        initialMode={authMode}
        portalRole={portalRole}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={(value) => {
          setSession(value);
          setAuthOpen(false);
          navigate(
            value.user.role === "STUDENT"
              ? "/student"
              : value.user.role === "PARENT"
                ? "/parent"
                : "/app",
          );
        }}
      />
    </>
  );
}
