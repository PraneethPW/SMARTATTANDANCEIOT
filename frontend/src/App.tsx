import { lazy, Suspense, useEffect, useState } from 'react';
import { api, type Session } from './api';
import AuthModal from './components/AuthModal';
import Landing from './components/Landing';

const Dashboard = lazy(() => import('./components/Dashboard'));
const Portal = lazy(() => import('./components/Portal'));

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    try { return JSON.parse(localStorage.getItem('transitsync-session') || 'null') as Session | null; }
    catch { return null; }
  });
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    if (!session) return;
    api('/api/auth/me', {}, session.token).catch(() => {
      localStorage.removeItem('transitsync-session');
      setSession(null);
    });
  }, [session]);

  if (session) return <Suspense fallback={<div className="page-loader"><span>Loading dashboard…</span></div>}>{['PARENT', 'STUDENT'].includes(session.user.role) ? <Portal session={session} onLogout={() => { localStorage.removeItem('transitsync-session'); setSession(null); }} /> : <Dashboard session={session} onLogout={() => { localStorage.removeItem('transitsync-session'); setSession(null); }} />}</Suspense>;
  return <><Landing onEnter={() => setAuthOpen(true)} /><AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthenticated={(value) => { setSession(value); setAuthOpen(false); }} /></>;
}
