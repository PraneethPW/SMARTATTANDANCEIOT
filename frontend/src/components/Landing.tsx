import Lenis from 'lenis';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, BrainCircuit, BusFront, Fingerprint, MapPin, Radar, ScanLine, ShieldCheck } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';

const HeroScene = lazy(() => import('./HeroScene'));

gsap.registerPlugin(ScrollTrigger);

const flow = [
  { no: '01', title: 'Identity captured', copy: 'The ESP32 submits a signed RFID event. It becomes immutable transport evidence—not attendance.', icon: ScanLine },
  { no: '02', title: 'Arrival verified', copy: 'GPS position must remain inside the configured campus radius for the full dwell period.', icon: MapPin },
  { no: '03', title: 'Classes resolved', copy: 'The server separates the manifest by department, year, section, and the next timetable session.', icon: Fingerprint },
  { no: '04', title: 'Faculty decides', copy: 'Provisional rows reach the right faculty view for approval, correction, and a complete audit trail.', icon: ShieldCheck },
];

export default function Landing({ onEnter }: { onEnter: () => void }) {
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
    let frame = 0;
    const raf = (time: number) => { lenis.raf(time); frame = requestAnimationFrame(raf); };
    frame = requestAnimationFrame(raf);
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((item) => {
        gsap.fromTo(item, { y: 70, opacity: 0 }, {
          y: 0, opacity: 1, duration: 1, ease: 'power3.out',
          scrollTrigger: { trigger: item, start: 'top 88%' },
        });
      });
    });
    return () => { cancelAnimationFrame(frame); lenis.destroy(); ctx.revert(); };
  }, []);

  return (
    <main className="landing-shell">
      <div className="aurora aurora-one" />
      <div className="aurora aurora-two" />
      <nav className="landing-nav">
        <a href="#top" className="brand"><span className="brand-mark"><BusFront size={18} /></span><span>TransitSync <b>AI</b></span></a>
        <div className="nav-links"><a href="#system">System</a><a href="#intelligence">Intelligence</a><a href="#trust">Trust</a></div>
        <button className="button button-compact button-ghost" onClick={onEnter}>Open control center <ArrowRight size={15} /></button>
      </nav>

      <section id="top" className="hero-section">
        <div className="hero-copy">
          <motion.div className="eyebrow" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <span className="live-dot" /> RFID + GPS + academic context
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.85 }}>
            Arrival becomes<br /><span>attendance.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.8 }}>
            One secure event stream connects the college bus, campus geofence, class timetable, and faculty—without confusing boarding with being present in class.
          </motion.p>
          <motion.div className="hero-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            <button className="button button-primary" onClick={onEnter}>Enter live platform <ArrowRight size={17} /></button>
            <a className="text-link" href="#system">Explore the flow <span>↓</span></a>
          </motion.div>
          <motion.div className="hero-proof" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }}>
            <div><strong>Deterministic</strong><span>attendance logic</span></div>
            <div><strong>Realtime</strong><span>operations stream</span></div>
            <div><strong>Auditable</strong><span>faculty decisions</span></div>
          </motion.div>
        </div>
        <div className="hero-visual" aria-label="Animated three-dimensional smart college bus">
          <Suspense fallback={<div className="scene-loading">Initializing 3D route…</div>}><HeroScene /></Suspense>
          <div className="floating-card card-scan"><span className="icon-box"><ScanLine size={18} /></span><div><small>RFID EVENT</small><strong>Identity secured</strong></div><span className="success-pill">LIVE</span></div>
          <div className="floating-card card-campus"><span className="radar-icon"><Radar size={18} /></span><div><small>ARRIVAL GATE</small><strong>Dwell verified</strong></div></div>
          <div className="scene-caption"><span>TRANSPORT</span><i /><span>ACADEMICS</span></div>
        </div>
      </section>

      <section id="system" className="section flow-section">
        <div className="section-intro" data-reveal>
          <span className="section-kicker">THE TRUSTED CHAIN</span>
          <h2>From one mixed bus<br />to every correct class.</h2>
          <p>The real innovation lives in the transition: a verified campus arrival turns transport evidence into a reviewable academic record.</p>
        </div>
        <div className="flow-grid">
          {flow.map(({ no, title, copy, icon: Icon }, index) => (
            <article className="flow-card" data-reveal key={no} style={{ '--delay': `${index * 70}ms` } as React.CSSProperties}>
              <div className="flow-top"><span>{no}</span><Icon size={24} /></div><h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="intelligence" className="section intelligence-section">
        <div className="intelligence-orb" data-reveal><BrainCircuit size={58} /><span className="orb-ring ring-a" /><span className="orb-ring ring-b" /></div>
        <div className="intelligence-copy" data-reveal>
          <span className="section-kicker">EXPLAINABLE INTELLIGENCE</span>
          <h2>AI reads the patterns.<br />Rules protect the record.</h2>
          <p>OpenRouter analyzes privacy-safe aggregates for route delay, recurring exceptions, occupancy imbalance, and attendance trends. It cannot create, verify, or overwrite attendance.</p>
          <div className="feature-row"><span><i className="mint-dot" /> Aggregates only</span><span><i className="mint-dot" /> No hidden automation</span><span><i className="mint-dot" /> Human approval</span></div>
        </div>
      </section>

      <section id="trust" className="section trust-section">
        <div className="trust-panel" data-reveal>
          <div><span className="section-kicker">BUILT FOR THE REAL ROUTE</span><h2>Signal drops.<br />Evidence survives.</h2></div>
          <div className="trust-points">
            <p><strong>Safe retransmission</strong><span>Every device event carries a stable ID, so RAM-queued retries never duplicate attendance.</span></p>
            <p><strong>Exception visibility</strong><span>Unregistered cards, wrong-bus scans, and timetable gaps are surfaced—not silently discarded.</span></p>
            <p><strong>One source of truth</strong><span>Parents, transport teams, faculty, and administrators see views derived from the same event trail.</span></p>
          </div>
        </div>
      </section>

      <section className="final-cta" data-reveal>
        <div><span className="eyebrow"><span className="live-dot" /> Ready for live inputs</span><h2>See the campus move<br />as one system.</h2></div>
        <button className="button button-primary button-large" onClick={onEnter}>Launch control center <ArrowRight size={18} /></button>
      </section>

      <footer><a href="#top" className="brand"><span className="brand-mark"><BusFront size={17} /></span>TransitSync AI</a><p>Transport evidence. Academic clarity.</p><span>© 2026</span></footer>
    </main>
  );
}
