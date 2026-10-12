import { getStudentSchoolCode, normalizeSchoolCode, SCHOOL_OPTIONS } from './schoolClasses.js';
import { scorebookDocumentId } from './scorebookArchive.js';
import { sameData } from './dataEquality.js';

const COLLECTIONS = ['students', 'student_archives', 'scorebooks', 'class_attendance', 'class_timetables', 'class_schedules',
  'schedule_publications', 'student_profile_requests', 'admission_applications', 'materials', 'lesson_notes',
  'lesson_quizzes', 'quiz_results', 'quick_quiz_results', 'lesson_progress', 'handwritten_submissions'];
const withoutId = data => Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'id'));
const campusValues = data => [data.schoolCode, data.campusCode, data.schoolKey, data.campusKey, data.schoolId, data.schoolName, data.coSoDangKy];

export function planCampusNormalization(snapshot, schoolCode) {
  const school = SCHOOL_OPTIONS.find(item => item.code === schoolCode && item.code !== 'UNKNOWN');
  if (!school || snapshot?.version !== 2 || !snapshot.collections) throw new Error('Cần bản đọc đầy đủ và cơ sở hợp lệ để chuẩn hóa.');
  const groups = [], conflicts = [], skipped = [];
  const counts = {};
  for (const name of COLLECTIONS) {
    const rows = snapshot.collections[name] || [];
    const byId = new Map(rows.map(row => [row.id, row]));
    const processed = new Set();
    const ordered = name === 'scorebooks' ? [...rows].sort((a, b) =>
      Number(a.id === scorebookDocumentId({ ...a, schoolCode })) - Number(b.id === scorebookDocumentId({ ...b, schoolCode }))) : rows;
    for (const row of ordered) {
      if (processed.has(row.id)) continue;
      if (row.campusNormalization?.archivedTo) continue;
      const otherCampus = campusValues(row).map(normalizeSchoolCode).find(code => code && code !== 'UNKNOWN' && code !== schoolCode);
      if (otherCampus) { skipped.push({ name, id: row.id, reason: `Đã thuộc cơ sở ${otherCampus}` }); continue; }
      const before = withoutId(row);
      const patch = { schoolCode };
      if (['students', 'student_archives', 'scorebooks', 'admission_applications'].includes(name) || Object.hasOwn(row, 'schoolName')) patch.schoolName = school.name;
      // Do not change class suffixes, years, stable identities, marks, or attendance entries.
      const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => !sameData(before[key], value)));
      if (name === 'scorebooks') {
        if (!row.schoolYear || !row.sourceFile || !row.grade) { conflicts.push({ name, id: row.id, reason: 'Sổ thiếu năm học, khối hoặc mẫu; cần đối chiếu.' }); continue; }
        const targetId = scorebookDocumentId({ ...row, schoolCode });
        if (targetId !== row.id) {
          const otherSources = rows.filter(other => !other.campusNormalization?.archivedTo && other.id !== row.id && other.id !== targetId
            && other.schoolYear === row.schoolYear && String(other.grade) === String(row.grade) && other.sourceFile === row.sourceFile
            && ['UNKNOWN', schoolCode].includes(getStudentSchoolCode(other)));
          if (otherSources.length) { conflicts.push({ name, id: row.id, reason: 'Có nhiều bản sổ cùng năm/khối; cần chọn bản gốc.' }); continue; }
          const target = byId.get(targetId), targetData = target ? withoutId(target) : undefined;
          const merged = { ...before, ...(targetData || {}), ...patch };
          let conflict = false;
          for (const field of ['edits', 'scoreSources', 'columnWidths']) {
            const oldMap = before[field] || {}, newMap = targetData?.[field] || {};
            if (Object.keys(oldMap).some(key => Object.hasOwn(newMap, key) && !sameData(oldMap[key], newMap[key]))) conflict = true;
            if (before[field] || targetData?.[field]) merged[field] = { ...oldMap, ...newMap };
          }
          if (conflict) { conflicts.push({ name, id: row.id, reason: 'Bản sổ mới có ô khác bản cũ; chưa ghi đè.' }); continue; }
          delete merged.campusNormalization;
          processed.add(targetId);
          groups.push({ name, id: row.id, operations: [
            { name, id: targetId, before: targetData, data: merged },
            { name, id: row.id, before, patch: { ...patch, campusNormalization: { archivedTo: targetId } } }
          ] });
          counts[name] = (counts[name] || 0) + 1;
          continue;
        }
      }
      if (!Object.keys(changed).length) continue;
      groups.push({ name, id: row.id, operations: [{ name, id: row.id, before, patch: changed }] });
      counts[name] = (counts[name] || 0) + 1;
    }
  }
  return { schoolCode, schoolName: school.name, groups, counts, conflicts, skipped, createdAt: Date.now() };
}
