import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { collectionForView } from '../services/collectionSubscriptions';
import { readPublishedLessonIndex, SUPABASE_LESSONS_ENABLED } from '../services/supabaseLessons';

function useCollection(name, scope, setter, enabled, onError) {
  const authUid = scope.user?.uid || '';
  const identity = JSON.stringify(scope.identity || null);
  const { scoped, role, isAdmin } = scope;
  const studentId = scope.student?.id || '', studentCode = scope.student?.accessCode || '';
  const apiOwned = (scoped && scope.identity?.role === 'student' && ['quiz_results', 'quick_quiz_results'].includes(name) && import.meta.env.VITE_SERVER_QUIZ_ENABLED === 'true')
    || (name === 'lesson_notes' && (scope.identity?.role === 'student' || role === 'student') && SUPABASE_LESSONS_ENABLED);
  const content = !apiOwned && ['materials', 'lesson_notes', 'lesson_quizzes', 'quiz_results', 'quick_quiz_results', 'lesson_progress', 'handwritten_submissions'].includes(name);
  const grade = content && !scope.fullContent || apiOwned && name === 'lesson_notes' ? scope.grade : '';
  const schoolCode = scope.schoolCode || scope.student?.schoolCode || scope.identity?.schoolCode || '';
  const subject = content ? scope.subject : '';
  const schoolYear = name === 'students' && scope.includeHistory ? '' : scope.schoolYear;
  const key = JSON.stringify([name, authUid, identity, scoped, role, isAdmin, studentId, studentCode, grade, subject, schoolYear, schoolCode, enabled, apiOwned]);
  const [readyKey, setReadyKey] = useState(null);
  useEffect(() => {
    let active = true;
    setReadyKey(null);
    setter([]);
    if (!authUid || !enabled) return undefined;
    if (apiOwned) {
      if (name !== 'lesson_notes') return undefined;
      const controller = new AbortController();
      readPublishedLessonIndex({ schoolCode, schoolYear, grade, signal: controller.signal }).then(rows => {
        if (active) { setter(rows); setReadyKey(key); }
      }).catch(error => { if (active && error.name !== 'AbortError') { setReadyKey(key); onError('Chưa tải được danh mục bài học.', 'error'); } });
      return () => { active = false; controller.abort(); };
    }
    const ref = collectionForView(name, { scoped, identity: JSON.parse(identity), role, isAdmin,
      student: { id: studentId, accessCode: studentCode }, grade, subject, schoolYear });
    if (!ref) return undefined;
    const unsubscribe = onSnapshot(ref, snapshot => {
      if (!active) return;
      const documents = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      if (name === 'handwritten_submissions') documents.sort((a, b) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0));
      if (name === 'admission_applications') documents.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      setter(documents);
      setReadyKey(key);
    }, error => { if (active) { setReadyKey(null); setter([]); onError('Chưa tải được ' + name + ': ' + error.message, 'error'); } });
    return () => { active = false; unsubscribe(); };
  }, [name, authUid, identity, scoped, role, isAdmin, studentId, studentCode, grade, subject, schoolYear, schoolCode, enabled, setter, onError, apiOwned, key]);
  return Boolean(authUid && enabled && (apiOwned || readyKey === key));
}

// Independent effects: a subject change never reopens the roster/admission/attendance feeds.
export function useWorkspaceCollections(scope, setters, screens, onError) {
  const admin = scope.isAdmin || scope.role === 'admin';
  const content = screens.content ?? Boolean(scope.grade && scope.subject);
  const results = screens.quiz || screens.learning || screens.review || !admin && content;
  const materialsReady = useCollection('materials', scope, setters.materials, content, onError);
  const notesReady = useCollection('lesson_notes', scope, setters.notes, content, onError);
  useCollection('lesson_quizzes', scope, setters.quizzes, content, onError);
  const quizReady = useCollection('quiz_results', scope, setters.quizResults, results, onError);
  const quickReady = useCollection('quick_quiz_results', scope, setters.quickResults, results, onError);
  const progressReady = useCollection('lesson_progress', scope, setters.progress, screens.learning || screens.review || !admin && content, onError);
  const handwrittenReady = useCollection('handwritten_submissions', scope, setters.handwritten, results, onError);
  useCollection('students', scope, setters.students, true, onError);
  useCollection('admission_applications', scope, setters.admissions, admin, onError);
  useCollection('class_attendance', scope, setters.attendance, screens.attendance || screens.scorebook || screens.learning, onError);
  useCollection('student_profile_requests', scope, setters.profileRequests, true, onError);
  return { learningReady: materialsReady && notesReady && quizReady && quickReady && progressReady && handwrittenReady };
}
