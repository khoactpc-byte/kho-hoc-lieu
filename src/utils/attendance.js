export const attendanceCellKey = ({ schoolYear, schoolCode, className, date, student }) =>
  [schoolYear, schoolCode, className, date, student.id].join('/');

export function applyAttendanceEntry(rows, input, entry) {
  const existing = rows.find(row => row.id === input.documentId);
  if (Number(existing?.records?.[input.student.id]?.updatedAt || 0) > Number(entry.updatedAt || 0)) return rows;
  const next = { ...(existing || { id: input.documentId, schoolYear: input.schoolYear,
    schoolCode: input.schoolCode, className: input.className, date: input.date }),
  records: { ...existing?.records, [input.student.id]: entry } };
  return existing ? rows.map(row => row === existing ? next : row) : [...rows, next];
}

export function buildAttendanceSummary({ date, schoolYear, groups }) {
  const dateLabel = date.split('-').reverse().join('/');
  return [`ĐIỂM DANH - ${dateLabel}`, `Năm học ${schoolYear}`, ...groups.map(({ className, schoolName, students, records }) => {
    const absent = status => students.filter(student => records[student.id]?.status === status);
    const cp = absent('CP'), kp = absent('KP');
    return `\nLỚP ${className}${schoolName ? ` · ${schoolName}` : ''}\nCó mặt: ${students.length - cp.length - kp.length}/${students.length}\nCP: ${cp.map(student => student.fullName).join(', ') || 'Không có'}\nKP: ${kp.map(student => student.fullName).join(', ') || 'Không có'}\nTổng vắng: ${cp.length + kp.length} (CP ${cp.length}, KP ${kp.length})`;
  })].join('\n');
}
