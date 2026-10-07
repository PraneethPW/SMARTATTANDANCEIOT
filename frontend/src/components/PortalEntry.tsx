import { motion } from "framer-motion";
import {
  ArrowRight,
  BusFront,
  CalendarDays,
  Fingerprint,
  GraduationCap,
  Radar,
  ShieldCheck,
  Users,
} from "lucide-react";

import { roleLabels, roleDescriptions, type Role } from "../roles";

export default function PortalEntry({
  role,
  onSignIn,
  onRegister,
  onNavigate,
}: {
  role: Role;
  onSignIn: () => void;
  onRegister: () => void;
  onNavigate: (path: string) => void;
}) {
  const parent = role === "PARENT";
  const staff = ["ADMIN", "FACULTY", "TRANSPORT"].includes(role);
  const title = staff
    ? {
        ADMIN: "Your campus, coordinated.",
        FACULTY: "Every class, accounted for.",
        TRANSPORT: "Every journey, connected.",
      }[role as "ADMIN" | "FACULTY" | "TRANSPORT"]
    : parent
      ? "Stay close to every journey."
      : "Your campus day, connected.";
  const subtitle = staff
    ? roleDescriptions[role]
    : parent
      ? "See your linked children’s bus journeys, class timetable, and faculty-reviewed attendance in one secure view."
      : "Follow your bus journey, timetable, and attendance as real campus events reach your account.";
  const features = staff
    ? [
        {
          icon: ShieldCheck,
          title: `${roleLabels[role]} controls`,
          copy: roleDescriptions[role],
        },
        {
          icon: Radar,
          title: "Connected records",
          copy: "Attendance and journey updates reach the linked student and parent accounts.",
        },
        {
          icon: Users,
          title: "Campus access",
          copy:
            role === "ADMIN"
              ? "Register with your name, email and password. An existing Admin verifies and approves campus access."
              : "Register with an invitation issued by your administrator for your email and role.",
        },
      ]
    : [
        {
          icon: Fingerprint,
          title: "Attendance",
          copy: "View class attendance and bus attendance separately, with faculty decisions and verification status.",
        },
        {
          icon: Radar,
          title: "Bus journey",
          copy: "Follow your assigned route, received GPS positions and RFID + face boarding status.",
        },
        {
          icon: CalendarDays,
          title: "Timetable",
          copy: "See the classes linked to your department, year, and section.",
        },
      ];

  return (
    <main className="landing-shell portal-entry">
      <nav className="landing-nav">
        <a
          href="/"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            onNavigate("/");
          }}
        >
          <span className="brand-mark">
            <BusFront size={18} />
          </span>
          <span>
            TransitSync <b>AI</b>
          </span>
        </a>
        <div className="nav-links">
          <a
            href={parent ? "/student" : "/parent"}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(parent ? "/student" : "/parent");
            }}
          >
            {parent ? "Student portal" : "Parent portal"}
          </a>
          <a
            href="/"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("/");
            }}
          >
            Platform
          </a>
        </div>
        <button
          className="button button-compact button-ghost"
          onClick={onSignIn}
        >
          <span>Sign in</span>
          <ArrowRight size={15} />
        </button>
      </nav>
      <section className="portal-entry-hero">
        <div className="portal-entry-glow" aria-hidden="true" />
        <motion.div
          className="portal-entry-copy"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <span className="section-kicker">
            {parent ? <Users size={15} /> : <GraduationCap size={15} />}{" "}
            {roleLabels[role].toUpperCase()} PORTAL
          </span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <div className="portal-entry-actions">
            <button className="button button-primary" onClick={onSignIn}>
              Open {roleLabels[role].toLowerCase()} dashboard{" "}
              <ArrowRight size={17} />
            </button>
            <button className="button button-ghost" onClick={onRegister}>
              Register as {roleLabels[role].toLowerCase()}
            </button>
          </div>
          <small>
            {role === "ADMIN"
              ? "Admin registration needs no invitation code. An existing campus Admin approves new Admin access."
              : staff
                ? "Staff registration requires a campus invitation. Forgot password is available on the sign-in and registration forms."
                : parent
                  ? "Parent registration matches the contact details already stored for a student."
                  : "Student registration links academic details, residency, RFID card and assigned transport."}
          </small>
        </motion.div>
        <motion.div
          className="portal-entry-visual"
          initial={{ opacity: 0, x: 42 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.85, delay: 0.15 }}
          aria-hidden="true"
        >
          <img src="/images/campus-transit-hero.png" alt="" />
          <div className="portal-entry-visual-overlay">
            <BusFront size={27} />
            <span>LIVE CAMPUS SIGNAL</span>
            <strong>Journey → Attendance → Your dashboard</strong>
          </div>
        </motion.div>
      </section>
      <section className="portal-entry-features">
        <div className="portal-entry-heading">
          <span className="section-kicker">
            <ShieldCheck size={15} /> CONNECTED TO CAMPUS
          </span>
          <h2>One account. A clear view.</h2>
          <p>
            Your account role determines the controls and records you can
            access. Updates come from the same connected campus system.
          </p>
        </div>
        <div className="portal-entry-feature-grid">
          {features.map(({ icon: Icon, title: featureTitle, copy }, index) => (
            <motion.article
              key={featureTitle}
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ delay: index * 0.1 }}
            >
              <Icon size={26} />
              <h3>{featureTitle}</h3>
              <p>{copy}</p>
            </motion.article>
          ))}
        </div>
      </section>
    </main>
  );
}
