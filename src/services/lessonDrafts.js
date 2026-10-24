import { doc, runTransaction } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { learningUpdateMetadata, learningUpdateId, LEARNING_UPDATES_COLLECTION } from '../utils/learningUpdates';
import { normalizeLessonLayoutMode } from '../utils/lessonLayout';
import { notifyLessonSaved, saveLessonSource } from './lessonDelivery';

export async function saveLessonDraft(draft) {
  if (!draft?.noteId || !draft.authorId || typeof draft.baseContent !== 'string') throw new Error('Chờ tải bài học trước khi lưu.');
  if (draft.layoutMode !== undefined && normalizeLessonLayoutMode(draft.layoutMode) !== draft.layoutMode) throw new Error('Bố cục bài học không hợp lệ.');
  if (import.meta.env?.VITE_SUPABASE_LESSON_SYNC_ENABLED === 'true') {
    await saveLessonSource(draft);
    try { notifyLessonSaved(draft.noteId); } catch { /* The server has already queued this version. */ }
    return;
  }
  const { noteId, baseContent } = draft;
  const data = { ...draft };
  ['noteId', 'baseContent', 'baseLayoutMode', 'draftKey'].forEach(key => delete data[key]);
  const ref = doc(db, 'artifacts', appId, 'public', 'data', 'lesson_notes', noteId);
  await runTransaction(db, async transaction => {
    const current = (await transaction.get(ref)).data() || {};
    if ((current.content || '') !== baseContent && current.content !== data.content) {
      throw new Error('Bài học vừa được người khác sửa. Bản nháp được giữ để đối chiếu.');
    }
    const currentMode = normalizeLessonLayoutMode(current.layoutMode);
    if (draft.layoutMode !== undefined && draft.baseLayoutMode !== undefined && currentMode !== normalizeLessonLayoutMode(draft.baseLayoutMode) && currentMode !== draft.layoutMode) {
      throw new Error('Bố cục bài học vừa được người khác sửa. Bản nháp được giữ để đối chiếu.');
    }
    const saved = { ...data, updatedAt: Date.now() };
    transaction.set(ref, saved, { merge: true });
    const update = learningUpdateMetadata('note', noteId, saved);
    if (update) transaction.set(doc(db, 'artifacts', appId, 'public', 'data', LEARNING_UPDATES_COLLECTION, learningUpdateId('note', noteId)), update);
  });
  // A delivery failure must never turn a committed source save into a failed save.
  try { notifyLessonSaved(noteId); } catch { /* The durable marker will be retried by the server. */ }
}
