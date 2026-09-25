import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BusFront, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type Session } from '../api';

type Props = { open: boolean; initialMode?: 'login' | 'signup'; portalRole?: 'STUDENT' | 'PARENT' | null; onClose: () => void; onAuthenticated: (session: Session) => void };

export default function AuthModal({ open, initialMode = 'login', portalRole, onClose, onAuthenticated }: Props) {
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'login' | 'signup' | 'bootstrap'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [buses, setBuses] = useState<Array<{ code: string; route_name: string }>>([]);

  useEffect(() => {
    if (!open) return;
    api<{ initialized: boolean }>('/api/setup/status')
      .then((data) => { setInitialized(data.initialized); setMode(data.initialized ? initialMode : 'bootstrap'); })
      .catch((err: Error) => setError(`Cannot reach the API: ${err.message}`));
  }, [open, initialMode]);

  useEffect(() => {
    if (!open || portalRole !== 'STUDENT') return;
    api<{ buses: Array<{ code: string; route_name: string }> }>('/api/registration/buses')
      .then((result) => setBuses(result.buses))
      .catch((cause: Error) => setError(`Could not load registered buses: ${cause.message}`));
  }, [open, portalRole]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get('name') || ''), email: String(data.get('email') || ''), password: String(data.get('password') || ''),
      role: String(data.get('role') || 'FACULTY'),
      registrationNumber: String(data.get('registrationNumber') || ''),
      rfidUid: String(data.get('rfidUid') || ''),
      department: String(data.get('department') || ''),
      academicYear: Number(data.get('academicYear')),
      section: String(data.get('section') || ''),
      busCode: String(data.get('busCode') || ''),
      parentName: String(data.get('parentName') || ''),
      parentContact: String(data.get('parentContact') || ''),
    };
    try {
      const session = mode === 'bootstrap'
        ? await api<Session>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(payload) })
        : mode === 'signup'
          ? await api<Session>(portalRole === 'STUDENT' ? '/api/auth/student-signup' : portalRole === 'PARENT' ? '/api/auth/parent-signup' : '/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) })
          : await api<Session>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: payload.email, password: payload.password }) });
      localStorage.setItem('transitsync-session', JSON.stringify(session));
      onAuthenticated(session);
    } catch (err) { setError(err instanceof Error ? err.message : 'Authentication failed'); }
    finally { setBusy(false); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="auth-modal" initial={{ opacity: 0, scale: 0.94, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}>
            <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
            <div className="auth-visual">
              <div className="auth-grid" />
              <span className="brand-mark auth-logo"><BusFront size={24} /></span>
              <div><span className="section-kicker">SECURE OPERATIONS</span><h2>One live view.<br />Every trusted event.</h2><p>Device evidence and academic decisions stay separate, traceable, and visible in real time.</p></div>
              <div className="auth-badges"><span><ShieldCheck size={15} /> Role-based access</span><span><LockKeyhole size={15} /> Hashed credentials</span></div>
            </div>
            <div className="auth-form-panel">
              <button className="back-link" onClick={onClose}><ArrowLeft size={15} /> Back to experience</button>
              <div className="auth-heading">
                <span>{mode === 'bootstrap' ? 'FIRST-RUN SETUP' : mode === 'signup' ? portalRole ? `${portalRole} REGISTRATION` : 'JOIN THE LIVE OPERATION' : portalRole ? `${portalRole} PORTAL` : 'CONTROL CENTER'}</span>
                <h3>{mode === 'bootstrap' ? 'Initialize workspace' : mode === 'signup' ? portalRole ? `Register as ${portalRole.toLowerCase()}` : 'Create your account' : portalRole ? `Open your ${portalRole.toLowerCase()} dashboard` : 'Welcome back'}</h3>
                <p>{mode === 'bootstrap' ? 'Create the first administrator. Setup closes automatically afterward.' : mode === 'signup' ? portalRole === 'STUDENT' ? 'Enter your academic and bus details. A new registration becomes active immediately; an existing record must match its RFID card and class.' : portalRole === 'PARENT' ? 'Use the parent name and contact already recorded for your child to link your account.' : 'Staff accounts are created by a campus administrator.' : portalRole ? 'Sign in with your linked campus account to see current records.' : 'Sign in with your institutional account. Faculty and transport accounts are created by a campus administrator.'}</p>
              </div>
              <form onSubmit={submit}>
                {(mode === 'bootstrap' || mode === 'signup') && <label>{mode === 'bootstrap' ? 'Administrator name' : 'Full name'}<input name="name" required minLength={2} placeholder="Your full name" autoComplete="name" /></label>}
                <label>Email address<input name="email" type="email" required placeholder="admin@college.edu" /></label>
                {mode === 'signup' && !portalRole && <label>Account type<select name="role" defaultValue="FACULTY"><option value="FACULTY">Faculty member</option><option value="TRANSPORT">Transport operator</option></select></label>}
                {mode === 'signup' && portalRole && <label>Student registration number<input name="registrationNumber" required maxLength={40} placeholder="Your campus registration number" /></label>}
                {mode === 'signup' && portalRole === 'STUDENT' && <>
                  <label>RFID card UID<input name="rfidUid" required minLength={4} maxLength={64} placeholder="UID printed on your campus card" /></label>
                  <div className="form-pair"><label>Department<input name="department" required minLength={2} placeholder="CSE" /></label><label>Year<input name="academicYear" type="number" min="1" max="8" required /></label></div>
                  <label>Section<input name="section" required placeholder="A" /></label>
                  <label>Assigned bus<select name="busCode" required defaultValue=""><option value="" disabled>Select your registered bus</option>{buses.map((bus) => <option key={bus.code} value={bus.code}>{bus.code} · {bus.route_name}</option>)}</select></label>
                  {!buses.length && <div className="form-error">No campus buses are registered yet. Ask the transport office to add your bus first.</div>}
                  <div className="form-pair"><label>Parent name (optional)<input name="parentName" minLength={2} placeholder="As recorded by campus" /></label><label>Parent contact (optional)<input name="parentContact" type="tel" minLength={6} placeholder="Contact number" /></label></div>
                  <small className="registration-help">Enter both parent fields to let a parent register and follow this student.</small>
                </>}
                {mode === 'signup' && portalRole === 'PARENT' && <label>Parent contact on student record<input name="parentContact" type="tel" required minLength={6} placeholder="Contact number on file" /></label>}
                <label>Password<div className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} required minLength={mode === 'login' ? 1 : 10} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••••" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Toggle password">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
                {error && <div className="form-error">{error}</div>}
                <button className="button button-primary auth-submit" disabled={busy || initialized === null || (mode === 'signup' && portalRole === 'STUDENT' && !buses.length)}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{mode === 'bootstrap' ? 'Create secure workspace' : mode === 'signup' ? portalRole ? `Register & open ${portalRole.toLowerCase()} dashboard` : 'Create account & continue' : portalRole ? `Open ${portalRole.toLowerCase()} dashboard` : 'Enter control center'}</button>
                {initialized && mode !== 'bootstrap' && portalRole && <div className="auth-switch"><span>{mode === 'login' ? 'New to TransitSync?' : 'Already have an account?'}</span><button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? `Register as ${portalRole.toLowerCase()}` : 'Sign in instead'}</button></div>}
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
