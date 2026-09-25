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

export function matchesParentClaim(student: { parent_name: string | null; parent_contact: string | null }, input: { name: string; parentContact: string }) {
  const contact = (value: string) => value.replace(/\D/g, '');
  return !!student.parent_name && !!student.parent_contact &&
    student.parent_name.trim().toLowerCase() === input.name.trim().toLowerCase() &&
    contact(student.parent_contact) === contact(input.parentContact);
}
