import {
  DEFAULT_THD_CLASS_COUNT,
  THD_CLASS_GRADES,
  createDefaultThdClasses
} from './thdDefaults';

export const normalizeClassName = (value = '') => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

export const normalizeTypedAssignmentClassName = (value = '') => {
  const text = normalizeClassName(value).replace(/\/+/g, '/');
  const letterMatch = text.match(/^([6-9])A(\d{1,2})$/);
  return letterMatch ? `${letterMatch[1]}/${Number(letterMatch[2])}` : text;
};

export const getGradeFromManagedClassName = (className = '') => String(className || '').match(/[1-9]\d*/)?.[0]?.[0] || '';

export const getClassSortParts = (className = '') => {
  const text = normalizeClassName(className);
  const match = text.match(/^(\d+)(.*?)(\d+)$/) || text.match(/^(\d+)(.*)$/);
  return {
    grade: match ? Number(match[1]) : Number(getGradeFromManagedClassName(text) || 0),
    prefix: match ? (match[2] || '') : text,
    number: match && match[3] ? Number(match[3]) : 0,
    text
  };
};

export const compareManagedClasses = (left, right) => {
  const a = getClassSortParts(left);
  const b = getClassSortParts(right);
  return (a.grade - b.grade)
    || a.prefix.localeCompare(b.prefix, 'vi')
    || (a.number - b.number)
    || a.text.localeCompare(b.text, 'vi', { numeric: true });
};

export const getNextManagedClassName = (grade = '', existingClasses = []) => {
  const gradeKey = String(grade || '').trim();
  const existing = existingClasses.map(normalizeClassName).filter(Boolean);
  const lastClass = existing[existing.length - 1] || `${gradeKey}/0`;
  const lastParts = getClassSortParts(lastClass);
  const samePatternNumbers = existing
    .map(className => getClassSortParts(className))
    .filter(parts => String(parts.grade) === gradeKey && parts.prefix === lastParts.prefix && parts.number)
    .map(parts => parts.number);
  const nextNumber = samePatternNumbers.length ? Math.max(...samePatternNumbers) + 1 : 1;
  return `${gradeKey}${lastParts.prefix || '/'}${nextNumber}`;
};

export const normalizeThdSubjectGrades = (value = []) => {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(/[,;.\s]+/);
  const grades = source.map(item => String(item || '').replace(/[^\d]/g, '')).filter(grade => THD_CLASS_GRADES.includes(grade));
  return grades.length ? [...new Set(grades)] : THD_CLASS_GRADES;
};

const isOldDefaultThdClassList = (grade = '', rows = []) => (
  rows.length === DEFAULT_THD_CLASS_COUNT
  && rows.every((className, index) => normalizeClassName(className) === `${grade}A${index + 1}`)
);

export const normalizeThdClasses = (value = {}) => {
  const defaults = createDefaultThdClasses();
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(THD_CLASS_GRADES.map(grade => {
    const rows = Array.isArray(source[grade]) ? source[grade] : defaults[grade];
    const cleaned = rows.map(normalizeClassName).filter(Boolean);
    if (isOldDefaultThdClassList(grade, cleaned)) return [grade, defaults[grade]];
    return [grade, cleaned.length ? [...new Set(cleaned)] : defaults[grade]];
  }));
};
