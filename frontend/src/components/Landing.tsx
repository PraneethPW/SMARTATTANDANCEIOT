import Lenis from 'lenis';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  ArrowRight, BrainCircuit, BusFront, Fingerprint, MapPin, RadioTower,
  Radar, ScanLine, ShieldCheck, Signal, Sparkles,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { API_URL } from '../api';

const HeroScene = lazy(() => import('./HeroScene'));

gsap.registerPlugin(ScrollTrigger);

const story = [
  { no: '01', signal: 'RFID / SIGNED', title: 'Identity enters the stream.', copy: 'The ESP32 sends one authenticated, idempotent scan. The API stores evidence in Neon and publishes it to every authorized screen.', icon: ScanLine },
  { no: '02', signal: 'GPS / GEOFENCE', title: 'Arrival becomes trustworthy.', copy: 'Live coordinates enter the campus radius. A dwell timer rejects drive-bys and only resolves the trip after the location condition holds.', icon: MapPin },
  { no: '03', signal: 'ACADEMIC / CONTEXT', title: 'The right class is resolved.', copy: 'Department, year, section, arrival time, and timetable turn transport evidence into provisional academic attendance.', icon: Fingerprint },
  { no: '04', signal: 'FACULTY / AUDIT', title: 'A human closes the loop.', copy: 'Faculty receives the correct records in realtime, verifies each result, and leaves a permanent audit trail.', icon: ShieldCheck },
];

