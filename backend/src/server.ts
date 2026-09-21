import { createServer } from 'node:http';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { z } from 'zod';
import { allowRoles, requireAuth, signSession, verifySession } from './auth.js';
import { synchronizeTripAttendance } from './attendance.js';
import { config } from './config.js';
import { initializeDatabase, pool } from './db.js';
import {
  generateDeviceSecret,
  hashDeviceSecret,
  haversineMeters,
  isDwellSatisfied,
  normalizeRfid,
} from './domain.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: config.corsOrigins, methods: ['GET', 'POST', 'PATCH'] },
});

httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${config.PORT} is already in use. Set PORT to a free port and update VITE_API_URL to match.`);
  } else {
    console.error('HTTP server failed', error);
  }
  process.exit(1);
});

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '256kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api/device', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));

const asyncRoute = (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => void handler(req, res, next).catch(next);

io.use((socket, next) => {
  const token = socket.handshake.auth.token as string | undefined;
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.data.user = verifySession(token);
    next();
  } catch {
    next(new Error('Invalid session'));
  }
});

io.on('connection', (socket) => {
  socket.join('operations');
  socket.emit('system:ready', { at: new Date().toISOString() });
});

app.get('/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', service: 'transitsync-api', timestamp: new Date().toISOString() });
}));

app.get('/api/setup/status', asyncRoute(async (_req, res) => {
  const result = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
  res.json({ initialized: Number(result.rows[0]?.count ?? 0) > 0 });
}));

const credentialsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(10).max(128),
});

app.post('/api/auth/bootstrap', asyncRoute(async (req, res) => {
  const input = credentialsSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const existing = await client.query('SELECT 1 FROM users LIMIT 1');
    if (existing.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Workspace is already initialized' });
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const created = await client.query<{ id: string; name: string; email: string; role: 'ADMIN' }>(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, 'ADMIN')
      RETURNING id, name, email, role
    `, [input.name, input.email, passwordHash]);
    await client.query('COMMIT');
    const user = created.rows[0]!;
    res.status(201).json({ token: signSession(user), user });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const input = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) }).parse(req.body);
  const result = await pool.query<{
    id: string; name: string; email: string; role: 'ADMIN' | 'FACULTY' | 'TRANSPORT' | 'PARENT'; password_hash: string;
  }>('SELECT id, name, email, role, password_hash FROM users WHERE email = $1', [input.email]);
  const found = result.rows[0];
  if (!found || !(await bcrypt.compare(input.password, found.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const user = { id: found.id, name: found.name, email: found.email, role: found.role };
  res.json({ token: signSession(user), user });
}));

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.get('/api/users', requireAuth, allowRoles('ADMIN'), asyncRoute(async (_req, res) => {
  const result = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
  res.json({ users: result.rows });
}));

app.post('/api/users', requireAuth, allowRoles('ADMIN'), asyncRoute(async (req, res) => {
  const input = credentialsSchema.extend({ role: z.enum(['ADMIN', 'FACULTY', 'TRANSPORT']) }).parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const result = await pool.query(`
    INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)
    RETURNING id, name, email, role, created_at
  `, [input.name, input.email, passwordHash, input.role]);
  await pool.query(`INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_value)
    VALUES ($1,'CREATE_USER','user',$2,$3)`, [req.user!.id, result.rows[0].id, result.rows[0]]);
  res.status(201).json({ user: result.rows[0] });
}));

