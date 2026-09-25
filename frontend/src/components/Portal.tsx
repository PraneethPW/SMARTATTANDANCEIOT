import { motion } from 'framer-motion';
import { Activity, ArrowRight, BusFront, CalendarDays, CheckCircle2, CircleUserRound, Clock3, Fingerprint, GraduationCap, LayoutDashboard, LogOut, Menu, Radar, RefreshCw, Route, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { io } from 'socket.io-client';
import { api, API_URL, type Session } from '../api';

type Student = { id: string; name: string; registration_number: string; department: string; academic_year: number; section: string; bus_code: string | null; route_name: string | null; driver_name: string | null; bus_status: string | null; last_seen_at: string | null; relationship: string; trip_status: string | null; trip_started_at: string | null; trip_arrived_at: string | null; boarded_at: string | null };
type Attendance = { id: string; student_id: string; status: string; source: string; session_date: string; subject_code: string; subject_name: string; bus_code: string | null };
type Scan = { id: string; student_id: string; device_timestamp: string; received_at: string; exception_type: string | null; bus_code: string; trip_status: string };
type Timetable = { id: string; student_id: string; weekday: number; starts_at: string; ends_at: string; subject_code: string; subject_name: string };
type PortalBus = { id: string; code: string; route_name: string; status: string; trip_started_at: string | null; trip_arrived_at: string | null };
type PortalData = { students: Student[]; attendance: Attendance[]; scans: Scan[]; timetable: Timetable[]; buses: PortalBus[] };
type Tab = 'overview' | 'children' | 'buses' | 'attendance' | 'journey' | 'timetable';
const studentNav = [{ id: 'overview', label: 'My day', icon: LayoutDashboard }, { id: 'journey', label: 'My bus', icon: Radar }, { id: 'buses', label: 'Campus buses', icon: BusFront }, { id: 'attendance', label: 'Attendance', icon: Fingerprint }, { id: 'timetable', label: 'Timetable', icon: CalendarDays }] as const;
const parentNav = [{ id: 'overview', label: 'Family overview', icon: LayoutDashboard }, { id: 'children', label: 'My children', icon: GraduationCap }, { id: 'buses', label: 'Campus buses', icon: BusFront }, { id: 'journey', label: 'Bus journeys', icon: Radar }, { id: 'attendance', label: 'Attendance', icon: Fingerprint }, { id: 'timetable', label: 'Timetable', icon: CalendarDays }] as const;
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const date = (value: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const time = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export default function Portal({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await api<PortalData>('/api/portal', {}, session.token);
      setData(next); setSelected((current) => next.students.some((student) => student.id === current) ? current : next.students[0]?.id || ''); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load your dashboard'); }
    finally { setLoading(false); }
  }, [session.token]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const socket = io(API_URL, { auth: { token: session.token }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('portal:changed', () => void refresh(true));
    const poll = window.setInterval(() => void refresh(true), 15_000);
    return () => { socket.disconnect(); window.clearInterval(poll); };
  }, [refresh, session.token]);
  const student = data?.students.find((item) => item.id === selected);
  const records = useMemo(() => data?.attendance.filter((item) => item.student_id === selected) || [], [data, selected]);
  const scans = useMemo(() => data?.scans.filter((item) => item.student_id === selected) || [], [data, selected]);
  const classes = useMemo(() => data?.timetable.filter((item) => item.student_id === selected) || [], [data, selected]);
  const confirmed = records.filter((item) => item.status === 'PRESENT').length;
  const reviewed = records.filter((item) => item.status !== 'PROVISIONAL').length;
  const parent = session.user.role === 'PARENT';
  const nav = parent ? parentNav : studentNav;

  return <div className="dashboard-shell portal-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top"><div className="brand"><span className="brand-mark"><BusFront size={18}/></span><span>TransitSync <b>AI</b></span></div><button className="icon-button mobile-only" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="workspace-chip"><div className="workspace-avatar">{session.user.role === 'PARENT' ? 'PA' : 'ST'}</div><div><span>{session.user.role === 'PARENT' ? 'Family portal' : 'Student portal'}</span><strong>Smart Campus</strong></div></div>
      <nav className="side-nav"><span className="side-label">{parent ? 'MY FAMILY' : 'MY CAMPUS'}</span>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setMobileNav(false); }}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-system"><div><span className="live-dot"/><strong>{connected ? 'Live updates connected' : 'Refreshing automatically'}</strong></div><p>Bus and attendance changes appear here as they happen.</p></div>
      <button className="profile-card" onClick={onLogout}><span><CircleUserRound size={20}/></span><div><strong>{session.user.name}</strong><small>{session.user.role}</small></div><LogOut size={16}/></button>
    </aside>
    <main className="dashboard-main">
      <header className="dash-header"><button className="icon-button mobile-only" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button><div><span className="dash-kicker">{session.user.role === 'PARENT' ? 'FAMILY' : 'STUDENT'} / {tab.toUpperCase()}</span><h1>{nav.find((item) => item.id === tab)?.label}</h1></div><div className="header-actions"><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh"><RefreshCw size={17} className={loading ? 'spin' : ''}/></button><div className="header-avatar">{session.user.name.slice(0, 2).toUpperCase()}</div></div></header>
      <div className="dashboard-content portal-content">
        {error && <div className="form-error">{error}</div>}
        {loading && !data && <div className="page-loader"><RefreshCw className="spin"/><span>Loading your campus view…</span></div>}
        {data && !data.students.length && <div className="empty-panel"><GraduationCap size={36}/><h3>No student linked yet</h3><p>{parent ? 'Link a child using the parent name and contact on their campus record.' : 'Ask your campus administrator to link your account to a student registration number.'}</p></div>}
        {parent && data && !data.students.length && <ParentLinkForm token={session.token} onLinked={() => void refresh(true)}/>}
        {student && <>
          {data!.students.length > 1 && tab !== 'overview' && tab !== 'children' && <div className="portal-selector"><span>Viewing student</span><select value={selected} onChange={(event) => setSelected(event.target.value)}>{data!.students.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.registration_number}</option>)}</select></div>}
          {parent && tab === 'overview' && <motion.div className="page-stack" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <section className="welcome-row portal-hero"><div><span className="section-kicker"><Activity size={15}/> FAMILY LIVE VIEW</span><h2>Good to see you, {session.user.name.split(' ')[0]}.</h2><p>Follow each linked child from boarding to campus arrival and reviewed class attendance.</p></div><GraduationCap className="portal-hero-icon" size={105}/></section>
            <div className="portal-stat-grid"><div className="portal-stat"><GraduationCap/><span>Linked children</span><strong>{data!.students.length}</strong><small>Visible to this parent account</small></div><div className="portal-stat"><Fingerprint/><span>Boarded on current trips</span><strong>{data!.students.filter((item) => ['ACTIVE', 'ARRIVED'].includes(item.trip_status || '') && item.boarded_at).length}</strong><small>Valid RFID scans</small></div><div className="portal-stat"><BusFront/><span>Buses in transit</span><strong>{data!.students.filter((item) => item.bus_status === 'IN_TRANSIT').length}</strong><small>Assigned child journeys</small></div><div className="portal-stat"><Clock3/><span>Awaiting faculty review</span><strong>{data!.attendance.filter((item) => item.status === 'PROVISIONAL').length}</strong><small>Across linked children</small></div></div>
            <div className="page-title-row"><div><span className="section-kicker">CHILD STATUS</span><h2>Where they are now</h2><p>Bus and boarding states come from the same trip and RFID events used by transport and faculty.</p></div><button className="portal-text-button" onClick={() => setTab('children')}>All children <ArrowRight size={14}/></button></div>
            <div className="family-grid">{data!.students.map((child) => <ChildCard key={child.id} student={child} attendance={data!.attendance.filter((item) => item.student_id === child.id)} onOpen={() => { setSelected(child.id); setTab('journey'); }}/>)}</div>
          </motion.div>}
          {parent && tab === 'children' && <motion.div className="page-stack" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}><div className="page-title-row"><div><span className="section-kicker">LINKED STUDENTS</span><h2>Your children</h2><p>Each card is scoped to a child linked to your account.</p></div></div><div className="family-grid">{data!.students.map((child) => <ChildCard key={child.id} student={child} attendance={data!.attendance.filter((item) => item.student_id === child.id)} onOpen={() => { setSelected(child.id); setTab('journey'); }}/>)}</div><ParentLinkForm token={session.token} onLinked={() => void refresh(true)}/></motion.div>}
          {!parent && tab === 'overview' && <motion.div className="page-stack" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <section className="welcome-row portal-hero"><div><span className="section-kicker"><Activity size={15}/> CONNECTED CAMPUS</span><h2>{session.user.role === 'PARENT' ? `Good to see you, ${session.user.name.split(' ')[0]}.` : `Welcome back, ${student.name.split(' ')[0]}.`}</h2><p>{student.name} · {student.department} · Year {student.academic_year}, Section {student.section}</p></div><GraduationCap className="portal-hero-icon" size={105}/></section>
            <div className="portal-stat-grid"><div className="portal-stat"><CheckCircle2/><span>Confirmed present</span><strong>{confirmed}</strong><small>of {reviewed} reviewed sessions</small></div><div className="portal-stat"><Fingerprint/><span>Latest trip boarding</span><strong>{student.boarded_at ? 'Boarded' : 'No scan'}</strong><small>{student.boarded_at ? time(student.boarded_at) : 'Waiting for RFID evidence'}</small></div><div className="portal-stat"><BusFront/><span>Bus status</span><strong>{student.bus_status || '—'}</strong><small>{student.bus_code || 'No bus assigned'} · {student.route_name || 'No route'}</small></div><div className="portal-stat"><CalendarDays/><span>Weekly classes</span><strong>{classes.length}</strong><small>From the live timetable</small></div></div>
            <div className="portal-grid"><section className="dash-card"><div className="card-head"><div><h3>Recent attendance</h3><span>Faculty reviewed academic sessions</span></div><button className="portal-text-button" onClick={() => setTab('attendance')}>View all <ArrowRight size={14}/></button></div>{records.slice(0, 4).map((item) => <AttendanceRow key={item.id} item={item}/>)}{!records.length && <div className="portal-empty">No class attendance recorded yet.</div>}</section><section className="dash-card"><div className="card-head"><div><h3>Journey signal</h3><span>RFID boarding evidence from your bus</span></div><button className="portal-text-button" onClick={() => setTab('journey')}>Journey <ArrowRight size={14}/></button></div><div className="portal-bus-summary"><span><BusFront size={22}/></span><div><strong>{student.bus_code || 'No bus assigned'}</strong><small>{student.route_name || 'Contact the transport office'}</small></div><em>{student.bus_status || 'UNASSIGNED'}</em></div>{scans[0] ? <div className="portal-signal"><span className="live-dot"/><div><strong>Last card scan · {date(scans[0].received_at)}</strong><small>{time(scans[0].received_at)} · {scans[0].bus_code}</small></div></div> : <div className="portal-empty">No RFID boarding scan yet.</div>}</section></div>
          </motion.div>}
          {tab === 'attendance' && <motion.div className="page-stack" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}><div className="page-title-row"><div><span className="section-kicker">ACADEMIC RECORD</span><h2>{student.name}'s attendance</h2><p>Bus arrival can create a provisional record. Faculty verification confirms the final status.</p></div></div><div className="portal-list">{records.map((item) => <AttendanceRow key={item.id} item={item}/>)}{!records.length && <div className="portal-empty">Attendance will appear when a timetable session is matched to an arrived bus.</div>}</div></motion.div>}
          {tab === 'journey' && <motion.div className="page-stack" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}><div className="page-title-row"><div><span className="section-kicker">TRANSPORT FLOW</span><h2>{parent ? `${student.name}'s bus journey` : 'My bus journey'}</h2><p>Trip status and boarding evidence update from transport actions and registered device events.</p></div></div><div className="portal-route-card"><Route size={28}/><div><span>ASSIGNED ROUTE</span><h3>{student.route_name || 'No route assigned'}</h3><p>{student.bus_code || '—'} · {student.driver_name || 'Driver not assigned'} · {student.last_seen_at ? `Last bus signal ${date(student.last_seen_at)} at ${time(student.last_seen_at)}` : 'No GPS signal yet'}</p></div><span className="portal-route-status">{student.bus_status || 'UNASSIGNED'}</span></div><div className="portal-journey-status"><div><span>TRIP</span><strong>{student.trip_status || 'No trip started'}</strong><small>{student.trip_started_at ? `Started ${date(student.trip_started_at)} at ${time(student.trip_started_at)}` : 'Waiting for transport'}</small></div><div><span>BOARDING</span><strong>{student.boarded_at ? 'Boarded' : 'No valid scan yet'}</strong><small>{student.boarded_at ? `${date(student.boarded_at)} at ${time(student.boarded_at)}` : 'RFID device has not recorded boarding for this trip'}</small></div><div><span>ARRIVAL</span><strong>{student.trip_arrived_at ? 'Reached campus' : 'Not confirmed'}</strong><small>{student.trip_arrived_at ? `${date(student.trip_arrived_at)} at ${time(student.trip_arrived_at)}` : 'Transport or campus geofence confirms arrival'}</small></div></div><div className="portal-list">{scans.map((item) => <div className="portal-list-row" key={item.id}><span className="portal-row-icon"><Fingerprint size={18}/></span><div><strong>RFID boarding scan · {item.bus_code}</strong><small>{date(item.received_at)} at {time(item.received_at)} · Trip {item.trip_status.toLowerCase()}</small></div><span className={`portal-badge ${item.exception_type ? 'warn' : ''}`}>{item.exception_type ? item.exception_type.replaceAll('_', ' ') : 'Recorded'}</span></div>)}{!scans.length && <div className="portal-empty">No boarding scans recorded for this student.</div>}</div></motion.div>}
          {tab === 'buses' && <motion.div className="page-stack" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}><div className="page-title-row"><div><span className="section-kicker">LIVE FLEET</span><h2>Campus bus status</h2><p>Trip start and arrival times update from transport actions and GPS geofence evidence.</p></div></div><div className="campus-bus-grid">{data!.buses.map((bus) => <article className={`campus-bus-card ${data!.students.some((item) => item.bus_code === bus.code) ? 'assigned' : ''}`} key={bus.id}><div><span className="portal-row-icon"><BusFront size={20}/></span><div><strong>{bus.code}</strong><small>{bus.route_name}</small></div><span className={`portal-badge status-${bus.status.toLowerCase()}`}>{bus.status.replaceAll('_', ' ').toLowerCase()}</span></div><p>{bus.trip_started_at ? `Last started ${date(bus.trip_started_at)} at ${time(bus.trip_started_at)}` : 'No trip started yet'}</p><small>{bus.trip_arrived_at ? `Campus arrival ${date(bus.trip_arrived_at)} at ${time(bus.trip_arrived_at)}` : bus.status === 'IN_TRANSIT' ? 'On the way to campus' : 'Awaiting next arrival'}</small>{data!.students.some((item) => item.bus_code === bus.code) && <em>Your assigned bus</em>}</article>)}{!data!.buses.length && <div className="portal-empty">No campus buses have been registered yet.</div>}</div></motion.div>}
          {tab === 'timetable' && <motion.div className="page-stack" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}><div className="page-title-row"><div><span className="section-kicker">ACADEMIC FLOW</span><h2>Weekly timetable</h2><p>Classes match {student.department} Year {student.academic_year}, Section {student.section}.</p></div></div><div className="portal-list">{classes.map((item) => <div className="portal-list-row" key={item.id}><span className="portal-day">{weekdays[item.weekday].slice(0, 3)}</span><div><strong>{item.subject_name}</strong><small>{item.subject_code} · {weekdays[item.weekday]}</small></div><span className="portal-time">{item.starts_at.slice(0, 5)}–{item.ends_at.slice(0, 5)}</span></div>)}{!classes.length && <div className="portal-empty">No timetable sessions are configured for this class.</div>}</div></motion.div>}
        </>}
      </div>
    </main>
  </div>;
}

