import { DEFAULT_SCHOOL_CODE, normalizeSchoolCode, normalizeSchoolYearKey } from './schoolClasses.js';
import { stableRecordId } from './idempotency.js';

export function inferScheduleSemester(semester = '', name = '') {
  const direct = String(semester).toLowerCase();
  if (direct.includes('2') || direct.includes('ii')) return 'hk2';
  if (direct.includes('1') || direct.includes('i')) return 'hk1';
  const text = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /hk2|hoc ky 2|hoc ki 2/.test(text) ? 'hk2' : 'hk1';
}

export function scheduleScopeKey(schedule, fallbackYear = '') {
  return stableRecordId('schedule-scope', normalizeSchoolYearKey(schedule.schoolYear || fallbackYear),
    normalizeSchoolCode(schedule.schoolCode) || DEFAULT_SCHOOL_CODE, inferScheduleSemester(schedule.semester, schedule.name));
}