app.get('/api/students', requireAuth, allowRoles('ADMIN', 'FACULTY', 'TRANSPORT'), asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT s.id, s.registration_number, s.rfid_uid, s.name, s.department, s.academic_year,
      s.section, s.parent_name, s.parent_contact, s.active,
      b.id AS assigned_bus_id, b.code AS assigned_bus_code
    FROM students s LEFT JOIN buses b ON b.id = s.assigned_bus_id
    ORDER BY s.created_at DESC
  `);
  res.json({ students: result.rows });
}));

app.post('/api/students', requireAuth, allowRoles('ADMIN', 'TRANSPORT'), asyncRoute(async (req, res) => {
  const input = z.object({
    registrationNumber: z.string().trim().min(2).max(40),
    rfidUid: z.string().trim().min(4).max(64),
    name: z.string().trim().min(2).max(100),
    department: z.string().trim().min(2).max(50),
    academicYear: z.coerce.number().int().min(1).max(8),
    section: z.string().trim().min(1).max(12),
    parentName: z.string().trim().max(100).optional(),
    parentContact: z.string().trim().max(40).optional(),
    assignedBusId: z.string().uuid().nullable().optional(),
  }).parse(req.body);
  const result = await pool.query(`
    INSERT INTO students (
      registration_number, rfid_uid, name, department, academic_year, section,
      parent_name, parent_contact, assigned_bus_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
  `, [input.registrationNumber, normalizeRfid(input.rfidUid), input.name, input.department.toUpperCase(),
    input.academicYear, input.section.toUpperCase(), input.parentName ?? null, input.parentContact ?? null,
    input.assignedBusId ?? null]);
  io.to('operations').emit('student:created', result.rows[0]);
  res.status(201).json({ student: result.rows[0] });
}));

app.get('/api/buses', requireAuth, allowRoles('ADMIN', 'FACULTY', 'TRANSPORT'), asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT b.id, b.code, b.registration_number, b.route_name, b.driver_name, b.capacity,
      b.status, b.last_latitude, b.last_longitude, b.last_seen_at,
      COUNT(s.id)::int AS assigned_students,
      (SELECT id FROM trips t WHERE t.bus_id = b.id AND t.status = 'ACTIVE' LIMIT 1) AS active_trip_id
    FROM buses b LEFT JOIN students s ON s.assigned_bus_id = b.id AND s.active = true
    GROUP BY b.id ORDER BY b.code
  `);
  res.json({ buses: result.rows });
}));

app.post('/api/buses', requireAuth, allowRoles('ADMIN', 'TRANSPORT'), asyncRoute(async (req, res) => {
  const input = z.object({
    code: z.string().trim().min(2).max(20),
    registrationNumber: z.string().trim().min(3).max(30),
    routeName: z.string().trim().min(2).max(100),
    driverName: z.string().trim().min(2).max(100),
    capacity: z.coerce.number().int().min(1).max(150),
  }).parse(req.body);
  const deviceKey = generateDeviceSecret();
  const result = await pool.query(`
    INSERT INTO buses (code, registration_number, route_name, driver_name, capacity, device_key_hash)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, code, registration_number, route_name, driver_name, capacity, status
  `, [input.code.toUpperCase(), input.registrationNumber.toUpperCase(), input.routeName, input.driverName,
    input.capacity, hashDeviceSecret(deviceKey)]);
  res.status(201).json({ bus: result.rows[0], deviceKey, warning: 'Copy this device key now. It is not retrievable later.' });
}));

app.post('/api/trips', requireAuth, allowRoles('ADMIN', 'TRANSPORT'), asyncRoute(async (req, res) => {
  const input = z.object({ busId: z.string().uuid() }).parse(req.body);
  const result = await pool.query(`
    INSERT INTO trips (bus_id, created_by) VALUES ($1, $2) RETURNING *
  `, [input.busId, req.user!.id]);
  await pool.query(`UPDATE buses SET status = 'IN_TRANSIT' WHERE id = $1`, [input.busId]);
  io.to('operations').emit('trip:started', result.rows[0]);
  res.status(201).json({ trip: result.rows[0] });
}));

app.post('/api/trips/:tripId/arrive', requireAuth, allowRoles('ADMIN', 'TRANSPORT'), asyncRoute(async (req, res) => {
  const tripId = z.string().uuid().parse(req.params.tripId);
  const result = await markTripArrived(tripId, 'MANUAL_AUTHORIZED');
  res.json(result);
}));