function AttendanceRow({ item }: { item: Attendance }) {
  return <div className="portal-list-row"><span className="portal-row-icon"><GraduationCap size={18}/></span><div><strong>{item.subject_name || item.subject_code || 'Class session'}</strong><small>{date(item.session_date)} · {item.subject_code || 'Academic session'}{item.bus_code ? ` · ${item.bus_code}` : ''}</small></div><span className={`portal-badge status-${item.status.toLowerCase()}`}>{item.status.toLowerCase()}</span></div>;
}

function ChildCard({ student, attendance, onOpen }: { student: Student; attendance: Attendance[]; onOpen: () => void }) {
  const latest = attendance[0];
  return <article className="family-card"><div className="family-card-head"><span className="portal-row-icon"><GraduationCap size={20}/></span><div><h3>{student.name}</h3><small>{student.registration_number} · {student.department} Y{student.academic_year}-{student.section}</small></div></div><div className="family-card-status"><span>Bus <strong>{student.bus_code || 'Unassigned'}</strong></span><span>Status <strong>{student.bus_status || 'No bus'}</strong></span><span>Boarding <strong>{student.boarded_at ? 'Recorded' : 'No scan'}</strong></span></div><p>{student.boarded_at ? `Boarded ${date(student.boarded_at)} at ${time(student.boarded_at)}` : 'No valid RFID boarding scan on the latest trip.'}</p><p>{latest ? `Latest class: ${latest.subject_name || latest.subject_code} · ${latest.status.toLowerCase()}` : 'No academic attendance yet.'}</p><button className="portal-text-button" onClick={onOpen}>View journey <ArrowRight size={14}/></button></article>;
}

function ParentLinkForm({ token, onLinked }: { token: string; onLinked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api('/api/portal/link-child', { method: 'POST', body: JSON.stringify({ registrationNumber: data.get('registrationNumber'), parentContact: data.get('parentContact') }) }, token);
      form.reset(); setSuccess('Child linked to your family dashboard.'); onLinked();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not link this child'); }
    finally { setBusy(false); }
  };
  return <section className="dash-card parent-link-card"><div className="card-head"><div><h3>Link another child</h3><span>Your account name and entered contact must match their campus record.</span></div></div><form onSubmit={(event) => void submit(event)}><label>Student registration number<input name="registrationNumber" required minLength={2} placeholder="Campus registration number"/></label><label>Parent contact on record<input name="parentContact" type="tel" required minLength={6} placeholder="Contact number"/></label><button className="button button-primary button-compact" disabled={busy}>{busy ? 'Linking…' : 'Link child'}</button></form>{error && <div className="form-error">{error}</div>}{success && <p className="parent-link-success">{success}</p>}</section>;
}
