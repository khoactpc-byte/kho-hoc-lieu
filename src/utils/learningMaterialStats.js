import { contentBelongsToCampus, teacherHasContentScope } from './teacherAccess.js';
import { DEFAULT_SCHOOL_CODE, normalizeSchoolCode } from './schoolClasses.js';
import { TOTAL_LESSONS, EXAM_LESSONS } from '../config/learningDomain.js';
import { compareTeachingSubjects } from './teacherPresentation.js';

export function buildLearningMaterialRows({ materials = [], notes = [], quizzes = [], schoolYear,
  grades = [], subjects = [], grade = 'all', subject = 'all', schoolCode, teacherProfile,
  seedEmpty = false, isQuizVisible = () => false, totalLessons = TOTAL_LESSONS } = {}) {
  const rows = new Map();
  const allowed = item => (!schoolCode || contentBelongsToCampus(item, schoolCode))
    && (!teacherProfile || teacherHasContentScope(teacherProfile, { schoolCode, grade: item.grade, subject: item.subject }))
    && (!item.schoolYear || String(item.schoolYear) === String(schoolYear))
    && (!grades.length || grades.map(String).includes(String(item.grade)))
    && (!subjects.length || subjects.includes(item.subject))
    && (grade === 'all' || String(item.grade) === String(grade))
    && (subject === 'all' || item.subject === subject);
  const ensure = item => {
    const campus = normalizeSchoolCode(item.schoolCode) || DEFAULT_SCHOOL_CODE;
    const key = `${campus}__${item.grade}__${item.subject}`;
    if (!rows.has(key)) rows.set(key, { key, schoolCode: campus, grade: String(item.grade), subject: item.subject,
      materialCount: 0, noteCount: 0, quizCount: 0, weeks: new Map() });
    return rows.get(key);
  };
  if (seedEmpty) for (const g of grades) for (const s of subjects) {
    const item = { grade: g, subject: s, schoolCode };
    if (allowed(item)) ensure(item);
  }
  const add = (item, kind) => {
    if (!item.grade || !item.subject || !allowed(item)) return;
    const row = ensure(item);
    row[`${kind === 'notes' ? 'note' : kind === 'quizzes' ? 'quiz' : 'material'}Count`] += 1;
    const lesson = Number(item.lesson);
    if (!Number.isInteger(lesson) || lesson < 1 || lesson > totalLessons) return;
    if (!row.weeks.has(lesson)) row.weeks.set(lesson, { lesson: String(lesson), notes: [], materials: [], quizzes: [] });
    row.weeks.get(lesson)[kind].push(item);
  };
  materials.filter(item => item.type !== 'quick_quiz').forEach(item => add(item, 'materials'));
  notes.filter(item => String(item.content || '').replace(/<[^>]*>|&nbsp;|\s/g, '') || /<(img|video|iframe)\b/i.test(item.content || '')).forEach(item => add(item, 'notes'));
  quizzes.filter(isQuizVisible).forEach(item => add(item, 'quizzes'));
  return [...rows.values()].map(row => {
    const weeks = [...row.weeks.values()].sort((a, b) => Number(a.lesson) - Number(b.lesson));
    const lessonList = weeks.map(item => item.lesson);
    return { ...row, weeks, lessonList, lessonCount: weeks.length,
      missingLessons: Array.from({ length: totalLessons }, (_, i) => String(i + 1)).filter(lesson => !EXAM_LESSONS.includes(Number(lesson)) && !lessonList.includes(lesson)) };
  }).sort((a, b) => a.grade.localeCompare(b.grade, 'vi', { numeric: true }) || compareTeachingSubjects(a.subject, b.subject) || a.schoolCode.localeCompare(b.schoolCode));
}
