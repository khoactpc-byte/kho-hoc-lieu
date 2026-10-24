import { compareSchoolClassNames, getSchoolGrade, normalizeSchoolClassName } from './schoolClasses.js';
import { linkedProfileRecords, profileSchoolYear } from './studentProfileHistory.js';
import { historicalRosterForYear } from './historicalStudents.js';

// A grade number alone cannot identify a class. Never append a made-up PC/A/B suffix.
export function displaySchoolClass(value) {
  const name = normalizeSchoolClassName(value);
  return /^(?:1[0-2]|[1-9])[A-Z][A-Z0-9-]*$/.test(name) ? name : '';
}

export function scorebookRosterClassLabel(students, grade) {
  const names = [...new Set(students.map(student => displaySchoolClass(student.className)).filter(Boolean))].sort(compareSchoolClassNames);
  return names.length ? `LỚP ${names.join(', ')}` : `KHỐI ${getSchoolGrade(grade) || grade}`;
}

export function transcriptClassForYear({ student = {}, records = [], schoolYear, currentSchoolYear }) {
  const year = profileSchoolYear(schoolYear || currentSchoolYear);
  const linked = linkedProfileRecords(student, records).sort((a, b) => Number(a !== student) - Number(b !== student)
    || Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const actual = linked.find(record => profileSchoolYear(record.schoolYear) === year && displaySchoolClass(record.className));
  if (actual) return displaySchoolClass(actual.className);
  for (const record of linked) {
    for (const [key, value] of Object.entries(record.classHistory || {})) {
      const name = displaySchoolClass(typeof value === 'string' ? value : value?.className);
      if (profileSchoolYear(key) === year && name) return name;
    }
    const promotion = record.promotion;
    if (profileSchoolYear(promotion?.sourceSchoolYear) === year && displaySchoolClass(promotion?.sourceClassName)) return displaySchoolClass(promotion.sourceClassName);
  }
  const inferred = historicalRosterForYear(linked, year).find(record => record.historicalProjection);
  if (inferred) return displaySchoolClass(inferred.className) || '—';
  if (!student.schoolYear && year === profileSchoolYear(currentSchoolYear)) return displaySchoolClass(student.className) || '—';
  return '—';
}
