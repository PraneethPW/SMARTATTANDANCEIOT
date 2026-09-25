import { motion } from 'framer-motion';
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Bot, BusFront, Check, ChevronRight, CircleUserRound,
  Clock3, Database, Fingerprint, Gauge, GraduationCap, LayoutDashboard, LoaderCircle, LogOut, MapPin,
  KeyRound, Menu, Plus, Radar, RefreshCw, Route, ScanLine, Search, Send, ShieldCheck, Sparkles,
  UserRoundPlus, Users, Wifi, WifiOff, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { io } from 'socket.io-client';
import { api, API_URL, type Session } from '../api';
import type { Analytics, Attendance, Bus, DeviceEvent, Student } from '../types';

type Tab = 'overview' | 'live' | 'attendance' | 'registry' | 'ai';
type Toast = { id: number; kind: 'success' | 'error' | 'live'; text: string };
type Timetable = { id: string; department: string; academic_year: number; section: string; weekday: number; starts_at: string; ends_at: string; subject_code: string; subject_name: string; faculty_name?: string };

const colors = ['#77f4d0', '#56caff', '#8f7bff', '#ffca73', '#ff7a9b'];
const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'live', label: 'Live fleet', icon: Radar },
  { id: 'attendance', label: 'Attendance', icon: Fingerprint },
  { id: 'registry', label: 'Registry', icon: Database },
  { id: 'ai', label: 'AI analysis', icon: Bot },
] as const;

