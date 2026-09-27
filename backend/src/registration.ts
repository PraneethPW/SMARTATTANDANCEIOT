import { normalizeRfid } from './domain.js';

type ExistingStudent = {
  name: string; rfid_uid: string; department: string; academic_year: number;
  section: string; assigned_bus_id: string | null; active: boolean;
};
type StudentClaim = {
  name: string; rfidUid: string; department: string; academicYear: number;
  section: string;
};

export function matchesStudentClaim(student: ExistingStudent, input: StudentClaim, busId: string) {
  return student.active && student.name.trim().toLowerCase() === input.name.trim().toLowerCase() &&
    student.rfid_uid === normalizeRfid(input.rfidUid) &&
    student.department === input.department.trim().toUpperCase() &&
    student.academic_year === input.academicYear &&
    student.section === input.section.trim().toUpperCase() &&
    (!student.assigned_bus_id || student.assigned_bus_id === busId);
}

export function normalizeParentMobile(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function matchesParentClaim(student: { parent_contact: string | null }, input: { parentContact: string }) {
  if (!student.parent_contact) return false;
  const recorded = normalizeParentMobile(student.parent_contact);
  return recorded.length >= 6 && recorded === normalizeParentMobile(input.parentContact);
}
