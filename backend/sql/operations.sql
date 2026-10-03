-- Additive migration: keep historical evidence when a bus leaves the active fleet.
ALTER TABLE buses ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE buses ADD COLUMN IF NOT EXISTS starting_point text NOT NULL DEFAULT '';
ALTER TABLE buses ADD COLUMN IF NOT EXISTS destination text NOT NULL DEFAULT 'Campus';
ALTER TABLE buses ADD COLUMN IF NOT EXISTS driver_contact text NOT NULL DEFAULT '';
ALTER TABLE buses ADD COLUMN IF NOT EXISTS driver_details text NOT NULL DEFAULT '';
ALTER TABLE buses ADD COLUMN IF NOT EXISTS starts_at time;
ALTER TABLE buses ADD COLUMN IF NOT EXISTS schedule_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE buses ADD COLUMN IF NOT EXISTS schedule_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}';
CREATE TABLE IF NOT EXISTS bus_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bus_id uuid NOT NULL REFERENCES buses(id),
  name text NOT NULL, sequence integer NOT NULL CHECK(sequence>=0),
  latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  offset_minutes integer NOT NULL DEFAULT 0 CHECK(offset_minutes>=0),
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS bus_stops_bus_idx ON bus_stops(bus_id,sequence);
ALTER TABLE students ADD COLUMN IF NOT EXISTS boarding_stop_id uuid REFERENCES bus_stops(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS seat_number integer CHECK(seat_number>0);
ALTER TABLE students ADD COLUMN IF NOT EXISTS residency text NOT NULL DEFAULT 'DAY_SCHOLAR';
CREATE UNIQUE INDEX IF NOT EXISTS student_seat_unique ON students(assigned_bus_id,seat_number) WHERE active=true AND seat_number IS NOT NULL;
ALTER TABLE timetables ADD COLUMN IF NOT EXISTS room text NOT NULL DEFAULT '';
ALTER TABLE timetables ADD COLUMN IF NOT EXISTS period text NOT NULL DEFAULT '';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS scheduled_date date;
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_trip_once ON trips(bus_id,scheduled_date) WHERE scheduled_date IS NOT NULL;
CREATE TABLE IF NOT EXISTS face_enrollments (
  student_id uuid PRIMARY KEY REFERENCES students(id), descriptor jsonb NOT NULL,
  portrait text NOT NULL, consent_at timestamptz NOT NULL DEFAULT now(),
  enrolled_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id),
  approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS attendance_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES students(id),
  category text NOT NULL CHECK(category IN ('BUS','CLASS','HOSTEL')),
  trip_id uuid REFERENCES trips(id), session_id uuid REFERENCES attendance_sessions(id),
  source_event_id uuid REFERENCES device_events(id), created_by uuid REFERENCES users(id),
  turn_direction text NOT NULL CHECK(turn_direction IN ('LEFT','RIGHT')),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VERIFIED','EXPIRED','FAILED')),
  attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL DEFAULT now()+interval '3 minutes',
  verified_at timestamptz, face_distance double precision, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS challenges_student_idx ON attendance_challenges(student_id,created_at DESC);
CREATE TABLE IF NOT EXISTS bus_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES trips(id),
  student_id uuid NOT NULL REFERENCES students(id), bus_id uuid NOT NULL REFERENCES buses(id),
  source_event_id uuid REFERENCES device_events(id), challenge_id uuid REFERENCES attendance_challenges(id),
  status text NOT NULL DEFAULT 'PENDING_FACE' CHECK(status IN ('PENDING_FACE','PRESENT','ABSENT')),
  boarding_point text, boarded_at timestamptz, arrived_at timestamptz,
  face_verified_at timestamptz, driver_name text NOT NULL, vehicle_number text NOT NULL,
  UNIQUE(trip_id,student_id)
);
CREATE TABLE IF NOT EXISTS hostel_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES students(id),
  attendance_date date NOT NULL DEFAULT current_date, challenge_id uuid NOT NULL REFERENCES attendance_challenges(id),
  verified_at timestamptz NOT NULL DEFAULT now(), UNIQUE(student_id,attendance_date)
);
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  student_id uuid NOT NULL REFERENCES students(id), trip_id uuid NOT NULL REFERENCES trips(id),
  kind text NOT NULL, body text NOT NULL, context_key text NOT NULL DEFAULT '',
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,student_id,trip_id,kind,context_key)
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id uuid NOT NULL REFERENCES users(id), endpoint text PRIMARY KEY, subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS system_settings (key text PRIMARY KEY, value jsonb NOT NULL);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS face_verified_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS challenge_source_unique ON attendance_challenges(source_event_id) WHERE source_event_id IS NOT NULL;
ALTER TABLE bus_attendance DROP CONSTRAINT IF EXISTS bus_attendance_status_check;
ALTER TABLE bus_attendance ADD CONSTRAINT bus_attendance_status_check CHECK(status IN ('EXPECTED','PENDING_FACE','PRESENT','ABSENT','LEGACY_RFID'));
CREATE TABLE IF NOT EXISTS trip_manifest (
  trip_id uuid NOT NULL REFERENCES trips(id),student_id uuid NOT NULL REFERENCES students(id),
  boarding_point text,seat_number integer,PRIMARY KEY(trip_id,student_id)
);
INSERT INTO bus_attendance(trip_id,student_id,bus_id,source_event_id,status,boarded_at,arrived_at,driver_name,vehicle_number)
SELECT DISTINCT ON(e.trip_id,e.student_id) e.trip_id,e.student_id,e.bus_id,e.id,'LEGACY_RFID',e.received_at,t.arrived_at,b.driver_name,b.registration_number
FROM device_events e JOIN buses b ON b.id=e.bus_id JOIN trips t ON t.id=e.trip_id
WHERE e.type='RFID_SCAN' AND e.student_id IS NOT NULL AND e.exception_type IS NULL
ORDER BY e.trip_id,e.student_id,e.received_at
ON CONFLICT(trip_id,student_id) DO NOTHING;

-- Each period has its own session, including repeated subjects on the same day.
DO $$ DECLARE constraint_name text; BEGIN
 SELECT conname INTO constraint_name FROM pg_constraint WHERE conrelid='attendance_sessions'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (session_date, department, academic_year, section, subject_code)';
 IF constraint_name IS NOT NULL THEN EXECUTE format('ALTER TABLE attendance_sessions DROP CONSTRAINT %I',constraint_name); END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_period_once ON attendance_sessions(session_date,timetable_id) WHERE timetable_id IS NOT NULL;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_name text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS driver_name text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS vehicle_number text;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS schedule_time time;