app.get('/api/timetables', requireAuth, allowRoles('ADMIN', 'FACULTY', 'TRANSPORT'), asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT t.*, u.name AS faculty_name FROM timetables t LEFT JOIN users u ON u.id = t.faculty_id
    ORDER BY t.weekday, t.starts_at
  `);
  res.json({ timetables: result.rows });
}));

app.post('/api/timetables', requireAuth, allowRoles('ADMIN', 'FACULTY'), asyncRoute(async (req, res) => {
  const input = z.object({
    department: z.string().trim().min(2).max(50),
    academicYear: z.coerce.number().int().min(1).max(8),
    section: z.string().trim().min(1).max(12),
    weekday: z.coerce.number().int().min(0).max(6),
    startsAt: z.string().regex(/^\d{2}:\d{2}$/),
    endsAt: z.string().regex(/^\d{2}:\d{2}$/),
    subjectCode: z.string().trim().min(2).max(30),
    subjectName: z.string().trim().min(2).max(100),
    facultyId: z.string().uuid().nullable().optional(),
  }).parse(req.body);
  const result = await pool.query(`
    INSERT INTO timetables (department, academic_year, section, weekday, starts_at, ends_at, subject_code, subject_name, faculty_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (department, academic_year, section, weekday, starts_at)
    DO UPDATE SET ends_at=EXCLUDED.ends_at, subject_code=EXCLUDED.subject_code,
      subject_name=EXCLUDED.subject_name, faculty_id=EXCLUDED.faculty_id
    RETURNING *
  `, [input.department.toUpperCase(), input.academicYear, input.section.toUpperCase(), input.weekday,
    input.startsAt, input.endsAt, input.subjectCode.toUpperCase(), input.subjectName, input.facultyId ?? req.user!.id]);
  res.status(201).json({ timetable: result.rows[0] });
}));

const deviceEventSchema = z.object({
  busCode: z.string().trim().min(2).max(20),
  eventId: z.string().trim().min(4).max(120),
  type: z.enum(['RFID_SCAN', 'GPS']),
  rfidUid: z.string().trim().min(4).max(64).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  deviceTimestamp: z.string().datetime(),
}).superRefine((value, ctx) => {
  if (value.type === 'RFID_SCAN' && !value.rfidUid) ctx.addIssue({ code: 'custom', message: 'rfidUid is required for RFID_SCAN' });
  if (value.type === 'GPS' && (value.latitude === undefined || value.longitude === undefined)) {
    ctx.addIssue({ code: 'custom', message: 'latitude and longitude are required for GPS' });
  }
});

app.post('/api/device/events', asyncRoute(async (req, res) => {
  const input = deviceEventSchema.parse(req.body);
  const providedKey = req.header('x-device-key');
  if (!providedKey) return res.status(401).json({ error: 'X-Device-Key is required' });

  const busResult = await pool.query<{ id: string; device_key_hash: string }>(
    'SELECT id, device_key_hash FROM buses WHERE code = $1', [input.busCode.toUpperCase()],
  );
  const bus = busResult.rows[0];
  if (!bus || hashDeviceSecret(providedKey) !== bus.device_key_hash) {
    return res.status(401).json({ error: 'Invalid device credentials' });
  }
  const tripResult = await pool.query<{ id: string; campus_candidate_at: Date | null }>(
    `SELECT id, campus_candidate_at FROM trips WHERE bus_id = $1 AND status = 'ACTIVE' ORDER BY started_at DESC LIMIT 1`, [bus.id],
  );
  const trip = tripResult.rows[0];
  if (!trip) return res.status(409).json({ error: 'No active trip for this bus' });

  let studentId: string | null = null;
  let exceptionType: string | null = null;
  const normalizedUid = input.rfidUid ? normalizeRfid(input.rfidUid) : null;
  if (normalizedUid) {
    const student = await pool.query<{ id: string; assigned_bus_id: string | null }>(
      'SELECT id, assigned_bus_id FROM students WHERE rfid_uid = $1 AND active = true', [normalizedUid],
    );
    if (!student.rows[0]) exceptionType = 'UNREGISTERED_CARD';
    else {
      studentId = student.rows[0].id;
      if (student.rows[0].assigned_bus_id && student.rows[0].assigned_bus_id !== bus.id) exceptionType = 'WRONG_BUS';
    }
  }

  const inserted = await pool.query(`
    INSERT INTO device_events (
      event_id, trip_id, bus_id, type, rfid_uid, student_id, latitude, longitude,
      device_timestamp, exception_type, payload
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (bus_id, event_id) DO NOTHING
    RETURNING *
  `, [input.eventId, trip.id, bus.id, input.type, normalizedUid, studentId, input.latitude ?? null,
    input.longitude ?? null, input.deviceTimestamp, exceptionType, JSON.stringify(req.body)]);

  if (!inserted.rowCount) return res.status(200).json({ accepted: true, duplicate: true });
  const event = inserted.rows[0];
  let arrival: Awaited<ReturnType<typeof markTripArrived>> | null = null;

  if (input.type === 'GPS') {
    await pool.query(`UPDATE buses SET last_latitude=$1, last_longitude=$2, last_seen_at=now(), status='IN_TRANSIT' WHERE id=$3`,
      [input.latitude, input.longitude, bus.id]);
    const distance = haversineMeters(
      { latitude: input.latitude!, longitude: input.longitude! },
      { latitude: config.CAMPUS_LATITUDE, longitude: config.CAMPUS_LONGITUDE },
    );
    const now = new Date();
    if (distance <= config.CAMPUS_RADIUS_METERS) {
      if (!trip.campus_candidate_at) {
        await pool.query('UPDATE trips SET campus_candidate_at = now() WHERE id = $1', [trip.id]);
      } else if (isDwellSatisfied(new Date(trip.campus_candidate_at), now, config.GEOFENCE_DWELL_SECONDS)) {
        arrival = await markTripArrived(trip.id, 'GPS_GEOFENCE');
      }
    } else if (trip.campus_candidate_at) {
      await pool.query('UPDATE trips SET campus_candidate_at = NULL WHERE id = $1', [trip.id]);
    }
    Object.assign(event, { distance_to_campus_meters: Math.round(distance) });
  }

  io.to('operations').emit('device:event', event);
  res.status(202).json({ accepted: true, duplicate: false, exceptionType, arrival });
}));

app.get('/api/events', requireAuth, allowRoles('ADMIN', 'FACULTY', 'TRANSPORT'), asyncRoute(async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(200).catch(60).parse(req.query.limit);
  const result = await pool.query(`
    SELECT e.id, e.type, e.rfid_uid, e.latitude, e.longitude, e.device_timestamp,
      e.received_at, e.exception_type, b.code AS bus_code, s.name AS student_name,
      s.department, s.academic_year, s.section
    FROM device_events e
    JOIN buses b ON b.id = e.bus_id
    LEFT JOIN students s ON s.id = e.student_id
    ORDER BY e.received_at DESC LIMIT $1
  `, [limit]);
  res.json({ events: result.rows });
}));

app.get('/api/attendance', requireAuth, allowRoles('ADMIN', 'FACULTY', 'TRANSPORT'), asyncRoute(async (req, res) => {
  const status = z.enum(['ALL','PROVISIONAL','PRESENT','ABSENT','EXCUSED']).catch('ALL').parse(req.query.status);
  const result = await pool.query(`
    SELECT ar.id, ar.status, ar.source, ar.created_at, ar.verified_at,
      s.name AS student_name, s.registration_number, s.department, s.academic_year, s.section,
      ats.subject_code, ats.subject_name, ats.session_date, ats.status AS session_status,
      b.code AS bus_code, u.name AS verified_by_name
    FROM attendance_records ar
    JOIN students s ON s.id = ar.student_id
    JOIN attendance_sessions ats ON ats.id = ar.session_id
    LEFT JOIN trips t ON t.id = ar.trip_id
    LEFT JOIN buses b ON b.id = t.bus_id
    LEFT JOIN users u ON u.id = ar.verified_by
    WHERE ($1 = 'ALL' OR ar.status = $1)
    ORDER BY ar.created_at DESC LIMIT 500
  `, [status]);
  res.json({ attendance: result.rows });
}));

app.patch('/api/attendance/:recordId', requireAuth, allowRoles('ADMIN', 'FACULTY'), asyncRoute(async (req, res) => {
  const recordId = z.string().uuid().parse(req.params.recordId);
  const input = z.object({ status: z.enum(['PRESENT','ABSENT','EXCUSED']) }).parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM attendance_records WHERE id = $1 FOR UPDATE', [recordId]);
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    const updated = await client.query(`
      UPDATE attendance_records SET status=$1, verified_by=$2, verified_at=now()
      WHERE id=$3 RETURNING *
    `, [input.status, req.user!.id, recordId]);
    await client.query(`INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_value, after_value)
      VALUES ($1,'VERIFY_ATTENDANCE','attendance_record',$2,$3,$4)`,
      [req.user!.id, recordId, before.rows[0], updated.rows[0]]);
    await client.query('COMMIT');
    io.to('operations').emit('attendance:updated', updated.rows[0]);
    res.json({ attendance: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

app.get('/api/analytics/overview', requireAuth, allowRoles('ADMIN', 'FACULTY', 'TRANSPORT'), asyncRoute(async (_req, res) => {
  const [totals, statusBreakdown, departments, timeline, exceptions] = await Promise.all([
    pool.query(`SELECT
      (SELECT COUNT(*)::int FROM students WHERE active=true) AS students,
      (SELECT COUNT(*)::int FROM buses) AS buses,
      (SELECT COUNT(*)::int FROM trips WHERE status='ACTIVE') AS active_trips,
      (SELECT COUNT(*)::int FROM attendance_records WHERE status='PROVISIONAL') AS awaiting_review,
      (SELECT COUNT(*)::int FROM device_events WHERE received_at > now() - interval '24 hours') AS events_24h`),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM attendance_records GROUP BY status ORDER BY status`),
    pool.query(`SELECT s.department, COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ar.status='PRESENT')::int AS present,
      COUNT(*) FILTER (WHERE ar.status='PROVISIONAL')::int AS provisional
      FROM attendance_records ar JOIN students s ON s.id=ar.student_id
      GROUP BY s.department ORDER BY total DESC`),
    pool.query(`SELECT to_char(date_trunc('day', created_at), 'Mon DD') AS day,
      COUNT(*)::int AS records,
      COUNT(*) FILTER (WHERE status='PRESENT')::int AS verified
      FROM attendance_records WHERE created_at > now() - interval '7 days'
      GROUP BY date_trunc('day', created_at) ORDER BY date_trunc('day', created_at)`),
    pool.query(`SELECT COALESCE(exception_type,'VALID') AS type, COUNT(*)::int AS count
      FROM device_events WHERE received_at > now() - interval '7 days'
      GROUP BY COALESCE(exception_type,'VALID') ORDER BY count DESC`),
  ]);
  res.json({
    totals: totals.rows[0],
    attendanceStatus: statusBreakdown.rows,
    departments: departments.rows,
    timeline: timeline.rows,
    exceptions: exceptions.rows,
    generatedAt: new Date().toISOString(),
  });
}));