export default function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [panel, setPanel] = useState<'bus' | 'student' | 'timetable' | 'user' | 'link' | null>(null);
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');

  const toast = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now();
    setToasts((value) => [...value, { id, text, kind }]);
    window.setTimeout(() => setToasts((value) => value.filter((item) => item.id !== id)), 4200);
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [a, b, e, at, s, tt] = await Promise.all([
        api<Analytics>('/api/analytics/overview', {}, session.token),
        api<{ buses: Bus[] }>('/api/buses', {}, session.token),
        api<{ events: DeviceEvent[] }>('/api/events?limit=80', {}, session.token),
        api<{ attendance: Attendance[] }>('/api/attendance', {}, session.token),
        api<{ students: Student[] }>('/api/students', {}, session.token),
        api<{ timetables: Timetable[] }>('/api/timetables', {}, session.token),
      ]);
      setAnalytics(a); setBuses(b.buses); setEvents(e.events); setAttendance(at.attendance); setStudents(s.students); setTimetables(tt.timetables);
    } catch (error) { toast(error instanceof Error ? error.message : 'Unable to load platform data', 'error'); }
    finally { setLoading(false); }
  }, [session.token, toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const socket = io(API_URL, { auth: { token: session.token }, transports: ['websocket', 'polling'] });
    const update = (message: string) => { toast(message, 'live'); void refresh(true); };
    socket.on('connect', () => setSocketStatus('live'));
    socket.on('disconnect', () => setSocketStatus('offline'));
    socket.on('connect_error', () => setSocketStatus('offline'));
    socket.io.on('reconnect_attempt', () => setSocketStatus('connecting'));
    socket.on('device:event', () => update('New device event received'));
    socket.on('trip:arrived', () => update('Campus arrival verified'));
    socket.on('attendance:synchronized', () => update('Class attendance synchronized'));
    socket.on('attendance:updated', () => void refresh(true));
    return () => { socket.disconnect(); };
  }, [refresh, session.token, toast]);

  const unresolved = useMemo(() => events.filter((event) => event.exception_type), [events]);
  const roleCanOperate = ['ADMIN', 'TRANSPORT'].includes(session.user.role);
  const roleCanVerify = ['ADMIN', 'FACULTY'].includes(session.user.role);

  return (
    <div className="dashboard-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top"><div className="brand"><span className="brand-mark"><BusFront size={18} /></span><span>TransitSync <b>AI</b></span></div><button className="icon-button mobile-only" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
        <div className="workspace-chip"><div className="workspace-avatar">KA</div><div><span>Workspace</span><strong>Smart Campus</strong></div><ChevronRight size={15} /></div>
        <nav className="side-nav">
          <span className="side-label">COMMAND</span>
          {nav.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setMobileNav(false); }}><Icon size={18} /><span>{label}</span>{id === 'attendance' && analytics?.totals.awaiting_review ? <i>{analytics.totals.awaiting_review}</i> : null}</button>)}
        </nav>
        <div className={`sidebar-system connection-${socketStatus}`}><div><span className="live-dot" /><strong>{socketStatus === 'live' ? 'Realtime connected' : socketStatus === 'connecting' ? 'Reconnecting…' : 'Realtime offline'}</strong></div><p>{socketStatus === 'live' ? 'Authenticated socket channel active' : 'REST remains available while socket retries'}</p></div>
        <button className="profile-card" onClick={onLogout}><span><CircleUserRound size={20} /></span><div><strong>{session.user.name}</strong><small>{session.user.role}</small></div><LogOut size={16} /></button>
      </aside>

      <main className="dashboard-main">
        <header className="dash-header">
          <button className="icon-button mobile-only" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          <div><span className="dash-kicker">OPERATIONS / {tab.toUpperCase()}</span><h1>{nav.find((item) => item.id === tab)?.label}</h1></div>
          <div className="header-actions"><span className={`time-status connection-${socketStatus}`}>{socketStatus === 'live' ? <Wifi size={12}/> : <WifiOff size={12}/>} {socketStatus.toUpperCase()}</span><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh"><RefreshCw size={17} className={loading ? 'spin' : ''} /></button><div className="header-avatar">{session.user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div></div>
        </header>

        <div className="dashboard-content">
          {loading && !analytics ? <div className="page-loader"><LoaderCircle className="spin" /><span>Connecting to live operations…</span></div> : null}
          {tab === 'overview' && analytics ? <Overview analytics={analytics} buses={buses} events={events} unresolved={unresolved} onNavigate={setTab} /> : null}
          {tab === 'live' ? <LiveFleet buses={buses} events={events} canOperate={roleCanOperate} onOpenBus={() => setPanel('bus')} onRefresh={() => void refresh(true)} toast={toast} token={session.token} /> : null}
          {tab === 'attendance' ? <AttendanceView rows={attendance} canVerify={roleCanVerify} token={session.token} toast={toast} onRefresh={() => void refresh(true)} /> : null}
          {tab === 'registry' ? <Registry students={students} timetables={timetables} buses={buses} canManageUsers={session.user.role === 'ADMIN'} canManageStudents={roleCanOperate} canManageTimetables={roleCanVerify} onOpen={setPanel} /> : null}
          {tab === 'ai' ? <AiAnalysis token={session.token} analytics={analytics} /> : null}
        </div>
      </main>

      {panel === 'bus' ? <BusPanel token={session.token} onClose={() => setPanel(null)} onCreated={(message) => { setPanel(null); toast(message); void refresh(true); }} /> : null}
      {panel === 'student' ? <StudentPanel token={session.token} buses={buses} onClose={() => setPanel(null)} onCreated={() => { setPanel(null); toast('Student registered'); void refresh(true); }} /> : null}
      {panel === 'timetable' ? <TimetablePanel token={session.token} onClose={() => setPanel(null)} onCreated={() => { setPanel(null); toast('Timetable session saved'); void refresh(true); }} /> : null}
      {panel === 'user' ? <UserPanel token={session.token} students={students} onClose={() => setPanel(null)} onCreated={() => { setPanel(null); toast('Account created and linked'); void refresh(true); }} /> : null}
      {panel === 'link' ? <LinkChildPanel token={session.token} students={students} onClose={() => setPanel(null)} onCreated={() => { setPanel(null); toast('Student linked to parent'); }} /> : null}
      <div className="toast-stack">{toasts.map((item) => <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} key={item.id} className={`toast toast-${item.kind}`}>{item.kind === 'error' ? <AlertTriangle size={17} /> : item.kind === 'live' ? <Activity size={17} /> : <Check size={17} />}{item.text}</motion.div>)}</div>
    </div>
  );
}

