import { onSnapshot, query, where } from 'firebase/firestore';
import { collectionForView } from './collectionSubscriptions';
import { contentBelongsToCampus, teacherHasContentScope } from '../utils/teacherAccess';

// Read only the selected lesson; the two panes share this subscription when their contexts match.
export function observeTeachingLesson({ profile, schoolYear, grade, subject, lesson, ...scope }, next, fail) {
  if (!teacherHasContentScope(profile, { schoolCode: profile?.schoolCode, grade, subject })) {
    fail(new Error('Lớp hoặc môn này chưa được phân công.'));
    return () => {};
  }
  let active = true, failed = false;
  const reportError = error => { if (active && !failed) { failed = true; fail(error); } };
  const data = { notes: [], materials: [], quizzes: [], loading: true }, pending = new Set(['notes', 'materials', 'quizzes']), unsubscribers = [];
  try {
    for (const [kind, name] of Object.entries({ notes: 'lesson_notes', materials: 'materials', quizzes: 'lesson_quizzes' })) {
      const source = collectionForView(name, { ...scope, role: 'teacher', schoolYear, grade, subject });
      if (!source) throw new Error('Chưa xác định được phạm vi bài học.');
      unsubscribers.push(onSnapshot(query(source, where('lesson', '==', String(lesson))), snapshot => {
        if (!active || failed) return;
        data[kind] = snapshot.docs.map(item => ({ ...item.data(), id: item.id })).filter(item =>
          String(item.grade) === String(grade) && item.subject === subject && contentBelongsToCampus(item, profile.schoolCode)
          && (!item.schoolYear || item.schoolYear === schoolYear));
        pending.delete(kind);
        next({ ...data, loading: pending.size > 0 });
      }, reportError));
    }
  } catch (error) { active = false; unsubscribers.forEach(unsubscribe => unsubscribe()); fail(error); }
  return () => { active = false; unsubscribers.forEach(unsubscribe => unsubscribe()); };
}
