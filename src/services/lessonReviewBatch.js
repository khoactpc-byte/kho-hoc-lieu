import { collection, doc, getDoc, getDocsFromServer, query, where, runTransaction } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { existingLessonReview, lessonReviewBatchId, lessonReviewSourceHash, planLessonReviewBatch, reviewBatchMaterial } from '../utils/lessonReviewBatch';
import { learningUpdateId, learningUpdateMetadata, LEARNING_UPDATES_COLLECTION } from '../utils/learningUpdates';

export function createLessonReviewBatchService({ context, assertScope, hasDraft, serverEnabled, scoped = serverEnabled, request }) {
  const path = name => collection(db, 'artifacts', appId, 'public', 'data', name);
  const readRows = async name => {
    const constraints = [where('grade', '==', String(context.grade)), where('subject', '==', context.subject)];
    if (scoped) constraints.push(where('schoolCode', '==', context.schoolCode));
    const snapshot = await getDocsFromServer(query(path(name), ...constraints));
    assertScope();
    return snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
  };
  const findExisting = async week => existingLessonReview(await readRows('materials'), context, week);
  const check = row => {
    assertScope();
    if (hasDraft(row.id)) throw new Error(`Tuần ${row.week} đang có bản nháp chưa lưu. Lưu bài đang soạn rồi thử tiếp.`);
  };
  const scan = async () => {
    assertScope();
    const [notes, reviews] = await Promise.all([readRows('lesson_notes'), readRows('materials')]);
    return planLessonReviewBatch(notes, reviews, context);
  };
  const readSource = async row => {
    check(row);
    const note = (await getDoc(doc(path('lesson_notes'), row.id))).data() || {};
    check(row);
    if (!note.content?.trim()) throw new Error('Tuần này chưa có bài học.');
    if ((note.schoolCode || 'NAN') !== context.schoolCode || String(note.grade) !== String(context.grade) || note.subject !== context.subject) throw new Error('Nguồn bài học không khớp khối, môn hoặc trường.');
    return { ...row, html: note.content };
  };
  const save = async (row, result) => {
    check(row);
    if (!result?.quizData?.questions?.length || !result.content?.trim()) throw new Error('Bộ ôn tập chưa được kiểm tra đầy đủ.');
    const existing = await findExisting(row.week);
    if (existing) return { skipped: true, material: existing };
    const current = await readSource(row);
    if (current.html !== row.html) throw new Error('Bài học vừa thay đổi. Rà lại danh sách và tạo lại tuần này để bám đúng nguồn mới.');
    const id = await lessonReviewBatchId(context, row.week), ref = doc(path('materials'), id);
    const payload = reviewBatchMaterial(context, row, result);
    check(row);
    if (serverEnabled) {
      const previous = (await getDoc(ref)).data();
      if (existingLessonReview(previous ? [{ ...previous, id }] : [], context, row.week)) return { skipped: true, material: { ...previous, id } };
      check(row);
      let response;
      try {
        response = await request('publish', { kind: 'material', quizId: id, expectedVersion: previous?.serverVersion ?? null, expectedLegacyUpdatedAt: previous?.updatedAt ?? null,
          onlyIfLessonMissing: true, expectedLessonHash: await lessonReviewSourceHash(row.html), quiz: payload });
      } catch (failure) {
        const created = await findExisting(row.week).catch(() => null);
        if (created) return { skipped: true, material: created };
        throw failure;
      }
      return response.skipped ? { skipped: true, material: response.quiz } : { skipped: false, material: { ...payload, ...response.quiz, id } };
    }
    return runTransaction(db, async transaction => {
      const [saved, note, settings] = await Promise.all([transaction.get(ref), transaction.get(doc(path('lesson_notes'), row.id)), transaction.get(doc(path('settings'), 'global'))]);
      check(row);
      if ((note.data()?.content || '') !== row.html) throw new Error('Bài học vừa thay đổi. Rà lại danh sách và tạo lại tuần này.');
      const old = saved.data();
      if (existingLessonReview(old ? [{ ...old, id }] : [], context, row.week)) return { skipped: true, material: { ...old, id } };
      const locks = settings.data() || {};
      if (locks.maintenance?.active || locks.inputYearLocks?.[context.schoolYear]) throw new Error('Năm học đang khóa nhập liệu hoặc hệ thống đang bảo trì.');
      transaction.set(ref, payload);
      const update = learningUpdateMetadata('material', id, payload);
      if (update) transaction.set(doc(path(LEARNING_UPDATES_COLLECTION), learningUpdateId('material', id)), update);
      return { material: { ...payload, id }, skipped: false };
    });
  };
  const saveEdited = async (row, result, material) => {
    check(row);
    if (!material?.id || material.id !== await lessonReviewBatchId(context, row.week) || material.authorId !== context.authorId) throw new Error('Chỉ sửa bộ ôn tập vừa tạo trong lượt này.');
    const source = await readSource(row);
    if (source.html !== row.html) throw new Error('Bài học vừa thay đổi. Đóng và rà lại danh sách.');
    const ref = doc(path('materials'), material.id);
    const payload = { ...reviewBatchMaterial(context, row, result), createdAt: material.createdAt };
    if (serverEnabled) {
      const response = await request('publish', { kind: 'material', quizId: material.id, expectedVersion: material.serverVersion ?? null, expectedLegacyUpdatedAt: material.updatedAt ?? null, quiz: payload });
      check(row);
      return { material: { ...payload, ...response.quiz, id: material.id } };
    }
    return runTransaction(db, async transaction => {
      const [previous, note, settings] = await Promise.all([transaction.get(ref), transaction.get(doc(path('lesson_notes'), row.id)), transaction.get(doc(path('settings'), 'global'))]);
      check(row);
      const old = previous.data(), locks = settings.data() || {};
      if (!old || !existingLessonReview([old], context, row.week) || old.authorId !== context.authorId || old.updatedAt !== material.updatedAt) throw new Error('Bộ ôn tập vừa thay đổi. Đóng và mở lại để xem bản mới.');
      if ((note.data()?.content || '') !== row.html) throw new Error('Bài học vừa thay đổi.');
      if (locks.maintenance?.active || locks.inputYearLocks?.[context.schoolYear]) throw new Error('Năm học đang khóa nhập liệu hoặc hệ thống đang bảo trì.');
      transaction.set(ref, payload);
      const update = learningUpdateMetadata('material', material.id, payload);
      if (update) transaction.set(doc(path(LEARNING_UPDATES_COLLECTION), learningUpdateId('material', material.id)), update);
      return { material: { ...payload, id: material.id } };
    });
  };
  const readGenerated = async row => {
    check(row);
    const id = await lessonReviewBatchId(context, row.week);
    if (row.material?.id !== id) throw new Error('Chỉ sửa bộ ôn tập được tạo bằng chế độ hàng loạt.');
    const material = serverEnabled ? (await request('read', { kind: 'material', quizId: id })).quiz : (await getDoc(doc(path('materials'), id))).data();
    check(row);
    if (!material || material.authorId !== context.authorId || !existingLessonReview([material], context, row.week)) throw new Error('Không tìm thấy bộ ôn tập do thầy cô tạo trong phạm vi này.');
    return { ...material, id };
  };
  return { scan, findExisting, readSource, save, saveEdited, readGenerated };
}
