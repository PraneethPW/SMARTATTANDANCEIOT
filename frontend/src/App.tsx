import { lazy, Suspense, useEffect, useState } from "react";
import { api, disconnectPush, type Session } from "./api";
import { dashboardPaths, type Role } from "./roles";
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
  const [authOpen, setAuthOpen] = useState(
    window.location.pathname === "/reset-password",
  );
  const [authMode, setAuthMode] = useState<"login" | "signup" | "reset">(
    window.location.pathname === "/reset-password" ? "reset" : "login",
  );
  const [resetToken, setResetToken] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
  );

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
      if (window.location.pathname === "/reset-password") {
        setResetToken(
          new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
        );
        setAuthMode("reset");
        setAuthOpen(true);
      } else {
        setAuthOpen(false);
        setResetToken("");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (next: string) => {
    if (window.location.pathname !== next)
      window.history.pushState({}, "", next);
    setPath(next);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const expire = (event: Event) => {
      const revokedToken = (event as CustomEvent<{ token?: string }>).detail
        ?.token;
      setSession((current) => {
        if (revokedToken && current?.token !== revokedToken) return current;
        localStorage.removeItem("transitsync-session");
        return null;
      });
    };
    window.addEventListener("transitsync:session-expired", expire);
    return () =>
      window.removeEventListener("transitsync:session-expired", expire);
  }, []);
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
    api<{ user: Session["user"] }>("/api/auth/me", {}, session.token)
      .then(({ user }) => {
        if (!active || JSON.stringify(user) === JSON.stringify(session.user))
          return;
        const refreshed = { ...session, user };
        localStorage.setItem("transitsync-session", JSON.stringify(refreshed));
        setSession(refreshed);
      })
      .catch(() => {
        // A 401 clears the matching session; transient API failures preserve it.
      });
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const correctPath = dashboardPaths[session.user.role];
    if (
      path !== "/" &&
      path !== "/reset-password" &&
      window.location.pathname !== correctPath
    ) {
      window.history.replaceState({}, "", correctPath);
      setPath(correctPath);
    }
  }, [session, path]);

  if (session && path !== "/" && path !== "/reset-password")
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
    (Object.keys(dashboardPaths) as Role[]).find(
      (role) => dashboardPaths[role] === path,
    ) ?? null;
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
              navigate(dashboardPaths[session.user.role]);
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
        resetToken={resetToken}
        onResetComplete={() => {
          window.history.replaceState({}, "", "/");
          setPath("/");
          setResetToken("");
          setAuthMode("login");
          setAuthOpen(true);
        }}
        onClose={() => {
          setAuthOpen(false);
          if (path === "/reset-password") {
            window.history.replaceState({}, "", "/");
            setPath("/");
            setResetToken("");
          }
        }}
        onAuthenticated={(value) => {
          setSession(value);
          setAuthOpen(false);
          navigate(dashboardPaths[value.user.role]);
        }}
      />
    </>
  );
}
