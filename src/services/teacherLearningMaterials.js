import { onSnapshot } from 'firebase/firestore';
import { collectionForView } from './collectionSubscriptions';

// The teacher editor loads only its selected context. The tracker must load every assigned context.
export function observeTeacherLearningMaterials({ user, scoped, identity, profile, schoolYear, isAdmin = false }, onChange, onError) {
  let active = true;
  const snapshots = new Map(), pending = new Set(), unsubscribers = [];
  const contexts = isAdmin ? [{}] : scoped ? (profile?.subjects || []).map(subject => ({ subject }))
    : (profile?.grades || []).map(grade => ({ grade }));
  const collections = { materials: 'materials', notes: 'lesson_notes', quizzes: 'lesson_quizzes' };
  for (const kind of Object.keys(collections)) for (const index of contexts.keys()) pending.add(`${kind}:${index}`);
  const emit = () => {
    const data = { materials: [], notes: [], quizzes: [], loading: pending.size > 0 };
    for (const kind of Object.keys(collections)) {
      const byId = new Map();
      for (const [key, items] of snapshots) if (key.startsWith(`${kind}:`)) for (const item of items) byId.set(item.id, item);
      data[kind] = [...byId.values()];
    }
    onChange(data);
  };
  if (!user?.uid || !profile?.grades?.length || !profile?.subjects?.length) { onChange({ materials: [], notes: [], quizzes: [], loading: false }); return () => {}; }
  emit();
  for (const [kind, name] of Object.entries(collections)) for (const [index, context] of contexts.entries()) {
    const key = `${kind}:${index}`;
    const ref = collectionForView(name, { scoped, identity, role: 'teacher', isAdmin, schoolYear, ...context });
    if (!ref) { pending.delete(key); onError('Chưa xác định được phạm vi học liệu của giáo viên.'); continue; }
    unsubscribers.push(onSnapshot(ref, snapshot => {
      if (!active) return;
      snapshots.set(key, snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
      pending.delete(key); emit();
    }, () => { if (active) { pending.delete(key); onError('Chưa tải đủ học liệu. Vui lòng đóng và mở lại bảng để thử lại.'); } }));
  }
  return () => { active = false; unsubscribers.forEach(unsubscribe => unsubscribe()); };
}

export function observeTeacherQuizManagement({ user, scoped, identity, profile, schoolYear, isAdmin = false, includeInbox = false }, onChange, onError) {
  let active = true;
  const snapshots = new Map(), pending = new Set(), unsubscribers = [];
  const contentContexts = isAdmin ? [{}] : scoped ? (profile?.subjects || []).map(subject => ({ subject })) : (profile?.grades || []).map(grade => ({ grade }));
  const collections = { quizzes: 'lesson_quizzes', results: 'quiz_results', handwritten: 'handwritten_submissions', students: 'students',
    ...(includeInbox ? { quickResults: 'quick_quiz_results', materials: 'materials' } : {}) };
  const jobs = Object.entries(collections).flatMap(([kind, name]) => (kind === 'students' ? [{}] : contentContexts).map((context, index) => ({ kind, name, context, key: `${kind}:${index}` })));
  jobs.forEach(job => pending.add(job.key));
  const emit = () => {
    const data = { loading: pending.size > 0 };
    for (const kind of Object.keys(collections)) {
      const byId = new Map();
      for (const [key, items] of snapshots) if (key.startsWith(`${kind}:`)) for (const item of items) byId.set(item.id, item);
      data[kind] = [...byId.values()];
    }
    onChange(data);
  };
  if (!user?.uid || !profile?.grades?.length || !profile?.subjects?.length) { onError('Chưa xác định được tài khoản hoặc phân công giáo viên.'); return () => {}; }
  emit();
  for (const { name, context, key } of jobs) {
    try {
      const ref = collectionForView(name, { scoped, identity, role: 'teacher', isAdmin, schoolYear, ...context });
      if (!ref) throw new Error('missing scope');
      unsubscribers.push(onSnapshot(ref, snapshot => {
        if (!active) return;
        snapshots.set(key, snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
        pending.delete(key); emit();
      }, () => { if (active) onError('Chưa tải đủ đề, bài nộp hoặc danh sách lớp. Đóng và mở lại để thử lại.'); }));
    } catch { if (active) onError('Chưa mở được dữ liệu bài kiểm tra theo phân công.'); }
  }
  return () => { active = false; unsubscribers.forEach(unsubscribe => unsubscribe()); };
}
