import { useEffect } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { collectionForView } from '../services/collectionSubscriptions';

function useCollection(name, scope, setter, enabled, onError) {
  const authUid = scope.user?.uid || '';
  const identity = JSON.stringify(scope.identity || null);
  const { scoped, role, isAdmin } = scope;
  const studentId = scope.student?.id || '', studentCode = scope.student?.accessCode || '';
  const apiOwned = scoped && scope.identity?.role === 'student' && ['quiz_results', 'quick_quiz_results'].includes(name) && import.meta.env.VITE_SERVER_QUIZ_ENABLED === 'true';
  const content = !apiOwned && ['materials', 'lesson_notes', 'lesson_quizzes', 'quiz_results', 'quick_quiz_results', 'lesson_progress', 'handwritten_submissions'].includes(name);
  const grade = content ? scope.grade : '';
  const subject = content ? scope.subject : '';
  const schoolYear = name === 'students' && scope.includeHistory ? '' : scope.schoolYear;
  useEffect(() => {
    let active = true;
    setter([]);
    if (!authUid || !enabled || apiOwned) return undefined;
    const ref = collectionForView(name, { scoped, identity: JSON.parse(identity), role, isAdmin,
      student: { id: studentId, accessCode: studentCode }, grade, subject, schoolYear });
    if (!ref) return undefined;
    const unsubscribe = onSnapshot(ref, snapshot => {
      if (!active) return;
      const documents = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      if (name === 'handwritten_submissions') documents.sort((a, b) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0));
      if (name === 'admission_applications') documents.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      setter(documents);
    }, error => { if (active) { setter([]); onError('Chưa tải được ' + name + ': ' + error.message, 'error'); } });
    return () => { active = false; unsubscribe(); };
  }, [name, authUid, identity, scoped, role, isAdmin, studentId, studentCode, grade, subject, schoolYear, enabled, setter, onError, apiOwned]);
}

// Independent effects: a subject change never reopens the roster/admission/attendance feeds.
export function useWorkspaceCollections(scope, setters, screens, onError) {
  const admin = scope.isAdmin || scope.role === 'admin';
  const results = !admin || screens.quiz || screens.learning || screens.review;
  useCollection('materials', scope, setters.materials, true, onError);
  useCollection('lesson_notes', scope, setters.notes, true, onError);
  useCollection('lesson_quizzes', scope, setters.quizzes, true, onError);
  useCollection('quiz_results', scope, setters.quizResults, results, onError);
  useCollection('quick_quiz_results', scope, setters.quickResults, results, onError);
  useCollection('lesson_progress', scope, setters.progress, !admin || screens.review, onError);
  useCollection('handwritten_submissions', scope, setters.handwritten, results, onError);
  useCollection('students', scope, setters.students, true, onError);
  useCollection('admission_applications', scope, setters.admissions, admin, onError);
  useCollection('class_attendance', scope, setters.attendance, screens.attendance || screens.scorebook || screens.learning, onError);
  useCollection('student_profile_requests', scope, setters.profileRequests, true, onError);
}
