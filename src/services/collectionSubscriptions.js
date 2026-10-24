import { collection, query, where } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { scopedCollection } from './scopedQueries';

export function collectionForView(name, { scoped, identity, role, isAdmin, student, grade, schoolYear, subject }) {
  const base = collection(db, 'artifacts', appId, 'public', 'data', name);
  if (name === 'news') return base;
  if (scoped) return scopedCollection(name, identity, { grade, subject, schoolYear });
  if (isAdmin || role === 'admin') {
    const filters = [];
    if (schoolYear && ['students', 'lesson_progress', 'class_attendance'].includes(name)) filters.push(where('schoolYear', '==', schoolYear));
    if (grade && ['materials', 'lesson_notes', 'lesson_quizzes'].includes(name)) filters.push(where('grade', '==', String(grade)));
    return filters.length ? query(base, ...filters) : base;
  }
  if (role !== 'teacher' && role !== 'student') return null;
  if (name === 'admission_applications') return null;
  if (name === 'students') {
    return role === 'teacher' ? schoolYear ? query(base, where('schoolYear', '==', schoolYear)) : base
      : student?.accessCode ? query(base, where('accessCode', '==', student.accessCode)) : null;
  }
  if (name === 'student_profile_requests') return role === 'student' && student?.id
    ? query(base, where('studentId', '==', student.id)) : null;
  if (role === 'student' && ['quiz_results', 'quick_quiz_results', 'lesson_progress', 'handwritten_submissions'].includes(name)) {
    return student?.accessCode ? query(base, where('studentAccessCode', '==', student.accessCode)) : null;
  }
  if (name === 'class_attendance' && role === 'student') return null;
  if (name === 'class_attendance') return query(base, where('schoolYear', '==', schoolYear));
  return grade ? query(base, where('grade', '==', String(grade))) : null;
}
