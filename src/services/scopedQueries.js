import { collection, query, where } from 'firebase/firestore';
import { appId, db } from '../config/firebase';

export function scopedCollection(name, identity, context = {}) {
  const base = collection(db, 'artifacts', appId, 'public', 'data', name);
  if (!identity) return null;
  if (identity.role === 'admin') {
    return context.schoolYear && ['quiz_results', 'quick_quiz_results', 'lesson_progress', 'handwritten_submissions', 'class_attendance'].includes(name)
      ? query(base, where('schoolYear', '==', context.schoolYear)) : base;
  }
  if (identity.role === 'teacher') {
    const constraints = [where('schoolCode', '==', identity.schoolCode)];
    if (['materials', 'lesson_notes', 'lesson_quizzes', 'quiz_results', 'quick_quiz_results', 'lesson_progress', 'handwritten_submissions', 'students', 'class_attendance', 'scorebooks'].includes(name)) {
      if (!identity.grades?.length) return null;
      constraints.push(where('grade', 'in', identity.grades));
    }
    if (['materials', 'lesson_notes', 'lesson_quizzes', 'quiz_results', 'quick_quiz_results', 'lesson_progress', 'handwritten_submissions'].includes(name)) {
      constraints.push(where('subject', '==', context.subject || identity.subjects?.[0] || ''));
    }
    if (context.schoolYear && ['quiz_results', 'quick_quiz_results', 'lesson_progress', 'handwritten_submissions', 'class_attendance'].includes(name)) constraints.push(where('schoolYear', '==', context.schoolYear));
    return query(base, ...constraints);
  }
  if (identity.role === 'student') {
    if (name === 'students') return identity.studentIds?.length ? query(base, where('__name__', 'in', identity.studentIds)) : null;
    if (['quiz_results', 'quick_quiz_results'].includes(name) && import.meta.env.VITE_SERVER_QUIZ_ENABLED === 'true') return null;
    if (['quiz_results', 'quick_quiz_results', 'lesson_progress', 'handwritten_submissions'].includes(name)) {
      return identity.studentIds?.length ? query(base, where('studentId', 'in', identity.studentIds)) : null;
    }
    if (name === 'student_profile_requests') return query(base, where('studentId', '==', identity.studentId));
    if (name === 'class_attendance' || name === 'scorebooks') return null;
    if (name === 'admission_applications') return null;
    if (name === 'lesson_quizzes') return import.meta.env.VITE_SERVER_QUIZ_ENABLED === 'true'
      ? query(base, where('schoolCode', '==', identity.schoolCode), where('grade', '==', identity.grade),
        where('schoolYear', '==', identity.schoolYear), where('serverGraded', '==', true)) : null;
    if (name === 'materials') return query(base, where('schoolCode', '==', identity.schoolCode), where('grade', '==', identity.grade), where('studentSafe', '==', true));
    if (name === 'lesson_notes') return query(base, where('schoolCode', '==', identity.schoolCode), where('grade', '==', identity.grade));
    return query(base, where('schoolCode', '==', identity.schoolCode));
  }
  return null;
}
