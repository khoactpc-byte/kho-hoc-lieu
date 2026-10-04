import { DEFAULT_SCHOOL_CODE, normalizeSchoolCode } from './schoolClasses.js';

export const teacherUsernameFromName = (fullName = '') => {
  const lastName = String(fullName).trim().split(/\s+/).filter(Boolean).at(-1) || '';
  return lastName
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '');
};

export const contentBelongsToCampus = (item = {}, schoolCode = '') => {
  const requestedCampus = normalizeSchoolCode(schoolCode);
  if (!requestedCampus || requestedCampus === 'UNKNOWN') return false;
  const contentCampus = normalizeSchoolCode(item.schoolCode) || DEFAULT_SCHOOL_CODE;
  return contentCampus === requestedCampus;
};

export const teacherHasContentScope = (profile = null, { schoolCode, grade, subject } = {}) => {
  if (!profile || profile.role !== 'teacher') return false;
  if (normalizeSchoolCode(profile.schoolCode) !== normalizeSchoolCode(schoolCode)) return false;
  return (profile.grades || []).map(String).includes(String(grade || ''))
    && (profile.subjects || []).includes(String(subject || ''));
};
