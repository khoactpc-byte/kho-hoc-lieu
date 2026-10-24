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

export function buildAttendancePeriodSummary({ label, schoolYear, groups }) {
  const totals = { cp: 0, kp: 0 };
  const sections = groups.map(({ className, schoolName, rows }) => {
    const cp = rows.reduce((sum, row) => sum + row.cp, 0);
    const kp = rows.reduce((sum, row) => sum + row.kp, 0);
    totals.cp += cp; totals.kp += kp;
    const names = key => rows.filter(row => row[key] > 0).map(row => `${row.student.fullName} (${row[key]} buổi)`).join(', ') || 'Không có';
    return `\nLỚP ${className}${schoolName ? ` · ${schoolName}` : ''}\nSĩ số: ${rows.length} học sinh\nCP: ${names('cp')}\nKP: ${names('kp')}\nTổng lượt vắng: ${cp + kp} (CP ${cp}, KP ${kp})`;
  });
  return [`BÁO CÁO ĐIỂM DANH - ${label.toUpperCase()}`, `Năm học ${schoolYear}`, ...sections,
    `\nTỔNG CỘNG: ${totals.cp + totals.kp} lượt vắng (CP ${totals.cp}, KP ${totals.kp})`].join('\n');
}
