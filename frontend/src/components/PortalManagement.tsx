import { motion } from 'framer-motion';
import { ArrowRight, GraduationCap, Link2, UserRoundPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';

type PortalAccount = { id: string; name: string; email: string; role: string; linked_students: Array<{ id: string; name: string; registrationNumber: string }> };

export default function PortalManagement({ token, refreshKey, onCreate, onLink }: { token: string; refreshKey: number; onCreate: (role: 'STUDENT' | 'PARENT') => void; onLink: () => void }) {
  const [accounts, setAccounts] = useState<PortalAccount[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<{ users: PortalAccount[] }>('/api/users', {}, token)
      .then(({ users }) => { if (active) { setAccounts(users.filter((user) => user.role === 'STUDENT' || user.role === 'PARENT')); setError(''); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load portal accounts'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, refreshKey]);

  const count = (role: string) => accounts.filter((account) => account.role === role).length;
  return <div className="page-stack portal-management">
    <div className="page-title-row"><div><span className="section-kicker">ROLE ACCESS</span><h2>Student & parent portals</h2><p>Create linked accounts here. Each person signs in through their own portal and sees only their linked student records.</p></div></div>
    <div className="portal-management-grid">
      <motion.section className="portal-management-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}><GraduationCap size={27}/><span>STUDENT PORTAL</span><h3>{count('STUDENT')} student accounts</h3><p>Students see their own attendance, boarding history, bus route, and timetable.</p><div><button className="button button-primary button-compact" onClick={() => onCreate('STUDENT')}><UserRoundPlus size={15}/> Add student account</button><a href="/student" target="_blank" rel="noreferrer">Open sign-in <ArrowRight size={14}/></a></div></motion.section>
      <motion.section className="portal-management-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08 }}><Users size={27}/><span>PARENT PORTAL</span><h3>{count('PARENT')} parent accounts</h3><p>Parents can switch between linked children and follow their campus records.</p><div><button className="button button-primary button-compact" onClick={() => onCreate('PARENT')}><UserRoundPlus size={15}/> Add parent account</button><a href="/parent" target="_blank" rel="noreferrer">Open sign-in <ArrowRight size={14}/></a></div></motion.section>
    </div>
    <div className="portal-management-flow"><span>1 · Register a student in Registry</span><ArrowRight size={16}/><span>2 · Create a student or parent account</span><ArrowRight size={16}/><span>3 · Sign in at the portal</span></div>
    <section className="dash-card"><div className="card-head"><div><h3>Linked portal accounts</h3><span>Real accounts and student links from the live database</span></div><button className="button button-ghost button-compact" onClick={onLink}><Link2 size={15}/> Link another child</button></div>
      {error && <div className="form-error">{error}</div>}
      {loading ? <div className="portal-empty">Loading accounts…</div> : accounts.length ? <div className="portal-list">{accounts.map((account) => <div className="portal-list-row" key={account.id}><span className="portal-row-icon">{account.role === 'PARENT' ? <Users size={18}/> : <GraduationCap size={18}/>}</span><div><strong>{account.name} · {account.role === 'PARENT' ? 'Parent' : 'Student'}</strong><small>{account.email}</small><small>{account.linked_students?.length ? account.linked_students.map((student) => `${student.name} (${student.registrationNumber})`).join(' · ') : 'No active student linked'}</small></div><span className={`portal-badge ${account.linked_students?.length ? '' : 'warn'}`}>{account.linked_students?.length ? `${account.linked_students.length} linked` : 'Needs link'}</span></div>)}</div> : <div className="portal-empty">No student or parent accounts yet. Create a linked account above to activate its dashboard.</div>}
    </section>
  </div>;
}
