import { doc, runTransaction } from 'firebase/firestore';
import { appId, db } from '../config/firebase';

export async function saveLessonDraft(draft) {
  if (!draft?.noteId || !draft.authorId || typeof draft.baseContent !== 'string') throw new Error('Chờ tải bài học trước khi lưu.');
  const { noteId, baseContent } = draft;
  const data = { ...draft };
  ['noteId', 'baseContent', 'draftKey'].forEach(key => delete data[key]);
  const ref = doc(db, 'artifacts', appId, 'public', 'data', 'lesson_notes', noteId);
  await runTransaction(db, async transaction => {
    const current = (await transaction.get(ref)).data() || {};
    if ((current.content || '') !== baseContent && current.content !== data.content) {
      throw new Error('Bài học vừa được người khác sửa. Bản nháp được giữ để đối chiếu.');
    }
    transaction.set(ref, { ...data, updatedAt: Date.now() }, { merge: true });
  });
}
