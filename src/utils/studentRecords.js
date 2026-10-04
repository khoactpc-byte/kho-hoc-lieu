// Names are display data, never sufficient to identify a student's private work.
export function recordBelongsToStudent(record = {}, student = {}) {
  const expectedCode = String(student.accessCode || student.studentAccessCode || '').trim().toUpperCase();
  const actualCode = String(record.studentAccessCode || record.accessCode || '').trim().toUpperCase();
  if (expectedCode && actualCode) return expectedCode === actualCode;
  const expectedId = student.studentId || student.id;
  const actualId = record.studentId;
  return !!expectedId && !!actualId && expectedId === actualId;
}

export function findStudentAttendanceRecord(records = {}, student = {}) {
  return Object.entries(records).map(([key, record]) => ({ ...record, studentId: record.studentId || key }))
    .find(record => recordBelongsToStudent(record, student));
}

export function studentWorkKey(record = {}, studentsById = new Map()) {
  const student = studentsById.get(record.studentId);
  const code = String(record.studentAccessCode || record.accessCode || '').trim().toUpperCase();
  const expectedCode = String(student?.accessCode || '').trim().toUpperCase();
  if (code && expectedCode && code !== expectedCode) return '';
  if (code || expectedCode) return `code:${code || expectedCode}`;
  return record.studentId ? `id:${record.studentId}` : '';
}
