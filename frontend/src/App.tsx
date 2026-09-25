import { lazy, Suspense, useEffect, useState } from 'react';
import { api, type Session } from './api';
import AuthModal from './components/AuthModal';
import Landing from './components/Landing';
import PortalEntry from './components/PortalEntry';

const Dashboard = lazy(() => import('./components/Dashboard'));
const Portal = lazy(() => import('./components/Portal'));

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [session, setSession] = useState<Session | null>(() => {
    try { return JSON.parse(localStorage.getItem('transitsync-session') || 'null') as Session | null; }
    catch { return null; }
  });
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (next: string) => {
    if (window.location.pathname !== next) window.history.pushState({}, '', next);
    setPath(next);
    window.scrollTo(0, 0);
  };
  const logout = () => { localStorage.removeItem('transitsync-session'); setSession(null); navigate('/'); };

  useEffect(() => {
    if (!session) return;
    api('/api/auth/me', {}, session.token).catch(() => {
      localStorage.removeItem('transitsync-session');
      setSession(null);
    });
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const correctPath = session.user.role === 'STUDENT' ? '/student' : session.user.role === 'PARENT' ? '/parent' : '/app';
    if (window.location.pathname !== correctPath) {
      window.history.replaceState({}, '', correctPath);
      setPath(correctPath);
    }
  }, [session]);

  if (session) return <Suspense fallback={<div className="page-loader"><span>Loading dashboard…</span></div>}>{['PARENT', 'STUDENT'].includes(session.user.role) ? <Portal session={session} onLogout={logout} /> : <Dashboard session={session} onLogout={logout} />}</Suspense>;
  const portalRole = path === '/student' ? 'STUDENT' : path === '/parent' ? 'PARENT' : null;
  return <>{portalRole ? <PortalEntry role={portalRole} onSignIn={() => setAuthOpen(true)} onNavigate={navigate} /> : <Landing onEnter={() => setAuthOpen(true)} />}<AuthModal open={authOpen} portalRole={portalRole} onClose={() => setAuthOpen(false)} onAuthenticated={(value) => { setSession(value); setAuthOpen(false); navigate(value.user.role === 'STUDENT' ? '/student' : value.user.role === 'PARENT' ? '/parent' : '/app'); }} /></>;
}