export default function Landing({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLElement>(null);
  const hero = useRef<HTMLElement>(null);
  const [apiState, setApiState] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3500) });
        if (active) setApiState(response.ok ? 'online' : 'offline');
      } catch { if (active) setApiState('offline'); }
    };
    void check();
    const interval = window.setInterval(check, 20_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  useLayoutEffect(() => {
    if (!root.current) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lenis = new Lenis({ duration: 1.15, smoothWheel: !reduceMotion });
    let frame = 0;
    const raf = (time: number) => { lenis.raf(time); frame = requestAnimationFrame(raf); };
    frame = requestAnimationFrame(raf);

    const context = gsap.context(() => {
      if (!reduceMotion) {
        gsap.to('.hero-cinematic', {
          yPercent: 13, scale: 1.12, ease: 'none',
          scrollTrigger: { trigger: '.hero-section', start: 'top top', end: 'bottom top', scrub: 1.2 },
        });
        gsap.to('.hero-copy', {
          y: -90, opacity: .22, ease: 'none',
          scrollTrigger: { trigger: '.hero-section', start: '38% top', end: 'bottom top', scrub: true },
        });
        gsap.to('.hero-digital-twin', {
          y: 80, rotate: 2.5, ease: 'none',
          scrollTrigger: { trigger: '.hero-section', start: 'top top', end: 'bottom top', scrub: 1 },
        });

        const cards = gsap.utils.toArray<HTMLElement>('.story-copy');
        const nodes = gsap.utils.toArray<HTMLElement>('.story-node');
        gsap.set(cards.slice(1), { autoAlpha: 0, y: 54 });
        gsap.set(nodes.slice(1), { opacity: .3, scale: .82 });
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: '.scroll-story', start: 'top top', end: 'bottom bottom', scrub: .8,
            onUpdate: (self) => gsap.set('.story-progress-fill', { scaleY: self.progress }),
          },
        });
        cards.forEach((card, index) => {
          if (index === 0) return;
          const previous = cards[index - 1];
          timeline
            .to(previous, { autoAlpha: 0, y: -36, duration: .28 }, index)
            .to(card, { autoAlpha: 1, y: 0, duration: .28 }, index)
            .to(nodes[index], { opacity: 1, scale: 1, duration: .22 }, index);
        });
        timeline.to('.story-image', { scale: 1.13, xPercent: -3, duration: 3, ease: 'none' }, 0);
        timeline.to('.story-route-pulse', { offsetDistance: '100%', duration: 3, ease: 'none' }, 0);

        gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((item) => {
          gsap.fromTo(item, { y: 70, opacity: 0 }, {
            y: 0, opacity: 1, duration: 1, ease: 'power3.out',
            scrollTrigger: { trigger: item, start: 'top 88%' },
          });
        });
      }
    }, root);

    return () => { cancelAnimationFrame(frame); lenis.destroy(); context.revert(); };
  }, []);

  const moveLight = (event: React.PointerEvent<HTMLElement>) => {
    if (!hero.current) return;
    const box = hero.current.getBoundingClientRect();
    hero.current.style.setProperty('--pointer-x', `${((event.clientX - box.left) / box.width) * 100}%`);
    hero.current.style.setProperty('--pointer-y', `${((event.clientY - box.top) / box.height) * 100}%`);
  };

  return (
    <main className="landing-shell" ref={root}>
      <nav className="landing-nav">
        <a href="#top" className="brand"><span className="brand-mark"><BusFront size={18} /></span><span>TransitSync <b>AI</b></span></a>
        <div className="nav-links"><a href="#system">Live chain</a><a href="#intelligence">Intelligence</a><a href="#trust">Trust</a></div>
        <button className="button button-compact button-ghost" onClick={onEnter}>Open control center <ArrowRight size={15} /></button>
      </nav>

      <section id="top" className="hero-section" ref={hero} onPointerMove={moveLight}>
        <div className="hero-cinematic" aria-hidden="true"><img src="/images/campus-transit-hero.png" alt="" /></div>
        <div className="hero-shade" />
        <div className="hero-spotlight" />
        <div className="signal-field" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ left: `${4 + index * 5.35}%`, top: `${14 + ((index * 37) % 68)}%`, animationDelay: `${index * -.28}s` }} />)}</div>
        <div className="hero-copy">
          <motion.div className="eyebrow" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }}>
            <span className={`live-dot ${apiState === 'offline' ? 'offline' : ''}`} /> {apiState === 'online' ? 'API online · ready for live hardware' : apiState === 'offline' ? 'API offline · start the backend' : 'Checking live infrastructure'}
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25, duration: .85 }}>
            Every arrival.<br /><span>Alive.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .4, duration: .8 }}>
            A realtime nervous system for college transit. RFID identity, GPS arrival, academic context, and faculty decisions move together—without a memory card or fabricated data.
          </motion.p>
          <motion.div className="hero-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .6 }}>
            <button className="button button-primary" onClick={onEnter}>Enter live platform <ArrowRight size={17} /></button>
            <a className="text-link" href="#system">Scroll through the signal <span>↓</span></a>
          </motion.div>
          <motion.div className="hero-proof" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .75 }}>
            <div><strong>Socket.IO</strong><span>instant operator updates</span></div>
            <div><strong>Neon</strong><span>durable event evidence</span></div>
            <div><strong>OpenRouter</strong><span>aggregate-safe analysis</span></div>
          </motion.div>
        </div>

        <motion.div className="hero-digital-twin" initial={{ opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .55, duration: 1 }}>
          <div className="digital-twin-head"><span><Radar size={14} /> LIVE DIGITAL TWIN</span><small>3D route layer</small></div>
          <div className="digital-twin-canvas"><Suspense fallback={<div className="scene-loading">Initializing route…</div>}><HeroScene /></Suspense></div>
          <div className="digital-twin-foot"><span><Signal size={13} /> Device channel</span><b>{apiState === 'online' ? 'READY' : 'STANDBY'}</b></div>
        </motion.div>

        <div className="hero-scroll-rail"><span>SCROLL TO FOLLOW THE EVENT</span><i /></div>
      </section>

      <section id="system" className="scroll-story">
        <div className="story-sticky">
          <div className="story-image"><img src="/images/campus-route-aerial.png" alt="A smart bus following a connected route through a university campus" /></div>
          <div className="story-vignette" />
          <div className="story-topline"><span className="section-kicker"><RadioTower size={14} /> ONE EVENT · FOUR REAL SYSTEMS</span><span>SCROLL / SCRUB</span></div>
          <div className="story-copy-stack">
            {story.map(({ no, signal, title, copy, icon: Icon }) => (
              <article className="story-copy" key={no}>
                <div className="story-number">{no}</div><span>{signal}</span><Icon size={28} /><h2>{title}</h2><p>{copy}</p>
              </article>
            ))}
          </div>
          <div className="story-rail">
            <div className="story-progress"><i className="story-progress-fill" /></div>
            {story.map(({ no, signal }) => <div className="story-node" key={no}><b>{no}</b><span>{signal.split(' / ')[0]}</span></div>)}
          </div>
          <div className="story-route-pulse"><BusFront size={16} /></div>
        </div>
      </section>

      <section id="intelligence" className="section intelligence-section">
        <div className="intelligence-orb" data-reveal><BrainCircuit size={58} /><span className="orb-ring ring-a" /><span className="orb-ring ring-b" /></div>
        <div className="intelligence-copy" data-reveal>
          <span className="section-kicker">EXPLAINABLE INTELLIGENCE</span>
          <h2>AI reads the patterns.<br />Rules protect the record.</h2>
          <p>OpenRouter analyzes privacy-safe aggregates from the live database for route delay, recurring exceptions, occupancy imbalance, and attendance trends. It cannot create, verify, or overwrite attendance.</p>
          <div className="feature-row"><span><i className="mint-dot" /> Current Neon aggregates</span><span><i className="mint-dot" /> No hidden automation</span><span><i className="mint-dot" /> Human approval</span></div>
        </div>
      </section>

      <section id="trust" className="section trust-section">
        <div className="trust-panel" data-reveal>
          <div><span className="section-kicker">BUILT FOR THE REAL ROUTE</span><h2>Signal drops.<br />Evidence survives.</h2></div>
          <div className="trust-points">
            <p><strong>Memory-card free</strong><span>ESP32 packets go directly to the API. Stable event IDs make safe RAM-queued retransmission possible without duplicate attendance.</span></p>
            <p><strong>Exception visibility</strong><span>Unregistered cards, wrong-bus scans, and timetable gaps surface immediately instead of disappearing behind a green dashboard.</span></p>
            <p><strong>Role-shaped actions</strong><span>Transport operates trips, faculty verifies records, and administrators control identity and access.</span></p>
          </div>
        </div>
      </section>

      <section className="final-cta" data-reveal>
        <div><span className="eyebrow"><Sparkles size={13} /> LIVE INPUTS. REAL OUTPUTS.</span><h2>Put the actual route<br />on the screen.</h2></div>
        <button className="button button-primary button-large" onClick={onEnter}>Launch control center <ArrowRight size={18} /></button>
      </section>

      <footer><a href="#top" className="brand"><span className="brand-mark"><BusFront size={17} /></span>TransitSync AI</a><p>Transport evidence. Academic clarity.</p><span>© 2026</span></footer>
    </main>
  );
}
