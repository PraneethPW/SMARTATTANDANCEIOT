CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','FACULTY','TRANSPORT','PARENT')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  registration_number text NOT NULL UNIQUE,
  route_name text NOT NULL,
  driver_name text NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  device_key_hash text NOT NULL,
  status text NOT NULL DEFAULT 'IDLE' CHECK (status IN ('IDLE','IN_TRANSIT','ARRIVED','OFFLINE')),
  last_latitude double precision,
  last_longitude double precision,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number text NOT NULL UNIQUE,
  rfid_uid text NOT NULL UNIQUE,
  name text NOT NULL,
  department text NOT NULL,
  academic_year integer NOT NULL CHECK (academic_year BETWEEN 1 AND 8),
  section text NOT NULL,
  parent_name text,
  parent_contact text,
  assigned_bus_id uuid REFERENCES buses(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timetables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL,
  academic_year integer NOT NULL,
  section text NOT NULL,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  subject_code text NOT NULL,
  subject_name text NOT NULL,
  faculty_id uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (department, academic_year, section, weekday, starts_at)
);

CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id uuid NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARRIVED','COMPLETED','CANCELLED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  campus_candidate_at timestamptz,
  arrived_at timestamptz,
  arrival_source text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_trip_per_bus ON trips(bus_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS device_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  bus_id uuid NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('RFID_SCAN','GPS')),
  rfid_uid text,
  student_id uuid REFERENCES students(id) ON DELETE SET NULL,
  latitude double precision,
  longitude double precision,
  device_timestamp timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  exception_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (bus_id, event_id)
);
CREATE INDEX IF NOT EXISTS device_events_trip_time_idx ON device_events(trip_id, received_at DESC);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id uuid REFERENCES timetables(id) ON DELETE SET NULL,
  session_date date NOT NULL,
  department text NOT NULL,
  academic_year integer NOT NULL,
  section text NOT NULL,
  subject_code text,
  subject_name text,
  faculty_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'PROVISIONAL' CHECK (status IN ('PROVISIONAL','FINALIZED')),
  UNIQUE (session_date, department, academic_year, section, subject_code)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  trip_id uuid REFERENCES trips(id) ON DELETE SET NULL,
  source_event_id uuid REFERENCES device_events(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'PROVISIONAL' CHECK (status IN ('PROVISIONAL','PRESENT','ABSENT','EXCUSED')),
  source text NOT NULL DEFAULT 'BUS_GEOFENCE',
  verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_records_status_idx ON attendance_records(status, created_at DESC);
CREATE INDEX IF NOT EXISTS students_class_idx ON students(department, academic_year, section);

