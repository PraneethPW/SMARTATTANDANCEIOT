import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BusFront, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type Session } from '../api';

type Props = { open: boolean; onClose: () => void; onAuthenticated: (session: Session) => void };

export default function AuthModal({ open, onClose, onAuthenticated }: Props) {
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'login' | 'bootstrap'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api<{ initialized: boolean }>('/api/setup/status')
      .then((data) => { setInitialized(data.initialized); setMode(data.initialized ? 'login' : 'bootstrap'); })
      .catch((err: Error) => setError(`Cannot reach the API: ${err.message}`));
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get('name') || ''), email: String(data.get('email') || ''), password: String(data.get('password') || ''),
    };
    try {
      const session = mode === 'bootstrap'
        ? await api<Session>('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(payload) })
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
                <span>{mode === 'bootstrap' ? 'FIRST-RUN SETUP' : 'CONTROL CENTER'}</span>
                <h3>{mode === 'bootstrap' ? 'Initialize workspace' : 'Welcome back'}</h3>
                <p>{mode === 'bootstrap' ? 'Create the first administrator. Setup closes automatically afterward.' : 'Sign in with your institutional account.'}</p>
              </div>
              <form onSubmit={submit}>
                {mode === 'bootstrap' && <label>Administrator name<input name="name" required minLength={2} placeholder="Your full name" /></label>}
                <label>Email address<input name="email" type="email" required placeholder="admin@college.edu" /></label>
                <label>Password<div className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} required minLength={mode === 'bootstrap' ? 10 : 1} placeholder="••••••••••" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Toggle password">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
                {error && <div className="form-error">{error}</div>}
                <button className="button button-primary auth-submit" disabled={busy || initialized === null}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{mode === 'bootstrap' ? 'Create secure workspace' : 'Enter control center'}</button>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

