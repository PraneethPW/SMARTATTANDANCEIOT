export type Bus = {
  id: string; code: string; registration_number: string; route_name: string; driver_name: string;
  capacity: number; status: string; last_latitude: number | null; last_longitude: number | null;
  last_seen_at: string | null; assigned_students: number; active_trip_id: string | null;
};

export type Student = {
  id: string; registration_number: string; rfid_uid: string; name: string; department: string;
  academic_year: number; section: string; parent_name?: string; parent_contact?: string;
  assigned_bus_id: string | null; assigned_bus_code: string | null; active: boolean;
};

export type DeviceEvent = {
  id: string; type: 'RFID_SCAN' | 'GPS'; rfid_uid: string | null; latitude: number | null; longitude: number | null;
  device_timestamp: string; received_at: string; exception_type: string | null; bus_code: string;
  student_name: string | null; department: string | null; academic_year: number | null; section: string | null;
};

export type Attendance = {
  id: string; status: 'PROVISIONAL' | 'PRESENT' | 'ABSENT' | 'EXCUSED'; source: string; created_at: string;
  verified_at: string | null; student_name: string; registration_number: string; department: string;
  academic_year: number; section: string; subject_code: string; subject_name: string; session_date: string;
  bus_code: string | null; verified_by_name: string | null;
};

export type Analytics = {
  totals: { students: number; buses: number; active_trips: number; awaiting_review: number; events_24h: number };
  attendanceStatus: Array<{ status: string; count: number }>;
  departments: Array<{ department: string; total: number; present: number; provisional: number }>;
  timeline: Array<{ day: string; records: number; verified: number }>;
  exceptions: Array<{ type: string; count: number }>;
  generatedAt: string;
};

