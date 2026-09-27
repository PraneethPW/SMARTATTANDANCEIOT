import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesParentClaim, matchesStudentClaim } from './registration.js';

const student = {
  name: 'Asha Rao', rfid_uid: '04A1B2C3', department: 'CSE', academic_year: 2,
  section: 'A', assigned_bus_id: 'bus-1', active: true,
};
const claim = { name: 'asha rao', rfidUid: '04:a1:b2:c3', department: 'cse', academicYear: 2, section: 'a' };

test('student can claim only the matching card, class, and bus', () => {
  assert.equal(matchesStudentClaim(student, claim, 'bus-1'), true);
  assert.equal(matchesStudentClaim(student, { ...claim, rfidUid: '11223344' }, 'bus-1'), false);
  assert.equal(matchesStudentClaim(student, { ...claim, academicYear: 3 }, 'bus-1'), false);
  assert.equal(matchesStudentClaim(student, claim, 'bus-2'), false);
  assert.equal(matchesStudentClaim({ ...student, active: false }, claim, 'bus-1'), false);
});

test('parent claim uses only the recorded mobile number', () => {
  const parent = { parent_name: 'Meera Rao', parent_contact: '+91 98765 43210' };
  assert.equal(matchesParentClaim(parent, { parentContact: '98765 43210' }), true);
  assert.equal(matchesParentClaim(parent, { parentContact: '09876543210' }), true);
  assert.equal(matchesParentClaim(parent, { parentContact: '919876543210' }), true);
  const differentName = { ...parent, parent_name: 'Someone Else' };
  assert.equal(matchesParentClaim(differentName, { parentContact: '9876543210' }), true);
  assert.equal(matchesParentClaim(parent, { parentContact: '9876543211' }), false);
  assert.equal(matchesParentClaim({ ...parent, parent_contact: null }, { parentContact: '9876543210' }), false);
  assert.equal(matchesParentClaim({ parent_contact: '------' }, { parentContact: '------' }), false);
});
