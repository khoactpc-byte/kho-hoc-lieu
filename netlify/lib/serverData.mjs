import { createHash } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { sameData } from '../../src/utils/dataEquality.js';
import { hasLegacyRowEdits, studentScoreIdentity, migrateLegacyRowEdits } from '../../src/utils/studentScoreKeys.js';
import { SUBJECTS, TOTAL_LESSONS } from '../../src/config/learningDomain.js';
import { SCOREBOOK_SOURCE_FILE } from '../../src/config/scorebookDomain.js';
import { writeScoreAudit } from './scoreAudit.mjs';
import { activeStudent, documentId, fail, scoreCell, scoreValue, teacherScope, writable } from './dataPolicy.mjs';

const profileFields = new Set(('fullName birthDate birthProvince birthDistrict birthWard birthPlaceName birthRegistrationProvince birthRegistrationDistrict birthRegistrationWard hometownProvince hometownDistrict hometownWard identityCode phone province ward address householdProvince householdWard householdAddress fatherName fatherBirthYear fatherJob fatherPhone motherName motherBirthYear motherJob motherPhone temporaryStatus transport portraitUrl birthCertificateUrl identityCardUrl transcriptUrl hocLucLop6 hocLucLop7 hocLucLop8 hanhKiemLop6 hanhKiemLop7 hanhKiemLop8').split(' '));
const hash = value => createHash('sha256').update(value).digest('hex');
const hasValue = value => value !== undefined && value !== null && String(value).trim() !== '';
export function createDataService({ store, appId, now = Date.now, verifySubmissionFile }) {
  const root = `artifacts/${appId}/public/data`, ref = (name, id) => store.doc(`${root}/${name}/${documentId(id)}`);
  const settingsRef = ref('settings', 'global');
  async function saveScores(actor, payload) {
    const { documentId: bookId, metadata, expectedEdits = {}, expectedSources = {}, onlyEmpty, draftSaveId } = payload;
    fail(metadata && ['admin', 'teacher'].includes(actor.role), 403, 'Không có quyền sửa điểm.');
    const patch = payload.editPatch ? Object.fromEntries(Object.entries(payload.editPatch).map(([key, value]) => [key, { value }])) : payload.patch;
    fail(patch && Object.keys(patch).length > 0 && Object.keys(patch).length <= 3000, 400, 'Chỉ lưu từ 1 đến 3000 ô mỗi lần.');
    const expectedId = `${metadata.schoolYear}_${metadata.sourceFile}_${metadata.schoolCode}_khoi_${metadata.grade}`.replace(/[^\w-]+/g, '_');
    fail(bookId === expectedId, 400, 'Mã sổ điểm không khớp phạm vi.');
    const cells = Object.entries(patch).map(([key, cell]) => {
      const policy = scoreCell(actor, metadata, key);
      fail(cell && !Array.isArray(cell), 400, 'Ô điểm không hợp lệ.');
      const value = policy?.numeric ? scoreValue(cell.value) : cell.value == null ? null : String(cell.value);
      fail(value == null || String(value).length <= 1000, 400, 'Nội dung ô quá dài.');
      return { key, policy, value, random: cell.source?.source === 'random' };
    });
    return store.runTransaction(async tx => {
      const book = (await tx.get(ref('scorebooks', bookId))).data() || {};
      const settings = (await tx.get(settingsRef)).data() || {}; writable(settings, metadata.schoolYear);
      for (const field of ['schoolYear', 'schoolCode', 'grade', 'sourceFile']) fail(!book[field] || String(book[field]) === String(metadata[field]), 409, 'Sổ điểm đã đổi phạm vi.');
      fail(!hasLegacyRowEdits(book.edits) && !hasLegacyRowEdits(book.scoreSources), 409, 'Đối chiếu điểm cũ trước khi sửa.');
      const checkedPupils = new Set();
      for (const { policy } of cells) if (policy && !checkedPupils.has(policy.studentKey)) {
        const stable = await tx.get(store.collection(`${root}/students`).where('studentKey', '==', policy.studentKey).limit(16));
        const legacy = await tx.get(store.collection(`${root}/students`).where('accessCode', '==', policy.studentKey).limit(16));
        fail([...stable.docs, ...legacy.docs].some(item => { const data = item.data(); return data.schoolYear === metadata.schoolYear && data.schoolCode === metadata.schoolCode && (String(data.className || '').match(/^[1-9]\d*/)?.[0] || String(data.grade)) === String(metadata.grade); }), 403, 'Ô điểm không thuộc học sinh trong sổ này.');
        checkedPupils.add(policy.studentKey);
      }
      const edits = { ...book.edits }, sources = { ...book.scoreSources }, changed = [];
      for (const { key, value, policy, random } of cells) {
        if (onlyEmpty && (hasValue(edits[key]) || sources[key])) continue;
        fail(sameData(edits[key], expectedEdits[key]) && (payload.editPatch || sameData(sources[key], expectedSources[key])), 409, 'Có người khác vừa sửa ô điểm. Giữ bản nháp để đối chiếu.');
        if (value === null) delete edits[key]; else edits[key] = value;
        if (policy?.numeric) sources[key] = { source: value === null ? 'manualCleared' : random && actor.role === 'admin' ? 'random' : 'manual', actorId: actor.uid, updatedAt: now() };
        changed.push(key);
      }
      const fields = { schoolYear: metadata.schoolYear, schoolCode: metadata.schoolCode, grade: String(metadata.grade), sourceFile: metadata.sourceFile, schemaVersion: 2, updatedAt: now(), edits, scoreSources: sources };
      if (draftSaveId) fields.draftSaveId = documentId(draftSaveId);
      tx.set(ref('scorebooks', bookId), { ...book, ...fields });
      writeScoreAudit(tx, { store, appId, actor, bookId, scope: metadata, before: book, after: { edits, scoreSources: sources }, keys: changed, createdAt: now(), reason: 'manual-save' });
      return { keys: changed, edits };
    });
  }
  async function profileRequest(actor, { changes }) {
    fail(changes && Object.keys(changes).length > 0 && Object.keys(changes).every(key => profileFields.has(key) && typeof changes[key] === 'string' && changes[key].length <= 2000), 400, 'Trường hồ sơ không được phép hoặc quá dài.');
    return store.runTransaction(async tx => {
      const profile = (await tx.get(ref('students', actor.studentId))).data();
      const settings = (await tx.get(settingsRef)).data() || {}; activeStudent(actor, profile, settings);
      const target = ref('student_profile_requests', `profile-${actor.studentId}`);
      const previous = (await tx.get(target)).data();
      tx.set(target, { studentId: actor.studentId, studentName: profile.fullName || '', accessCode: profile.accessCode,
        schoolYear: actor.schoolYear, schoolCode: actor.schoolCode, grade: actor.grade, className: profile.className || '',
        changes: { ...(previous?.status === 'pending' ? previous.changes : {}), ...changes }, status: 'pending', authorId: actor.uid, createdAt: previous?.createdAt || now(), updatedAt: now() });
      return { id: target.id || `profile-${actor.studentId}` };
    });
  }
  function configuredScoreKey(submission) {
    const target = submission.scoreTarget;
    fail(target && ['hki', 'hkii'].includes(target.semester), 409, 'Bài chưa có cột điểm đã xác nhận.');
    return `custom:${target.semester}Score:${target.pageIndex}:u${studentScoreIdentity(submission)}:s${target.scoreIndex}`;
  }
  async function syncScore(actor, { documentId: bookId, metadata, key, score, attempt, overwriteExisting = false }) {
    fail(attempt && ['quiz_results', 'quick_quiz_results', 'handwritten_submissions'].includes(attempt.kind), 400, 'Lượt làm không hợp lệ.');
    return store.runTransaction(async tx => {
      const submitted = (await tx.get(ref(attempt.kind, attempt.id))).data();
      fail(submitted && submitted.quizId === attempt.quizId, 409, 'Lượt làm đã thay đổi hoặc bị xóa.'); teacherScope(actor, submitted);
      fail(attempt.kind === 'handwritten_submissions' ? submitted.status === 'teacher_reviewed' : submitted.serverGraded === true && submitted.completed !== false && !submitted.needsRetake,
        409, 'Điểm cần giáo viên xác nhận trước khi đồng bộ.');
      fail(key === configuredScoreKey(submitted), 403, 'Cột điểm không khớp cấu hình của bài.');
      const policy = scoreCell(actor, metadata, key);
      fail(policy?.numeric && policy.subject === submitted.subject, 403, 'Môn điểm không khớp bài nộp.');
      const expectedId = `${metadata.schoolYear}_${metadata.sourceFile}_${metadata.schoolCode}_khoi_${metadata.grade}`.replace(/[^\w-]+/g, '_');
      fail(bookId === expectedId && ['schoolYear', 'schoolCode', 'grade'].every(field => submitted[field] === metadata[field]), 403, 'Sổ điểm khác phạm vi.');
      const bookRef = ref('scorebooks', bookId), book = (await tx.get(bookRef)).data() || {};
      const settings = (await tx.get(settingsRef)).data() || {}; writable(settings, metadata.schoolYear);
      fail(['schoolYear', 'schoolCode', 'grade', 'sourceFile'].every(field => !book[field] || book[field] === metadata[field]), 409, 'Sổ điểm vừa đổi phạm vi.');
      fail(!hasLegacyRowEdits(book.edits) && !hasLegacyRowEdits(book.scoreSources), 409, 'Đối chiếu điểm cũ trước khi đồng bộ.');
      const raw = attempt.kind === 'handwritten_submissions' ? submitted.teacherScore : submitted.score;
      const maximum = attempt.kind === 'handwritten_submissions' ? submitted.teacherMaxScore : submitted.total;
      fail(hasValue(raw) && Number(maximum) > 0 && scoreValue(Number(raw) / Number(maximum) * 10) === scoreValue(score), 409, 'Điểm vừa thay đổi. Tải lại trước khi đồng bộ.');
      const previous = book.scoreSources?.[key];
      if (['manual', 'manualCleared', 'random'].includes(previous?.source) || hasValue(book.edits?.[key]) && (!overwriteExisting || previous?.source !== 'quiz' || previous.quizId !== attempt.quizId)) return { written: false };
      const next = { ...book, ...Object.fromEntries(['schoolYear', 'schoolCode', 'grade', 'sourceFile'].map(field => [field, metadata[field]])), schemaVersion: 2, updatedAt: now(),
        edits: { ...book.edits, [key]: scoreValue(score) }, scoreSources: { ...book.scoreSources, [key]: { source: 'quiz', quizId: attempt.quizId, attemptId: attempt.id, attemptKind: attempt.kind, updatedAt: now() } } };
      tx.set(bookRef, next);
      writeScoreAudit(tx, { store, appId, actor, bookId, scope: metadata, before: book, after: next, keys: [key], createdAt: now(), reason: 'result-sync' });
      return { written: true };
    });
  }
  async function migrateScores(actor, { documentId: bookId, roster, expectedEdits, expectedSources, dryRun = true }) {
    fail(actor.role === 'admin', 403, 'Chỉ admin được chuyển điểm cũ.');
    fail(Array.isArray(roster) && roster.length > 0 && roster.length <= 500, 400, 'Danh sách đối chiếu không hợp lệ.');
    return store.runTransaction(async tx => {
      const target = ref('scorebooks', bookId), book = (await tx.get(target)).data();
      fail(book, 404, 'Không tìm thấy sổ điểm.');
      const settings = (await tx.get(settingsRef)).data() || {}; writable(settings, book.schoolYear);
      fail(sameData(book.edits || {}, expectedEdits || {}) && sameData(book.scoreSources || {}, expectedSources || {}), 409, 'Điểm đã thay đổi từ lúc xem trước.');
      for (const pupil of roster) {
        const live = (await tx.get(ref('students', pupil.id))).data();
        fail(live && studentScoreIdentity(live) === studentScoreIdentity(pupil) && live.schoolYear === book.schoolYear && live.schoolCode === book.schoolCode
          && String(live.className || '').match(/^\d+/)?.[0] === String(book.grade), 409, 'Danh sách đối chiếu có học sinh không thuộc sổ hoặc đã đổi mã.');
      }
      const edits = migrateLegacyRowEdits(book.edits, roster), scoreSources = migrateLegacyRowEdits(book.scoreSources || {}, roster);
      if (dryRun || !hasLegacyRowEdits(book.edits) && !hasLegacyRowEdits(book.scoreSources)) return { edits, dryRun };
      const migration = { verifiedBy: actor.uid, verifiedAt: now(), roster: roster.map(pupil => ({ id: pupil.id, studentKey: pupil.studentKey || pupil.accessCode })), legacyEdits: book.edits || {}, legacySources: book.scoreSources || {} };
      fail(Buffer.byteLength(JSON.stringify({ ...book, edits, scoreSources, migration })) <= 800000, 413, 'Sổ điểm quá lớn để giữ bản đối chiếu. Chưa chuyển dữ liệu.');
      tx.set(target, { ...book, edits, scoreSources, schemaVersion: 2, migration }); return { edits, dryRun: false };
    });
  }
  async function progress(actor, { subject, lesson, tickId }) {
    documentId(tickId); fail(SUBJECTS.includes(subject) && /^\d{1,2}$/.test(String(lesson)) && Number(lesson) >= 1 && Number(lesson) <= TOTAL_LESSONS, 400, 'Môn hoặc bài học không hợp lệ.');
    const id = hash(`${actor.studentId}:${actor.schoolYear}:${subject}:${lesson}`);
    return store.runTransaction(async tx => {
      const profile = (await tx.get(ref('students', actor.studentId))).data();
      const settings = (await tx.get(settingsRef)).data() || {}; activeStudent(actor, profile, settings);
      const target = ref('lesson_progress', id), previous = (await tx.get(target)).data() || {};
      if (previous.tickId === tickId) return { id, replayed: true };
      const elapsed = previous.updatedAt ? Math.max(0, Math.min(30000, now() - previous.updatedAt)) : 30000;
      tx.set(target, { ...previous, elapsedMs: Number(previous.elapsedMs || 0) + elapsed, tickId, schoolYear: actor.schoolYear, schoolCode: actor.schoolCode,
        grade: actor.grade, subject, lesson: String(lesson), studentId: actor.studentId, studentAccessCode: profile.accessCode, studentName: profile.fullName || '', authorId: actor.uid, updatedAt: now() });
      return { id };
    });
  }
  async function submitEssay(actor, { submission, requestId }) {
    documentId(requestId); fail(submission && submission.quizId, 400, 'Thiếu bài kiểm tra.');
    fail(actor.role === 'student', 403, 'Chỉ học sinh được nộp bài.');
    let verifiedFile = null;
    if (submission.exitReason !== 'student_left_page') {
      fail(typeof verifySubmissionFile === 'function', 503, 'Máy chủ chưa cấu hình xác nhận tệp bài nộp.');
      verifiedFile = await verifySubmissionFile(actor, submission);
      fail(verifiedFile?.fileId === submission.fileId, 403, 'Tệp bài nộp không thuộc học sinh.');
    }
    const target = ref('handwritten_submissions', hash(`${actor.studentId}:${submission.quizId}:${requestId}`));
    return store.runTransaction(async tx => {
      const profile = (await tx.get(ref('students', actor.studentId))).data();
      const settings = (await tx.get(settingsRef)).data() || {}; activeStudent(actor, profile, settings);
      const head = (await tx.get(store.doc(`artifacts/${appId}/server_quizzes/${documentId(submission.quizId)}`))).data();
      fail(head && head.deliveryMode === 'manual' && head.schoolCode === actor.schoolCode && head.grade === actor.grade && head.schoolYear === actor.schoolYear
        && (head.isPublished || head.publishAt > 0 && head.publishAt <= now()), 403, 'Đề chưa phát hoặc không thuộc lớp của em.');
      const previous = (await tx.get(target)).data(); if (previous) return { id: target.id, replayed: true };
      const slotRef = store.doc(`artifacts/${appId}/server_essay_slots/${hash(`${actor.studentId}:${submission.quizId}`)}`);
      const slot = (await tx.get(slotRef)).data();
      fail(!slot || slot.version !== head.serverVersion, 409, 'Em đã nộp hoặc bị khóa bài này. Báo giáo viên mở lại.');
      const exited = submission.exitReason === 'student_left_page';
      fail(exited || typeof submission.fileId === 'string' && /^[\w-]{10,200}$/.test(submission.fileId), 400, 'Thiếu tệp bài nộp hợp lệ.');
      const fileFields = Object.fromEntries(['fileId', 'fileName', 'fileUrl', 'mimeType'].map(key => [key, String(verifiedFile?.[key] || '').slice(0, 2000)]));
      tx.set(target, { ...fileFields, quizId: submission.quizId, schoolYear: actor.schoolYear, schoolCode: actor.schoolCode, grade: actor.grade,
        subject: head.subject, lesson: head.lesson, serverVersion: head.serverVersion, scoreTarget: head.scoreTarget || null,
        studentId: actor.studentId, studentKey: profile.studentKey || profile.accessCode, studentAccessCode: profile.accessCode, studentName: profile.fullName || '',
        fileSize: Math.max(0, Math.min(Number(verifiedFile?.fileSize) || 0, 30 * 1024 * 1024)), status: exited ? 'left_page' : 'queued', aiStatus: exited ? 'left_page' : 'queued',
        exitReason: exited ? 'student_left_page' : '', submittedAt: now(), submittedBy: actor.uid });
      tx.set(slotRef, { id: target.id, version: head.serverVersion });
      return { id: target.id };
    });
  }
  async function reviewEssay(actor, { id, expected, context, review, scorebook }) {
    teacherScope(actor, context);
    const score = Number(String(review?.teacherScore).replace(',', '.')), maximum = Number(String(review?.teacherMaxScore).replace(',', '.'));
    fail(hasValue(review?.teacherScore) && hasValue(review?.teacherMaxScore) && Number.isFinite(score) && Number.isFinite(maximum) && maximum > 0 && maximum <= 1000 && score >= 0 && score <= maximum, 400, 'Điểm chấm không hợp lệ.');
    return store.runTransaction(async tx => {
      const target = ref('handwritten_submissions', id), data = (await tx.get(target)).data();
      const settings = (await tx.get(settingsRef)).data() || {}; writable(settings, context.schoolYear);
      fail(data && sameData(data, expected), 409, 'Bài nộp vừa thay đổi. Giữ bản nháp để đối chiếu.'); teacherScope(actor, data);
      fail(['schoolYear', 'schoolCode', 'grade', 'subject', 'lesson'].every(key => data[key] === context[key]), 403, 'Bài nộp không thuộc phạm vi.');
      let status = 'noTarget';
      if (scorebook) {
        fail(scorebook.key === configuredScoreKey(data), 403, 'Cột điểm không khớp cấu hình của bài.');
        const policy = scoreCell(actor, scorebook.metadata, scorebook.key);
        fail(scorebook.documentId === `${scorebook.metadata.schoolYear}_${scorebook.metadata.sourceFile}_${scorebook.metadata.schoolCode}_khoi_${scorebook.metadata.grade}`.replace(/[^\w-]+/g, '_'), 400, 'Mã sổ điểm không khớp phạm vi.');
        fail(policy?.numeric && policy.subject === data.subject && [data.studentKey, data.studentAccessCode].includes(policy.studentKey), 403, 'Ô điểm không thuộc bài nộp.');
        const bookRef = ref('scorebooks', scorebook.documentId), book = (await tx.get(bookRef)).data() || {};
        fail(['schoolYear', 'schoolCode', 'grade'].every(key => data[key] === scorebook.metadata[key] && (!book[key] || book[key] === data[key])), 403, 'Sổ điểm khác phạm vi.');
        fail(!hasLegacyRowEdits(book.edits) && !hasLegacyRowEdits(book.scoreSources), 409, 'Đối chiếu điểm cũ trước khi đồng bộ.');
        const previous = book.scoreSources?.[scorebook.key];
        status = (!hasValue(book.edits?.[scorebook.key]) && !previous || previous?.source === 'quiz' && previous.quizId === data.quizId) ? 'written' : 'existing';
        if (status === 'written') {
          const next = { ...scorebook.metadata, schemaVersion: 2, updatedAt: now(), edits: { [scorebook.key]: scoreValue(score / maximum * 10) },
            scoreSources: { [scorebook.key]: { source: 'quiz', quizId: data.quizId, attemptId: id, attemptKind: 'handwritten_submissions', updatedAt: now() } } };
          tx.set(bookRef, next, { mergeFields: ['schoolYear', 'schoolCode', 'grade', 'sourceFile', 'schemaVersion', 'updatedAt', new FieldPath('edits', scorebook.key), new FieldPath('scoreSources', scorebook.key)] });
          writeScoreAudit(tx, { store, appId, actor, bookId: scorebook.documentId, scope: scorebook.metadata, before: book, after: { edits: { ...book.edits, ...next.edits }, scoreSources: { ...book.scoreSources, ...next.scoreSources } }, keys: [scorebook.key], createdAt: now(), reason: 'teacher-review' });
        }
      }
      tx.set(target, { teacherScore: score, teacherMaxScore: maximum, teacherComment: String(review.teacherComment || '').slice(0, 10000), status: 'teacher_reviewed', reviewedAt: now(), reviewedBy: actor.uid, scoreSync: { status } },
        { mergeFields: ['teacherScore', 'teacherMaxScore', 'teacherComment', 'status', 'reviewedAt', 'reviewedBy', 'scoreSync'] });
      return { status };
    });
  }
  async function aiDraft(actor, { id, fileId, runId, patch }) {
    fail(['admin', 'teacher'].includes(actor.role), 403, 'Chỉ giáo viên được yêu cầu chấm bản nháp.');
    fail(patch && Object.keys(patch).every(key => ['aiStatus', 'aiStartedAt', 'aiScore', 'aiMaxScore', 'aiComment', 'aiFeedback', 'aiError', 'aiFailedAt', 'status', 'aiGradedAt', 'aiReviewedAt', 'aiModel'].includes(key)), 400, 'Trường chấm AI không hợp lệ.');
    const nextRun = runId || hash(`${id}:${actor.uid}:${now()}`);
    return store.runTransaction(async tx => {
      const target = ref('handwritten_submissions', id), data = (await tx.get(target)).data();
      const settings = (await tx.get(settingsRef)).data() || {}; fail(data, 404, 'Bài nộp đã bị xóa.'); teacherScope(actor, data); writable(settings, data.schoolYear);
      fail(data.fileId === fileId && (!runId || data.aiRunId === runId), 409, 'Tệp hoặc lượt chấm vừa thay đổi.');
      fail(runId || data.aiStatus !== 'grading' || now() - data.aiStartedAt > 300000, 409, 'Bài đang được chấm.');
      const fields = { ...patch, aiRunId: nextRun }; if (data.status === 'teacher_reviewed') delete fields.status;
      tx.set(target, fields, { mergeFields: Object.keys(fields) }); return { runId: nextRun };
    });
  }
  async function resetEssays(actor, { attempts, context }) {
    teacherScope(actor, context); fail(Array.isArray(attempts) && attempts.length > 0 && attempts.length <= 100 && attempts.every(item => item.kind === 'handwritten_submissions'), 400, 'Chỉ mở lại từ 1 đến 100 bài tự luận.');
    fail(new Set(attempts.map(item => item.id)).size === attempts.length, 400, 'Danh sách bài bị lặp.');
    return store.runTransaction(async tx => {
      const settings = (await tx.get(settingsRef)).data() || {}; writable(settings, context.schoolYear);
      const rows = [], books = new Map(), beforeBooks = new Map();
      for (const item of attempts) {
        const target = ref('handwritten_submissions', item.id), data = (await tx.get(target)).data();
        fail(data && sameData(data, item.expected), 409, 'Bài nộp vừa thay đổi.'); teacherScope(actor, data);
        fail(['schoolYear', 'schoolCode', 'grade', 'subject', 'lesson'].every(key => data[key] === context[key]), 403, 'Bài khác phạm vi.');
        const slot = store.doc(`artifacts/${appId}/server_essay_slots/${hash(`${data.studentId}:${data.quizId}`)}`);
        const current = (await tx.get(slot)).data();
        let bookId, key;
        if (data.scoreTarget) {
          bookId = `${data.schoolYear}_${SCOREBOOK_SOURCE_FILE}_${data.schoolCode}_khoi_${data.grade}`.replace(/[^\w-]+/g, '_');
          key = configuredScoreKey(data);
          if (!books.has(bookId)) books.set(bookId, (await tx.get(ref('scorebooks', bookId))).data() || {});
          const book = books.get(bookId);
          if (!beforeBooks.has(bookId)) beforeBooks.set(bookId, { ...book });
          fail(['schoolYear', 'schoolCode', 'grade'].every(field => !book[field] || book[field] === data[field]) && (!book.sourceFile || book.sourceFile === SCOREBOOK_SOURCE_FILE), 409, 'Sổ điểm đã đổi phạm vi.');
        }
        rows.push({ id: item.id, quizId: data.quizId, target, slot: current?.id === item.id ? slot : null, bookId, key });
      }
      let cleared = 0, preserved = 0;
      const changes = new Set();
      for (const item of rows) if (item.bookId) {
        const book = books.get(item.bookId), source = book.scoreSources?.[item.key];
        if (!hasValue(book.edits?.[item.key]) && !source) continue;
        if (source?.source === 'quiz' && source.attemptId === item.id && source.attemptKind === 'handwritten_submissions' && source.quizId === item.quizId) {
          book.edits = { ...book.edits }; book.scoreSources = { ...book.scoreSources };
          delete book.edits[item.key]; delete book.scoreSources[item.key]; cleared++; changes.add(item.bookId);
        } else preserved++;
      }
      rows.forEach(item => { tx.delete(item.target); if (item.slot) tx.delete(item.slot); });
      for (const id of changes) {
        const next = books.get(id); tx.set(ref('scorebooks', id), { ...next, updatedAt: now() });
        writeScoreAudit(tx, { store, appId, actor, bookId: id, scope: context, before: beforeBooks.get(id), after: next,
          keys: rows.filter(item => item.bookId === id && beforeBooks.get(id).scoreSources?.[item.key]?.attemptId === item.id && !next.scoreSources?.[item.key]).map(item => item.key), createdAt: now(), reason: 'essay-reset' });
      }
      return { deleted: rows.length, cleared, preserved };
    });
  }
  async function workspaceConfig(actor) {
    fail(actor.role === 'student', 403, 'Chỉ dùng cho học sinh.');
    const data = (await settingsRef.get()).data() || {};
    return { schoolYear: data.schoolYear, inputYearLocks: data.inputYearLocks || {} };
  }
  async function classOps(actor) {
    const settings = (await settingsRef.get()).data() || {}, profile = (await ref('students', actor.studentId).get()).data();
    activeStudent(actor, profile, settings); fail(profile.isClassLeader === true, 403, 'Chỉ lớp trưởng được dùng điểm danh lớp.');
    const roster = await store.collection(`${root}/students`).where('schoolCode', '==', actor.schoolCode).where('schoolYear', '==', actor.schoolYear).where('className', '==', profile.className).limit(151).get();
    fail(roster.docs.length < 151, 413, 'Lớp có quá nhiều hồ sơ cần đối soát.');
    const attendance = await store.collection(`${root}/class_attendance`).where('schoolCode', '==', actor.schoolCode).where('schoolYear', '==', actor.schoolYear).where('className', '==', profile.className).limit(400).get();
    const timetable = (await ref('class_timetables', `${actor.schoolYear}_${actor.schoolCode}`).get()).data();
    const students = roster.docs.map(item => ({ id: item.id, ...Object.fromEntries(['fullName', 'className', 'schoolYear', 'schoolCode', 'grade', 'status'].map(key => [key, item.data()[key] || ''])) }));
    return { students, attendance: attendance.docs.map(item => ({ ...item.data(), id: item.id })), timetable: { classOrder: [profile.className], slots: { [profile.className]: timetable?.slots?.[profile.className] || {} } } };
  }
  async function saveAttendance(actor, { documentId: id, student, status, expectedEntry, schoolYear, schoolCode, className, date }) {
    fail(['', 'CP', 'KP'].includes(status) && /^\d{4}-\d{2}-\d{2}$/.test(date) && id === `${schoolYear}_${date}_K${className}`, 400, 'Ngày, mã điểm danh hoặc trạng thái không hợp lệ.');
    const parsed = new Date(date + 'T00:00:00Z'); fail(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date, 400, 'Ngày điểm danh không tồn tại.');
    return store.runTransaction(async tx => {
      const settings = (await tx.get(settingsRef)).data() || {}; writable(settings, schoolYear);
      const profile = (await tx.get(ref('students', student.id))).data();
      fail(profile && profile.schoolYear === schoolYear && profile.schoolCode === schoolCode && profile.className === className, 403, 'Học sinh không thuộc lớp điểm danh.');
      if (actor.role === 'student') {
        const leader = (await tx.get(ref('students', actor.studentId))).data(); activeStudent(actor, leader, settings);
        fail(leader.isClassLeader && leader.className === className && actor.schoolCode === schoolCode && actor.schoolYear === schoolYear, 403, 'Không có quyền điểm danh lớp này.');
      } else fail(actor.role === 'admin' || actor.role === 'teacher' && actor.schoolCode === schoolCode && actor.grades?.map(String).includes(String(className).match(/^\d+/)?.[0]), 403, 'Chưa được phân công khối/lớp này.');
      const target = ref('class_attendance', id), previous = (await tx.get(target)).data() || {};
      fail(['schoolYear', 'schoolCode', 'className', 'date'].every(key => !previous[key] || previous[key] === ({schoolYear, schoolCode, className, date})[key]), 409, 'Điểm danh đổi phạm vi.');
      fail(sameData(previous.records?.[student.id], expectedEntry), 409, 'Trạng thái vừa được người khác sửa.');
      const entry = { studentId: student.id, studentName: profile.fullName || '', status, updatedAt: now() };
      tx.set(target, { schoolYear, schoolCode, className, date, grade: String(className).match(/^\d+/)?.[0], records: { [student.id]: entry }, updatedAt: now(), updatedBy: actor.uid },
        { mergeFields: ['schoolYear', 'schoolCode', 'className', 'date', 'grade', 'updatedAt', 'updatedBy', new FieldPath('records', student.id)] }); return entry;
    });
  }
  return { saveScores, syncScore, migrateScores, profileRequest, progress, submitEssay, reviewEssay, aiDraft, resetEssays, workspaceConfig, classOps, saveAttendance };
}