app.post('/api/ai/insights', requireAuth, allowRoles('ADMIN', 'FACULTY', 'TRANSPORT'), asyncRoute(async (req, res) => {
  if (!config.OPENROUTER_API_KEY) return res.status(503).json({ error: 'OPENROUTER_API_KEY is not configured' });
  const input = z.object({ question: z.string().trim().min(8).max(600) }).parse(req.body);
  const aggregate = await pool.query(`
    SELECT json_build_object(
      'attendance', (SELECT json_agg(x) FROM (
        SELECT status, COUNT(*)::int AS count FROM attendance_records
        WHERE created_at > now() - interval '30 days' GROUP BY status
      ) x),
      'departments', (SELECT json_agg(x) FROM (
        SELECT s.department, COUNT(*)::int AS records,
          COUNT(*) FILTER (WHERE ar.status='PRESENT')::int AS present,
          COUNT(*) FILTER (WHERE ar.status='ABSENT')::int AS absent
        FROM attendance_records ar JOIN students s ON s.id=ar.student_id
        WHERE ar.created_at > now() - interval '30 days' GROUP BY s.department
      ) x),
      'exceptions', (SELECT json_agg(x) FROM (
        SELECT COALESCE(exception_type,'VALID') AS type, COUNT(*)::int AS count
        FROM device_events WHERE received_at > now() - interval '30 days'
        GROUP BY COALESCE(exception_type,'VALID')
      ) x),
      'routes', (SELECT json_agg(x) FROM (
        SELECT b.route_name, COUNT(DISTINCT t.id)::int AS trips,
          COUNT(e.id) FILTER (WHERE e.type='RFID_SCAN')::int AS scans
        FROM buses b LEFT JOIN trips t ON t.bus_id=b.id
        LEFT JOIN device_events e ON e.trip_id=t.id
        GROUP BY b.route_name
      ) x)
    ) AS data
  `);
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': config.OPENROUTER_SITE_URL,
      'X-OpenRouter-Title': 'TransitSync AI',
    },
    body: JSON.stringify({
      model: config.OPENROUTER_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are a transport and academic attendance analyst. Use only the aggregate data supplied. Never infer individual student behavior. Clearly separate facts, risks, and recommended actions. If data is insufficient, say so. Return concise markdown.',
        },
        { role: 'user', content: `Question: ${input.question}\n\nAggregate 30-day operational data:\n${JSON.stringify(aggregate.rows[0]?.data ?? {})}` },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    return res.status(502).json({ error: 'OpenRouter request failed', detail: detail.slice(0, 500) });
  }
  const completion = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  res.json({ analysis: completion.choices?.[0]?.message?.content ?? '', model: config.OPENROUTER_MODEL, generatedAt: new Date().toISOString() });
}));