function Overview({ analytics, buses, events, unresolved, onNavigate }: { analytics: Analytics; buses: Bus[]; events: DeviceEvent[]; unresolved: DeviceEvent[]; onNavigate: (tab: Tab) => void }) {
  const stats = [
    { label: 'Active students', value: analytics.totals.students, detail: 'registered identities', icon: GraduationCap, color: 'mint' },
    { label: 'Fleet online', value: `${buses.filter((b) => b.status !== 'OFFLINE').length}/${analytics.totals.buses}`, detail: `${analytics.totals.active_trips} active trips`, icon: BusFront, color: 'cyan' },
    { label: 'Awaiting faculty', value: analytics.totals.awaiting_review, detail: 'provisional records', icon: Clock3, color: 'violet' },
    { label: 'Events today', value: analytics.totals.events_24h, detail: `${unresolved.length} visible exceptions`, icon: Activity, color: 'amber' },
  ];
  return <div className="page-stack">
    <section className="welcome-row"><div><span className="section-kicker">CAMPUS PULSE</span><h2>Every movement,<br /><em>made legible.</em></h2><p>Live operational truth from device ingestion to faculty verification.</p></div><div className="pulse-orbit"><span /><Radar size={34} /></div></section>
    <section className="stat-grid">{stats.map(({ label, value, detail, icon: Icon, color }) => <article className={`stat-card stat-${color}`} key={label}><div className="stat-icon"><Icon size={20} /></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section>
    <section className="chart-grid">
      <Card title="Attendance signal" subtitle="Last seven days" action={<button onClick={() => onNavigate('attendance')}>Review records <ArrowRight size={14} /></button>}>
        {analytics.timeline.length ? <ResponsiveContainer width="100%" height={245}><AreaChart data={analytics.timeline}><defs><linearGradient id="records" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#71efd0" stopOpacity={0.45}/><stop offset="100%" stopColor="#71efd0" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#ffffff0c" vertical={false}/><XAxis dataKey="day" stroke="#77849b" axisLine={false} tickLine={false}/><YAxis stroke="#77849b" axisLine={false} tickLine={false}/><Tooltip contentStyle={tooltipStyle}/><Area type="monotone" dataKey="records" stroke="#71efd0" fill="url(#records)" strokeWidth={2.5}/><Area type="monotone" dataKey="verified" stroke="#61bdff" fill="transparent" strokeWidth={2}/></AreaChart></ResponsiveContainer> : <Empty label="No attendance has been generated yet" />}
      </Card>
      <Card title="Record state" subtitle="Current distribution">
        {analytics.attendanceStatus.length ? <div className="donut-wrap"><ResponsiveContainer width="58%" height={245}><PieChart><Pie data={analytics.attendanceStatus} dataKey="count" nameKey="status" innerRadius={65} outerRadius={88} paddingAngle={4}>{analytics.attendanceStatus.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle}/></PieChart></ResponsiveContainer><div className="chart-legend">{analytics.attendanceStatus.map((item, i) => <span key={item.status}><i style={{ background: colors[i % colors.length] }} />{pretty(item.status)}<b>{item.count}</b></span>)}</div></div> : <Empty label="Record states will appear after the first arrival" />}
      </Card>
    </section>
    <section className="lower-grid">
      <Card title="Department clarity" subtitle="Generated academic records">
        {analytics.departments.length ? <ResponsiveContainer width="100%" height={260}><BarChart data={analytics.departments} layout="vertical"><CartesianGrid stroke="#ffffff0c" horizontal={false}/><XAxis type="number" hide/><YAxis dataKey="department" type="category" width={55} axisLine={false} tickLine={false} stroke="#a7b2c5"/><Tooltip contentStyle={tooltipStyle}/><Bar dataKey="total" fill="#263d55" radius={[0,6,6,0]}/><Bar dataKey="present" fill="#70efd0" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer> : <Empty label="No department data yet" />}
      </Card>
      <Card title="Live event rail" subtitle="Newest device evidence" action={<button onClick={() => onNavigate('live')}>View fleet <ArrowRight size={14}/></button>}>
        <div className="event-list">{events.slice(0, 5).map((event) => <EventRow key={event.id} event={event} />)}{!events.length && <Empty label="Waiting for the first ESP32 event" />}</div>
      </Card>
    </section>
  </div>;
}

function LiveFleet({ buses, events, canOperate, onOpenBus, onRefresh, toast, token }: { buses: Bus[]; events: DeviceEvent[]; canOperate: boolean; onOpenBus: () => void; onRefresh: () => void; toast: (s: string, k?: Toast['kind']) => void; token: string }) {
  const startTrip = async (busId: string) => { try { await api('/api/trips', { method: 'POST', body: JSON.stringify({ busId }) }, token); toast('Trip started and ready for device events'); onRefresh(); } catch (e) { toast(e instanceof Error ? e.message : 'Could not start trip', 'error'); } };
  const arrive = async (tripId: string) => { try { await api(`/api/trips/${tripId}/arrive`, { method: 'POST' }, token); toast('Authorized campus arrival processed'); onRefresh(); } catch (e) { toast(e instanceof Error ? e.message : 'Arrival failed', 'error'); } };
  return <div className="page-stack">
    <div className="page-title-row"><div><span className="section-kicker">REALTIME TELEMETRY</span><h2>Fleet control</h2><p>Only genuine device packets and authorized operator actions appear here.</p></div>{canOperate && <button className="button button-primary button-compact" onClick={onOpenBus}><Plus size={16}/> Add bus</button>}</div>
    <section className="fleet-grid">{buses.map((bus) => <article className="fleet-card" key={bus.id}><div className="fleet-card-head"><div className="bus-badge"><BusFront size={22}/></div><div><span>{bus.code}</span><strong>{bus.registration_number}</strong></div><Status value={bus.status}/></div><div className="route-line"><span className="route-node"/><i/><span className="route-node campus"/></div><div className="fleet-route"><span>{bus.route_name}</span><strong>Campus</strong></div><div className="fleet-metrics"><div><Users size={16}/><span>Assigned</span><strong>{bus.assigned_students}/{bus.capacity}</strong></div><div><MapPin size={16}/><span>Last position</span><strong>{bus.last_latitude == null ? 'Awaiting GPS' : `${Number(bus.last_latitude).toFixed(4)}, ${Number(bus.last_longitude).toFixed(4)}`}</strong></div></div>{canOperate && <div className="fleet-actions">{bus.active_trip_id ? <button className="button button-ghost button-compact" onClick={() => void arrive(bus.active_trip_id!)}>Confirm campus arrival</button> : <button className="button button-primary button-compact" onClick={() => void startTrip(bus.id)}>Start trip <ArrowRight size={14}/></button>}</div>}</article>)}{!buses.length && <EmptyPanel icon={<BusFront/>} title="No buses configured" text="Add a bus to generate a one-time ESP32 device secret and begin a live trip." action={canOperate ? <button className="button button-primary" onClick={onOpenBus}>Add first bus</button> : undefined}/>}</section>
    {canOperate ? <DeviceIngestionConsole buses={buses} toast={toast} onAccepted={onRefresh} /> : null}
    <Card title="Device event stream" subtitle={`${events.length} latest accepted packets`}><div className="event-table"><div className="event-table-head"><span>Event</span><span>Identity / coordinate</span><span>Bus</span><span>Received</span><span>State</span></div>{events.map((event) => <div className="event-table-row" key={event.id}><span><i className={`event-type ${event.type === 'GPS' ? 'gps' : ''}`}>{event.type === 'GPS' ? <MapPin size={15}/> : <ScanLine size={15}/>}</i>{pretty(event.type)}</span><span><strong>{event.student_name || (event.latitude != null ? `${Number(event.latitude).toFixed(5)}, ${Number(event.longitude).toFixed(5)}` : event.rfid_uid)}</strong>{event.department ? <small>{event.department} · Y{event.academic_year} · {event.section}</small> : null}</span><span>{event.bus_code}</span><span>{timeAgo(event.received_at)}</span><span>{event.exception_type ? <Status value={event.exception_type}/> : <Status value="VALID"/>}</span></div>)}{!events.length && <Empty label="The event rail is listening" />}</div></Card>
  </div>;
}

function DeviceIngestionConsole({ buses, toast, onAccepted }: { buses: Bus[]; toast: (s: string, k?: Toast['kind']) => void; onAccepted: () => void }) {
  const [kind, setKind] = useState<'RFID_SCAN' | 'GPS'>('RFID_SCAN');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const deviceKey = String(data.get('deviceKey') ?? '').trim();
    const busCode = String(data.get('busCode') ?? '').trim();
    const rfidUid = String(data.get('rfidUid') ?? '').trim();
    const latitude = Number(data.get('latitude'));
    const longitude = Number(data.get('longitude'));
    setBusy(true);
    try {
      const payload = {
        busCode,
        eventId: `web-${crypto.randomUUID()}`,
        type: kind,
        deviceTimestamp: new Date().toISOString(),
        ...(kind === 'RFID_SCAN' ? { rfidUid } : { latitude, longitude }),
      };
      const result = await api<{ accepted: boolean; duplicate: boolean; exceptionType: string | null }>(
        '/api/device/events',
        { method: 'POST', headers: { 'X-Device-Key': deviceKey }, body: JSON.stringify(payload) },
      );
      toast(result.exceptionType ? `Packet accepted with ${pretty(result.exceptionType)}` : `${pretty(kind)} packet accepted`, result.exceptionType ? 'error' : 'live');
      onAccepted();
      if (kind === 'RFID_SCAN') (form.elements.namedItem('rfidUid') as HTMLInputElement | null)?.focus();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Device packet rejected', 'error');
    } finally { setBusy(false); }
  };

  return <section className="ingestion-console">
    <div className="ingestion-head"><div><span className="section-kicker">PRODUCTION INGESTION PORT</span><h3>Send a real hardware packet</h3><p>This form calls the exact endpoint used by the ESP32. The packet is authenticated, validated, persisted in Neon, and broadcast over Socket.IO—nothing here is mocked.</p></div><span><KeyRound size={13}/> KEY STAYS IN MEMORY</span></div>
    <form className="ingestion-form" onSubmit={submit}>
      <label>Packet type<select value={kind} onChange={(event) => setKind(event.target.value as 'RFID_SCAN' | 'GPS')}><option value="RFID_SCAN">RFID scan</option><option value="GPS">GPS position</option></select></label>
      <label>Device key<input name="deviceKey" type="password" required autoComplete="off" placeholder="One-time bus secret" /></label>
      <label>Bus<select name="busCode" required defaultValue=""><option value="" disabled>Select an active bus</option>{buses.map((bus) => <option key={bus.id} value={bus.code}>{bus.code} · {bus.route_name}</option>)}</select></label>
      {kind === 'RFID_SCAN' ? <label>RFID UID<input name="rfidUid" required minLength={4} placeholder="04A1B2C3D4" /></label> : <><label>Latitude<input name="latitude" required type="number" step="any" min="-90" max="90" placeholder="9.5747" /></label><label>Longitude<input name="longitude" required type="number" step="any" min="-180" max="180" placeholder="77.6792" /></label></>}
      <button className="button button-primary" disabled={busy || !buses.some((bus) => bus.active_trip_id)}>{busy ? <LoaderCircle className="spin" size={16}/> : <Send size={15}/>} Send packet</button>
    </form>
    <p className="ingestion-note"><ShieldCheck size={13}/> Start a trip first. Device secrets are never saved by this browser form or returned by the API.</p>
  </section>;
}

function AttendanceView({ rows, canVerify, token, toast, onRefresh }: { rows: Attendance[]; canVerify: boolean; token: string; toast: (s:string,k?:Toast['kind'])=>void; onRefresh:()=>void }) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('ALL');
  const filtered = rows.filter((r) => (filter === 'ALL' || r.status === filter) && `${r.student_name} ${r.registration_number} ${r.department} ${r.subject_code}`.toLowerCase().includes(query.toLowerCase()));
  const verify = async (id: string, status: string) => { try { await api(`/api/attendance/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }, token); toast(`Attendance marked ${status.toLowerCase()}`); onRefresh(); } catch(e){ toast(e instanceof Error ? e.message : 'Update failed','error'); } };
  return <div className="page-stack"><div className="page-title-row"><div><span className="section-kicker">FACULTY-IN-THE-LOOP</span><h2>Academic attendance</h2><p>Provisional rows originated from a verified trip and remain human-reviewable.</p></div></div><div className="table-toolbar"><div className="search-box"><Search size={16}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search student, class, subject…"/></div><div className="filter-pills">{['ALL','PROVISIONAL','PRESENT','ABSENT','EXCUSED'].map((v)=><button className={filter===v?'active':''} key={v} onClick={()=>setFilter(v)}>{pretty(v)}</button>)}</div></div><div className="data-table attendance-table"><div className="data-table-head"><span>Student</span><span>Class</span><span>Session</span><span>Evidence</span><span>Status</span><span>Faculty action</span></div>{filtered.map((row)=><div className="data-table-row" key={row.id}><span><span className="mini-avatar">{initials(row.student_name)}</span><span><strong>{row.student_name}</strong><small>{row.registration_number}</small></span></span><span><strong>{row.department}</strong><small>Year {row.academic_year} · Section {row.section}</small></span><span><strong>{row.subject_code}</strong><small>{row.subject_name}</small></span><span><strong>{row.bus_code || 'Bus event'}</strong><small>{new Date(row.session_date).toLocaleDateString()}</small></span><span><Status value={row.status}/></span><span>{canVerify && row.status==='PROVISIONAL'?<div className="row-actions"><button onClick={()=>void verify(row.id,'PRESENT')} title="Present"><Check size={15}/></button><button onClick={()=>void verify(row.id,'ABSENT')} title="Absent"><X size={15}/></button></div>:<small>{row.verified_by_name ? `Verified by ${row.verified_by_name}` : '—'}</small>}</span></div>)}{!filtered.length&&<Empty label={rows.length?'No records match this filter':'No attendance generated yet'}/>}</div></div>;
}

function Registry({ students, timetables, buses, canManageUsers, canManageStudents, canManageTimetables, onOpen }: { students: Student[]; timetables: Timetable[]; buses: Bus[]; canManageUsers: boolean; canManageStudents: boolean; canManageTimetables: boolean; onOpen:(p:'student'|'timetable'|'user'|'link')=>void }) {
  return <div className="page-stack"><div className="page-title-row"><div><span className="section-kicker">ACADEMIC MAPPING</span><h2>Identity registry</h2><p>The mappings that transform a UID into the right class record.</p></div><div className="split-actions">{canManageUsers&&<button className="button button-ghost button-compact" onClick={()=>onOpen('link')}><Users size={16}/> Link child</button>}{canManageUsers&&<button className="button button-ghost button-compact" onClick={()=>onOpen('user')}><Users size={16}/> Add user</button>}{canManageTimetables&&<button className="button button-ghost button-compact" onClick={()=>onOpen('timetable')}><Clock3 size={16}/> Add timetable</button>}{canManageStudents&&<button className="button button-primary button-compact" onClick={()=>onOpen('student')}><UserRoundPlus size={16}/> Add student</button>}</div></div><section className="registry-summary"><div><Fingerprint/><span>RFID identities</span><strong>{students.length}</strong></div><div><BusFront/><span>Assigned to a bus</span><strong>{students.filter(s=>s.assigned_bus_id).length}</strong></div><div><Clock3/><span>Timetable sessions</span><strong>{timetables.length}</strong></div><div><Route/><span>Available buses</span><strong>{buses.length}</strong></div></section><div className="registry-grid"><Card title="Students" subtitle="Live database records"><div className="compact-list">{students.slice(0,12).map((s)=><div key={s.id}><span className="mini-avatar">{initials(s.name)}</span><span><strong>{s.name}</strong><small>{s.registration_number} · {s.rfid_uid}</small></span><span><strong>{s.department} Y{s.academic_year}-{s.section}</strong><small>{s.assigned_bus_code || 'No bus assigned'}</small></span></div>)}{!students.length&&<Empty label="No student identities registered"/>}</div></Card><Card title="Timetable" subtitle="Arrival-to-class resolution"><div className="compact-list timetable-list">{timetables.slice(0,12).map((t)=><div key={t.id}><span className="day-badge">{['SU','MO','TU','WE','TH','FR','SA'][t.weekday]}</span><span><strong>{t.subject_code} · {t.subject_name}</strong><small>{t.starts_at.slice(0,5)}–{t.ends_at.slice(0,5)}</small></span><span><strong>{t.department} Y{t.academic_year}-{t.section}</strong><small>{t.faculty_name || 'Current faculty'}</small></span></div>)}{!timetables.length&&<Empty label="Add a timetable before processing an arrival"/>}</div></Card></div></div>;
}

function AiAnalysis({ token, analytics }: { token: string; analytics: Analytics | null }) {
  const [question,setQuestion]=useState('What operational risks and attendance patterns should administrators prioritize this week?'); const [answer,setAnswer]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const ask=async()=>{setBusy(true);setError('');try{const r=await api<{analysis:string}>('/api/ai/insights',{method:'POST',body:JSON.stringify({question})},token);setAnswer(r.analysis);}catch(e){setError(e instanceof Error?e.message:'Analysis failed');}finally{setBusy(false);}};
  return <div className="page-stack ai-page"><div className="page-title-row"><div><span className="section-kicker">OPENROUTER INTELLIGENCE</span><h2>Ask the operation</h2><p>AI receives only anonymous aggregates. It can explain data, never change attendance.</p></div><span className="safe-ai"><ShieldCheck size={16}/> Aggregate-safe context</span></div><section className="ai-composer"><div className="ai-symbol"><Sparkles size={25}/></div><textarea value={question} onChange={(e)=>setQuestion(e.target.value)} maxLength={600}/><button className="button button-primary" onClick={()=>void ask()} disabled={busy||question.trim().length<8}>{busy?<LoaderCircle className="spin"/>:<ArrowRight/>}</button></section>{error&&<div className="form-error">{error}</div>}<section className="ai-output"><div className="ai-output-head"><div><Bot size={19}/><span>Analyst response</span></div>{answer&&<small>Grounded in current database aggregates</small>}</div>{answer?<div className="analysis-text">{answer}</div>:<div className="ai-empty"><BrainVisual/><h3>Your data has a story.</h3><p>Ask about exceptions, verification backlog, route activity, or department-level patterns. Empty databases produce an honest “insufficient data” result.</p></div>}</section><section className="ai-context"><span>Context snapshot</span><div><b>{analytics?.totals.events_24h ?? 0}</b> events / 24h</div><div><b>{analytics?.totals.awaiting_review ?? 0}</b> awaiting review</div><div><b>{analytics?.exceptions.length ?? 0}</b> exception categories</div></section></div>;
}

function Panel({ title, subtitle, onClose, children }: { title:string; subtitle:string; onClose:()=>void; children:ReactNode }) { return <div className="panel-backdrop"><motion.aside className="slide-panel" initial={{x:'100%'}} animate={{x:0}}><div className="panel-head"><div><span>CONFIGURE</span><h3>{title}</h3><p>{subtitle}</p></div><button className="icon-button" onClick={onClose}><X/></button></div>{children}</motion.aside></div>; }

function BusPanel({token,onClose,onCreated}:{token:string;onClose:()=>void;onCreated:(s:string)=>void}){const [error,setError]=useState('');const [busy,setBusy]=useState(false);const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setError('');const d=new FormData(e.currentTarget);try{const r=await api<{deviceKey:string}>('/api/buses',{method:'POST',body:JSON.stringify({code:d.get('code'),registrationNumber:d.get('registrationNumber'),routeName:d.get('routeName'),driverName:d.get('driverName'),capacity:Number(d.get('capacity'))})},token);await navigator.clipboard.writeText(r.deviceKey).catch(()=>{});onCreated(`Bus created. Device key copied: ${r.deviceKey}`);}catch(err){setError(err instanceof Error?err.message:'Could not create bus');}finally{setBusy(false);}};return <Panel title="Add a live bus" subtitle="A one-time device secret is copied when saved." onClose={onClose}><FormShell onSubmit={submit} error={error} busy={busy} button="Create bus & key"><label>Bus code<input name="code" required placeholder="BUS-01"/></label><label>Registration number<input name="registrationNumber" required placeholder="TN 67 AB 1234"/></label><label>Route name<input name="routeName" required placeholder="Krishnankoil North"/></label><label>Driver name<input name="driverName" required placeholder="Driver's full name"/></label><label>Capacity<input name="capacity" type="number" required min="1" max="150" defaultValue="45"/></label></FormShell></Panel>}

function StudentPanel({token,buses,onClose,onCreated}:{token:string;buses:Bus[];onClose:()=>void;onCreated:()=>void}){const [error,setError]=useState('');const [busy,setBusy]=useState(false);const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setError('');const d=new FormData(e.currentTarget);try{await api('/api/students',{method:'POST',body:JSON.stringify({registrationNumber:d.get('registrationNumber'),rfidUid:d.get('rfidUid'),name:d.get('name'),department:d.get('department'),academicYear:Number(d.get('academicYear')),section:d.get('section'),parentName:d.get('parentName'),parentContact:d.get('parentContact'),assignedBusId:d.get('assignedBusId')||null})},token);onCreated();}catch(err){setError(err instanceof Error?err.message:'Could not add student');}finally{setBusy(false);}};return <Panel title="Register student" subtitle="Create a real RFID-to-academic identity mapping." onClose={onClose}><FormShell onSubmit={submit} error={error} busy={busy} button="Register identity"><label>Student name<input name="name" required/></label><label>Registration number<input name="registrationNumber" required/></label><label>RFID UID<input name="rfidUid" required placeholder="04A1B2C3D4"/></label><div className="form-pair"><label>Department<input name="department" required placeholder="CSE"/></label><label>Year<input name="academicYear" type="number" min="1" max="8" required/></label></div><label>Section<input name="section" required placeholder="A"/></label><label>Assigned bus<select name="assignedBusId"><option value="">Not assigned</option>{buses.map(b=><option key={b.id} value={b.id}>{b.code} · {b.route_name}</option>)}</select></label><label>Parent name<input name="parentName"/></label><label>Parent contact<input name="parentContact"/></label></FormShell></Panel>}

function TimetablePanel({token,onClose,onCreated}:{token:string;onClose:()=>void;onCreated:()=>void}){const [error,setError]=useState('');const [busy,setBusy]=useState(false);const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);const d=new FormData(e.currentTarget);try{await api('/api/timetables',{method:'POST',body:JSON.stringify({department:d.get('department'),academicYear:Number(d.get('academicYear')),section:d.get('section'),weekday:Number(d.get('weekday')),startsAt:d.get('startsAt'),endsAt:d.get('endsAt'),subjectCode:d.get('subjectCode'),subjectName:d.get('subjectName')})},token);onCreated();}catch(err){setError(err instanceof Error?err.message:'Could not save timetable');}finally{setBusy(false);}};return <Panel title="Add timetable session" subtitle="Arrival matching selects the next session for each class." onClose={onClose}><FormShell onSubmit={submit} error={error} busy={busy} button="Save session"><div className="form-pair"><label>Department<input name="department" required placeholder="CSE"/></label><label>Year<input name="academicYear" type="number" min="1" max="8" required/></label></div><label>Section<input name="section" required placeholder="A"/></label><label>Weekday<select name="weekday">{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i)=><option key={d} value={i}>{d}</option>)}</select></label><div className="form-pair"><label>Starts<input name="startsAt" type="time" required/></label><label>Ends<input name="endsAt" type="time" required/></label></div><label>Subject code<input name="subjectCode" required placeholder="CSE301"/></label><label>Subject name<input name="subjectName" required placeholder="Machine Learning"/></label></FormShell></Panel>}

function UserPanel({token,students,onClose,onCreated}:{token:string;students:Student[];onClose:()=>void;onCreated:()=>void}){const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [role,setRole]=useState('FACULTY');const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setError('');const d=new FormData(e.currentTarget);try{await api('/api/users',{method:'POST',body:JSON.stringify({name:d.get('name'),email:d.get('email'),password:d.get('password'),role,registrationNumber:d.get('registrationNumber')||undefined})},token);onCreated();}catch(err){setError(err instanceof Error?err.message:'Could not create account');}finally{setBusy(false);}};return <Panel title="Add account" subtitle="Create a role-scoped login. Student and parent accounts require a registered student link." onClose={onClose}><FormShell onSubmit={submit} error={error} busy={busy} button="Create secure account"><label>Full name<input name="name" required minLength={2}/></label><label>Email address<input name="email" type="email" required/></label><label>Temporary password<input name="password" type="password" required minLength={10}/></label><label>Role<select name="role" value={role} onChange={e=>setRole(e.target.value)}><option value="FACULTY">Faculty</option><option value="TRANSPORT">Transport operator</option><option value="ADMIN">Administrator</option><option value="STUDENT">Student</option><option value="PARENT">Parent</option></select></label>{(role==='STUDENT'||role==='PARENT')&&<label>Linked student<select name="registrationNumber" required defaultValue=""><option value="">Select a registered student</option>{students.filter(s=>s.active).map(s=><option key={s.id} value={s.registration_number}>{s.name} · {s.registration_number}</option>)}</select></label>}</FormShell></Panel>}

function LinkChildPanel({token,students,onClose,onCreated}:{token:string;students:Student[];onClose:()=>void;onCreated:()=>void}){
  const [parents,setParents]=useState<Array<{id:string;name:string;email:string}>>([]);
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  useEffect(()=>{api<{users:Array<{id:string;name:string;email:string;role:string}>}>('/api/users',{},token).then(r=>setParents(r.users.filter(u=>u.role==='PARENT'))).catch(e=>setError(e instanceof Error?e.message:'Unable to load parents'));},[token]);
  const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setError('');const d=new FormData(e.currentTarget);try{await api(`/api/users/${d.get('parentId')}/students`,{method:'POST',body:JSON.stringify({registrationNumber:d.get('registrationNumber')})},token);onCreated();}catch(cause){setError(cause instanceof Error?cause.message:'Could not link student');}finally{setBusy(false);}};
  return <Panel title="Link another child" subtitle="Give an existing parent account access to another registered student." onClose={onClose}><FormShell onSubmit={submit} error={error} busy={busy} button="Link student"><label>Parent account<select name="parentId" required defaultValue=""><option value="">Select parent</option>{parents.map(p=><option value={p.id} key={p.id}>{p.name} · {p.email}</option>)}</select></label><label>Student<select name="registrationNumber" required defaultValue=""><option value="">Select student</option>{students.filter(s=>s.active).map(s=><option value={s.registration_number} key={s.id}>{s.name} · {s.registration_number}</option>)}</select></label></FormShell></Panel>;
}
function FormShell({onSubmit,error,busy,button,children}:{onSubmit:(e:FormEvent<HTMLFormElement>)=>void;error:string;busy:boolean;button:string;children:ReactNode}){return <form className="panel-form" onSubmit={onSubmit}>{children}{error&&<div className="form-error">{error}</div>}<button className="button button-primary" disabled={busy}>{busy?<LoaderCircle className="spin"/>:null}{button}</button></form>}
function Card({title,subtitle,action,children}:{title:string;subtitle:string;action?:ReactNode;children:ReactNode}){return <article className="dash-card"><div className="card-head"><div><h3>{title}</h3><span>{subtitle}</span></div>{action}</div>{children}</article>}
function Status({value}:{value:string}){return <span className={`status status-${value.toLowerCase().replaceAll('_','-')}`}><i/>{pretty(value)}</span>}
function EventRow({event}:{event:DeviceEvent}){return <div className="event-row"><span className={`event-type ${event.type==='GPS'?'gps':''}`}>{event.type==='GPS'?<MapPin size={16}/>:<ScanLine size={16}/>}</span><div><strong>{event.type==='GPS'?'GPS position':event.student_name||'Unknown card'}</strong><small>{event.bus_code} · {event.exception_type?pretty(event.exception_type):'Valid evidence'}</small></div><time>{timeAgo(event.received_at)}</time></div>}
function Empty({label}:{label:string}){return <div className="empty-inline"><Gauge size={24}/><span>{label}</span></div>}
function EmptyPanel({icon,title,text,action}:{icon:ReactNode;title:string;text:string;action?:ReactNode}){return <div className="empty-panel"><span>{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>}
function BrainVisual(){return <div className="brain-visual"><Bot size={46}/><span/><span/></div>}
const tooltipStyle={background:'#101c2d',border:'1px solid #ffffff18',borderRadius:12,color:'#eaf3ff',boxShadow:'0 18px 40px #0008'};
const pretty=(value:string)=>value.toLowerCase().replaceAll('_',' ').replace(/\b\w/g,(c)=>c.toUpperCase());
const initials=(name:string)=>name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
function timeAgo(value:string){const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));if(seconds<60)return `${seconds}s ago`;if(seconds<3600)return `${Math.floor(seconds/60)}m ago`;if(seconds<86400)return `${Math.floor(seconds/3600)}h ago`;return new Date(value).toLocaleDateString();}
