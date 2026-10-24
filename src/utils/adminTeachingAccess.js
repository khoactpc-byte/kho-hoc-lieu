import { GRADES, SUBJECTS } from '../config/learningDomain.js';
import { primarySubjectsForGrade } from './primaryAcademic.js';
import { SCHOOL_OPTIONS, normalizeSchoolCode } from './schoolClasses.js';

export const ADMIN_TEACHING_SCHOOLS = SCHOOL_OPTIONS.filter(school => school.code !== 'UNKNOWN');
export const ADMIN_TEACHING_GRADES = ['1', '2', '3', '4', '5', ...GRADES];

// This profile drives the existing teacher UI only. Server credentials and the
// Firebase identity remain those of the administrator who performs each write.
export function createAdminTeachingProfile({ schoolCode, uid }) {
  const campus = normalizeSchoolCode(schoolCode);
  if (!uid || !ADMIN_TEACHING_SCHOOLS.some(school => school.code === campus)) return null;
  const subjectsByGrade = Object.fromEntries(ADMIN_TEACHING_GRADES.map(grade => [grade,
    [...(Number(grade) <= 5 ? primarySubjectsForGrade(grade).map(subject => subject.label) : SUBJECTS), 'Chủ nhiệm']]));
  return { role: 'teacher', id: `admin:${uid}:${campus}`, fullName: 'Admin hỗ trợ giáo viên',
    schoolCode: campus, grades: ADMIN_TEACHING_GRADES, subjects: [...new Set(Object.values(subjectsByGrade).flat())], subjectsByGrade };
}

export function canUseAdminTeaching({ isAdmin, accessScope, sessionToken, uid, scoped, identity }) {
  return Boolean(isAdmin && accessScope === 'full' && sessionToken && uid && (!scoped || identity?.role === 'admin'));
}
