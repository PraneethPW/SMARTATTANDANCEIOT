import { motion } from 'framer-motion';
import { ArrowRight, BusFront, CalendarDays, Fingerprint, GraduationCap, Radar, ShieldCheck, Users } from 'lucide-react';

type Role = 'STUDENT' | 'PARENT';

export default function PortalEntry({ role, onSignIn, onRegister, onNavigate }: { role: Role; onSignIn: () => void; onRegister: () => void; onNavigate: (path: string) => void }) {
  const parent = role === 'PARENT';
  const title = parent ? 'Stay close to every journey.' : 'Your campus day, connected.';
  const subtitle = parent
    ? 'See your linked children’s bus journeys, class timetable, and faculty-reviewed attendance in one secure view.'
    : 'Follow your bus journey, timetable, and attendance as real campus events reach your account.';
  const features = [
    { icon: Fingerprint, title: 'Attendance', copy: 'See provisional and faculty-reviewed class records from the live campus system.' },
    { icon: Radar, title: 'Bus journey', copy: 'Follow your assigned route and recorded RFID boarding events.' },
    { icon: CalendarDays, title: 'Timetable', copy: 'See the classes linked to your department, year, and section.' },
  ];

  return <main className="landing-shell portal-entry">
    <nav className="landing-nav">
      <a href="/" className="brand" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}><span className="brand-mark"><BusFront size={18}/></span><span>TransitSync <b>AI</b></span></a>
      <div className="nav-links"><a href={parent ? '/student' : '/parent'} onClick={(event) => { event.preventDefault(); onNavigate(parent ? '/student' : '/parent'); }}>{parent ? 'Student portal' : 'Parent portal'}</a><a href="/" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>Platform</a></div>
      <button className="button button-compact button-ghost" onClick={onSignIn}><span>Sign in</span><ArrowRight size={15}/></button>
    </nav>
    <section className="portal-entry-hero">
      <div className="portal-entry-glow" aria-hidden="true"/>
      <motion.div className="portal-entry-copy" initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7 }}>
        <span className="section-kicker">{parent ? <Users size={15}/> : <GraduationCap size={15}/>} {parent ? 'FAMILY PORTAL' : 'STUDENT PORTAL'}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div className="portal-entry-actions"><button className="button button-primary" onClick={onSignIn}>Open {parent ? 'parent' : 'student'} dashboard <ArrowRight size={17}/></button><button className="button button-ghost" onClick={onRegister}>Register as {parent ? 'parent' : 'student'}</button></div>
        <small>{parent ? 'Parent registration matches the contact details already stored for a student.' : 'Student registration connects your academic details and RFID card to a real registered bus.'}</small>
      </motion.div>
      <motion.div className="portal-entry-visual" initial={{ opacity: 0, x: 42 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .85, delay: .15 }} aria-hidden="true">
        <img src="/images/campus-transit-hero.png" alt=""/>
        <div className="portal-entry-visual-overlay"><BusFront size={27}/><span>LIVE CAMPUS SIGNAL</span><strong>Journey → Attendance → Your dashboard</strong></div>
      </motion.div>
    </section>
    <section className="portal-entry-features"><div className="portal-entry-heading"><span className="section-kicker"><ShieldCheck size={15}/> CONNECTED TO CAMPUS</span><h2>One account. A clear view.</h2><p>Each dashboard shows only the students linked to that account, with updates from the same operations system used by campus staff.</p></div><div className="portal-entry-feature-grid">{features.map(({ icon: Icon, title: featureTitle, copy }, index) => <motion.article key={featureTitle} initial={{ opacity: 0, y: 25 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .25 }} transition={{ delay: index * .1 }}><Icon size={26}/><h3>{featureTitle}</h3><p>{copy}</p></motion.article>)}</div></section>
  </main>;
}
