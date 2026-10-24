import { onSnapshot } from 'firebase/firestore';
import { collectionForView } from './collectionSubscriptions';
import { teacherSubmissionScope } from '../utils/teacherSubmissionInbox';

// Watch submission sources for the red badge; roster and assignment details load on open.
export function observeTeacherSubmissionAlerts({ user, scoped, identity, profile, schoolYear, isAdmin = false }, next, onError) {
  let active = true;
  const stops = [], snapshots = new Map();
  const contexts = isAdmin ? [{}] : scoped ? (profile?.subjects || []).map(subject => ({ subject })) : (profile?.grades || []).map(grade => ({ grade }));
  const names = { results: 'quiz_results', quickResults: 'quick_quiz_results', handwritten: 'handwritten_submissions' };
  const pending = new Set(Object.keys(names).flatMap(kind => contexts.map((_, i) => `${kind}:${i}`)));
  const emit = () => {
    const data = { loading: pending.size > 0, results: [], quickResults: [], handwritten: [] };
    for (const kind of Object.keys(names)) {
      const records = new Map();
      for (const [key, rows] of snapshots) if (key.startsWith(`${kind}:`)) for (const row of rows) records.set(row.id, row);
      data[kind] = [...records.values()];
    }
    next(data);
  };
  if (!user?.uid || !contexts.length || !profile?.subjects?.length) { next({ loading: false, results: [], quickResults: [], handwritten: [] }); return () => {}; }
  emit();
  for (const [kind, name] of Object.entries(names)) for (const [index, context] of contexts.entries()) {
    const key = `${kind}:${index}`;
    try {
      const ref = collectionForView(name, { scoped, identity, role: 'teacher', isAdmin, schoolYear, ...context });
      if (!ref) throw new Error('missing scope');
      stops.push(onSnapshot(ref, snapshot => {
        if (!active) return;
        const fields = ['studentId', 'studentAccessCode', 'schoolCode', 'schoolYear', 'grade', 'subject', 'lesson', 'quizId', 'materialId', 'submittedAt', 'status', 'exitReason', 'scoreTarget'];
        snapshots.set(key, snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })).filter(row => teacherSubmissionScope(row, profile, schoolYear))
          .map(row => Object.fromEntries(['id', ...fields].filter(field => row[field] !== undefined).map(field => [field, row[field]]))));
        pending.delete(key); emit();
      }, () => { if (active) onError('Chưa cập nhật được thông báo bài nộp. Mở Bài kiểm tra để kiểm tra lại.'); }));
    } catch { if (active) onError('Chưa xác định được phạm vi thông báo bài nộp.'); }
  }
  return () => { active = false; stops.forEach(stop => stop()); };
}