async function markTripArrived(tripId: string, source: 'GPS_GEOFENCE' | 'MANUAL_AUTHORIZED') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const trip = await client.query<{ id: string; bus_id: string; status: string }>(
      'SELECT id, bus_id, status FROM trips WHERE id=$1 FOR UPDATE', [tripId],
    );
    const found = trip.rows[0];
    if (!found) throw Object.assign(new Error('Trip not found'), { status: 404 });
    if (found.status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return { alreadyArrived: true, tripId, synchronized: { scanned: 0, created: 0, unmatched: 0 } };
    }
    await client.query(`UPDATE trips SET status='ARRIVED', arrived_at=now(), arrival_source=$1 WHERE id=$2`, [source, tripId]);
    await client.query(`UPDATE buses SET status='ARRIVED' WHERE id=$1`, [found.bus_id]);
    const synchronized = await synchronizeTripAttendance(client, tripId);
    await client.query('COMMIT');
    const payload = { alreadyArrived: false, tripId, source, synchronized, arrivedAt: new Date().toISOString() };
    io.to('operations').emit('trip:arrived', payload);
    io.to('operations').emit('attendance:synchronized', payload);
    return payload;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', issues: error.issues });
  const typed = error as { status?: number; code?: string; message?: string; detail?: string };
  if (typed.code === '23505') return res.status(409).json({ error: 'A record with that unique value already exists', detail: typed.detail });
  if (typed.code === '23503') return res.status(400).json({ error: 'A referenced record does not exist', detail: typed.detail });
  console.error(error);
  res.status(typed.status ?? 500).json({ error: typed.message ?? 'Internal server error' });
});

async function start() {
  await initializeDatabase();
  httpServer.listen(config.PORT, '0.0.0.0', () => {
    console.log(`TransitSync API listening on port ${config.PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start TransitSync API', error);
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`${signal} received; shutting down`);
  io.close();
  httpServer.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
