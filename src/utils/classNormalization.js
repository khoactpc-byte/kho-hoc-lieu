import { DEFAULT_SCHOOL_CODE, getStudentSchoolCode, normalizeSchoolClassName } from './schoolClasses.js';
import { sameData } from './dataEquality.js';

// This is an explicit repair for the existing NAN roster, not an inference from a suffix.
export function nanClass(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return value;
  const normalized = normalizeSchoolClassName(value);
  return /^[1-9](?:[A-Z][A-Z0-9-]*)?$/.test(normalized) ? `${normalized[0]}A` : value;
}
const fields = ['className', 'targetClass', 'sourceClassName', 'targetClassName'];
function classPatch(row) {
  const patch = {};
  for (const field of fields) if (Object.hasOwn(row, field)) {
    const next = nanClass(row[field]);
    if (!sameData(next, row[field])) patch[field] = next;
  }
  if (Object.hasOwn(row, 'classSuffix') && row.classSuffix !== 'A') patch.classSuffix = 'A';
  if (row.classHistory && typeof row.classHistory === 'object' && !Array.isArray(row.classHistory)) {
    const history = Object.fromEntries(Object.entries(row.classHistory).map(([year, value]) => [year,
      value && typeof value === 'object' ? (getStudentSchoolCode(value) === 'TQK' ? value : { ...value, ...classPatch(value) }) : nanClass(value)]));
    if (!sameData(history, row.classHistory)) patch.classHistory = history;
  }
  if (row.promotion && typeof row.promotion === 'object') {
    const promotion = { ...row.promotion, ...classPatch(row.promotion) };
    if (!sameData(promotion, row.promotion)) patch.promotion = promotion;
  }
  return patch;
}

export function planClassNormalization(snapshot) {
  if (snapshot?.version !== 2 || !snapshot.collections) throw new Error('Cần đọc đầy đủ dữ liệu trước khi chuẩn hóa lớp.');
  const groups = [], counts = {}, conflicts = [], changes = new Map();
  const names = ['students', 'student_archives', 'class_attendance', 'class_timetables', 'class_schedules', 'student_profile_requests', 'admission_applications'];
  for (const name of names) for (const row of snapshot.collections[name] || []) {
    if (getStudentSchoolCode(row) !== 'NAN') continue;
    const before = Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'id'));
    const patch = classPatch(row);
    if (name === 'class_schedules') {
      const rows = row.classRows || [];
      const map = new Map(rows.map(item => [item.id, (item.grades || item.id.split('&')).map(nanClass).join('&')]));
      if (new Set(map.values()).size !== map.size) { conflicts.push({ name, id: row.id, reason: 'Các hàng thời khóa biểu trùng nhau sau khi đổi lớp.' }); continue; }
      const classRows = rows.map(item => {
        const id = map.get(item.id);
        return { ...item, id, label: `Lớp ${id}`, grades: (item.grades || item.id.split('&')).map(nanClass) };
      });
      const schedule = {};
      for (const [key, value] of Object.entries(row.schedule || {})) {
        const target = map.get(key) || key;
        if (Object.hasOwn(schedule, target)) conflicts.push({ name, id: row.id, reason: 'Trùng lịch học; cần đối chiếu.' });
        schedule[target] = value;
      }
      if (!sameData(classRows, rows)) patch.classRows = classRows;
      if (!sameData(schedule, row.schedule || {})) patch.schedule = schedule;
    }
    if (name === 'class_timetables') {
      const order = (row.classOrder || []).map(nanClass);
      const slots = {};
      for (const [key, value] of Object.entries(row.slots || {})) {
        const target = nanClass(key);
        if (Object.hasOwn(slots, target)) conflicts.push({ name, id: row.id, reason: 'Trùng lịch lớp; cần đối chiếu.' });
        slots[target] = value;
      }
      if (!sameData(order, row.classOrder || [])) patch.classOrder = order;
      if (!sameData(slots, row.slots || {})) patch.slots = slots;
    }
    if (!Object.keys(patch).length) continue;
    if (patch.className) changes.set(`${row.schoolYear || ''}: ${row.className} → ${patch.className}`, true);
    groups.push({ name, id: row.id, operations: [{ name, id: row.id, before, patch }] });
    counts[name] = (counts[name] || 0) + 1;
  }
  // Retain attendance document ids and entries. The UI resolves them by year/date/class metadata.
  const attendanceKeys = new Set();
  for (const row of snapshot.collections.class_attendance || []) {
    const className = getStudentSchoolCode(row) === 'NAN' ? nanClass(row.className) : row.className;
    const key = `${row.schoolYear}/${getStudentSchoolCode(row)}/${row.date}/${className}`;
    if (attendanceKeys.has(key)) conflicts.push({ name: 'class_attendance', id: row.id, reason: 'Nhiều bảng điểm danh cùng ngày/lớp sau chuẩn hóa.' });
    attendanceKeys.add(key);
  }
  return { groups, counts, conflicts, changes: [...changes.keys()] };
}

export function attendanceDocumentId(rows, { schoolYear, schoolCode, className, date }) {
  const matches = rows.filter(row => row.schoolYear === schoolYear && row.date === date && row.className === className && getStudentSchoolCode(row) === schoolCode);
  if (matches.length > 1) throw new Error('Có nhiều bảng điểm danh cùng lớp/ngày; cần đối chiếu trước khi sửa.');
  return matches[0]?.id || `${schoolYear}_${date}_${schoolCode && schoolCode !== DEFAULT_SCHOOL_CODE ? `${schoolCode}_` : ''}K${className}`;
}

export function verifyClassNormalization(before, after, plan) {
  for (const group of plan.groups) for (const operation of group.operations) {
    const saved = after.collections[operation.name]?.find(row => row.id === operation.id);
    if (!saved || !sameData(saved, { id: operation.id, ...operation.before, ...operation.patch })) {
      throw new Error('Đã cập nhật nhưng kết quả đọc lại có thay đổi khác; cần đối chiếu bản sao lưu.');
    }
  }
  const byId = rows => Object.fromEntries((rows || []).map(row => [row.id, row]));
  if (!sameData(byId(before.collections.scorebooks), byId(after.collections.scorebooks))) throw new Error('Sổ điểm vừa thay đổi trong lúc chuẩn hóa; cần đối chiếu.');
  return true;
}
