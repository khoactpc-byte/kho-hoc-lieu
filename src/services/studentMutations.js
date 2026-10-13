import { collection, doc, getDocFromServer, getDocsFromServer, limit, query, runTransaction, where } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { sameData } from '../utils/dataEquality';
import { processRecords } from '../utils/bulkOperations';
import { assertStudentSchoolYear, getSchoolYearStart } from '../utils/schoolYearText';
import { buildStudentYearReconciliation } from '../utils/studentYearReconciliation';
import { getStudentEntryGrade, normalizeSchoolYearKey } from '../utils/schoolClasses';

const records = name => collection(db, 'artifacts', appId, 'public', 'data', name);
const ref = (name, id) => doc(records(name), id);
const plain = data => Object.fromEntries(Object.entries(data).filter(([key, value]) => !['id', 'sheetSync', 'syncRevision'].includes(key) && value !== undefined));
const ownsCode = (owner, studentKey, id, sourceId) => owner?.studentKey === studentKey || (!owner?.studentKey && [id, sourceId].includes(owner?.studentId));

// Freeze the legacy score identity before changing a login code. Never derive it from the new code.
export async function saveStudentRecord(input, { codePrefix, allocateCode = false, actor = '', expected, id: targetId, registration, createOnly = false, profileDecision, profileDecisions = [], academicDecision, reactivateDropout = false, collapseToPreviousYear = false, collapseSourceExpected } = {}) {
  assertStudentSchoolYear(input);
  const decisions = [...profileDecisions, ...(profileDecision ? [profileDecision] : [])];
  if (decisions.length > 400 || decisions.some(item => !item?.requestId) || new Set(decisions.map(item => item.requestId)).size !== decisions.length) throw new Error('Danh sách yêu cầu duyệt không hợp lệ.');
  const target = targetId ? ref('students', targetId) : input.id ? ref('students', input.id) : doc(records('students'));
  const mutationId = globalThis.crypto.randomUUID();
  const initial = (await getDocFromServer(target)).data();
  const prefix = String(codePrefix || '').toUpperCase();
  if ((allocateCode || !input.accessCode && !initial?.accessCode) && !/^HS\d{3,12}$/.test(prefix)) throw new Error('Thiếu tiền tố hợp lệ để cấp mã học sinh.');
  let candidate = String(input.accessCode || initial?.accessCode || '').trim().toUpperCase();
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (allocateCode || !candidate) {
      const counter = (await getDocFromServer(ref('student_code_counters', prefix))).data();
      const next = counter?.next ?? 1;
      if (!Number.isSafeInteger(next) || next < 1) throw new Error('Bộ cấp mã cần đối soát. Chưa sửa hồ sơ.');
      candidate = `${prefix}${String(next + attempt).padStart(2, '0')}`;
    }
    if (!/^HS\d{3,15}$/.test(candidate)) throw new Error('Mã học sinh không hợp lệ.');
    // Seed protection for legacy records lacking a registry. All new writers also reserve transactionally.
    const duplicates = (await getDocsFromServer(query(records('students'), where('accessCode', '==', candidate), limit(32)))).docs;
    const result = await runTransaction(db, async transaction => {
      const current = (await transaction.get(target)).data();
      const settings = (await transaction.get(ref('settings', 'global'))).data() || {};
      if (settings.maintenance?.active) throw new Error('Hệ thống đang bảo trì/phục hồi. Chưa sửa hồ sơ.');
      if (!sameData(current, initial) || expected !== undefined && Object.entries(plain(expected)).some(([key, value]) => !sameData(current?.[key], value))) throw new Error('Hồ sơ vừa thay đổi. Tải lại để đối soát trước khi lưu.');
      if (createOnly && current) {
        if (current.schoolYear !== input.schoolYear || input.registrationId && current.registrationId !== input.registrationId
          || input.previousStudentId && current.previousStudentId !== input.previousStudentId) throw new Error('Mã hồ sơ đích đã có dữ liệu khác. Đối soát trước khi nhập lại.');
        return { ...current, id: target.id };
      }
      if (allocateCode && current?.accessCode === candidate) return null;
      const sourceId = input.previousStudentId || '';
      const source = sourceId ? (await transaction.get(ref('students', sourceId))).data() : null;
      const collapseLinkedYear = Boolean(collapseToPreviousYear && current && sourceId && source
        && sourceId !== target.id
        && getSchoolYearStart(current.schoolYear) > 0
        && getSchoolYearStart(source.schoolYear) > 0
        && getSchoolYearStart(current.schoolYear) > getSchoolYearStart(source.schoolYear)
        && getSchoolYearStart(input.schoolYear) === getSchoolYearStart(source.schoolYear));
      if (collapseLinkedYear) {
        if (source.schoolCode !== input.schoolCode || source.schoolCode !== current.schoolCode) throw new Error('Hồ sơ hai năm khác cơ sở. Chưa gộp dữ liệu.');
        if (input.status !== 'dropped') throw new Error('Chỉ tự gộp hồ sơ lên nhầm năm khi học sinh được xác nhận Bỏ học ở năm nguồn.');
        if (collapseSourceExpected && !sameData(plain(source), plain(collapseSourceExpected))) throw new Error('Hồ sơ năm nguồn vừa thay đổi. Tải lại hồ sơ trước khi sửa năm.');
        const sourceIdentity = source.studentKey || source.accessCode || '';
        const currentIdentity = current.studentKey || current.accessCode || '';
        if (!sourceIdentity || !currentIdentity || sourceIdentity !== currentIdentity) throw new Error('Hai hồ sơ chưa đủ căn cứ cùng định danh để tự gộp. Cần đối soát mã học sinh.');
        const sourceCode = String(source.accessCode || '').trim().toUpperCase();
        const currentCode = String(current.accessCode || '').trim().toUpperCase();
        if (sourceCode && currentCode && sourceCode !== currentCode) throw new Error('Hai hồ sơ đang dùng mã học sinh khác nhau. Cần đối soát trước khi gộp.');
        const mergedCode = currentCode || sourceCode;
        if (!/^HS\d{3,15}$/.test(mergedCode)) throw new Error('Mã học sinh của hồ sơ cần gộp không hợp lệ.');
        const codeRef = ref('student_code_registry', mergedCode);
        const owner = (await transaction.get(codeRef)).data();
        if (owner && !ownsCode(owner, sourceIdentity, sourceId, target.id)) throw new Error('Mã học sinh đang thuộc hồ sơ khác. Chưa gộp dữ liệu.');
        const mutationId = globalThis.crypto.randomUUID();
        const sourceClass = source.className || source.dropoutPreviousClassName || input.dropoutPreviousClassName || '';
        const classHistory = { ...(source.classHistory || {}), ...(input.classHistory || {}) };
        const sourceYear = normalizeSchoolYearKey(source.schoolYear);
        Object.keys(classHistory).forEach(year => { if (normalizeSchoolYearKey(year) === sourceYear) delete classHistory[year]; });
        const data = {
          ...source,
          ...plain(input),
          schoolYear: source.schoolYear,
          previousStudentId: source.previousStudentId || '',
          studentKey: sourceIdentity,
          accessCode: mergedCode,
          status: 'dropped',
          className: '',
          grade: '',
          classHistory,
          dropoutPreviousClassName: input.dropoutPreviousClassName || sourceClass,
          dropoutYear: source.schoolYear,
          createdAt: source.createdAt || current.createdAt || Date.now(),
          updatedAt: Date.now(),
          updatedBy: actor,
          syncRevision: Number(source.syncRevision || 0) + 1,
          sheetSync: { status: 'pending', jobId: `${sourceId}--${mutationId}`, updatedAt: Date.now(),
            repairSchoolYearFrom: current.schoolYear, repairStudentRecordId: target.id }
        };
        assertStudentSchoolYear(data);
        if (!data.fullName || !data.schoolYear) throw new Error('Hồ sơ sau khi gộp thiếu họ tên hoặc năm học.');
        transaction.set(ref('student_archives', target.id), { ...current, archivedAt: Date.now(), archivedBy: actor, archiveReason: 'collapsed_wrong_school_year', mergedIntoStudentId: sourceId });
        if (current.sheetSync?.jobId) transaction.set(ref('student_sync_jobs', current.sheetSync.jobId), { status: 'cancelled', updatedAt: Date.now(), message: `Đã gộp vào hồ sơ ${sourceId}.` }, { merge: true });
        transaction.set(codeRef, { ...(owner || {}), studentKey: sourceIdentity, studentId: sourceId,
          studentIds: [...new Set([...(owner?.studentIds || []), sourceId])].filter(id => id !== target.id), updatedAt: Date.now() });
        transaction.set(ref('students', sourceId), data);
        transaction.set(ref('student_sync_jobs', data.sheetSync.jobId), { studentId: sourceId, studentKey: sourceIdentity, revision: data.syncRevision,
          status: 'pending', createdAt: Date.now(), actor, registration: registration || null,
          repairSchoolYearFrom: current.schoolYear, repairStudentRecordId: target.id });
        transaction.delete(target);
        return { ...data, id: sourceId, collapsedStudentId: target.id };
      }
      if (sourceId && (!source || sourceId === target.id || String(source.schoolYear || '') >= String(input.schoolYear || '') || source.schoolCode !== input.schoolCode)) throw new Error('Hồ sơ năm trước không hợp lệ hoặc khác cơ sở. Đối soát trước khi nối định danh.');
      if (sourceId && getSchoolYearStart(input.enrollmentYear) && getSchoolYearStart(source.schoolYear) < getSchoolYearStart(input.enrollmentYear)) {
        throw new Error('Hồ sơ được nối nằm trước năm nhập học. Cần sửa năm hồ sơ web, không tạo lịch sử học trước khi nhập học.');
      }
      if (!current && source?.status === 'dropped') throw new Error('Học sinh đã bỏ học; không tự tạo hồ sơ nâng lớp. Cần đưa học sinh trở lại học trước.');
      if (current?.status === 'dropped' && input.status !== 'dropped' && !reactivateDropout) throw new Error('Học sinh đang bỏ học. Chỉ thao tác Đưa học lại mới được mở lại hồ sơ.');
      if (academicDecision) {
        const expectedSource = academicDecision.source;
        const expectedBook = academicDecision.scorebook;
        if (!expectedSource?.id || !expectedBook?.id) throw new Error('Thiếu hồ sơ/sổ điểm năm trước để xét lớp.');
        const academicSource = (await transaction.get(ref('students', expectedSource.id))).data();
        const academicBook = (await transaction.get(ref('scorebooks', expectedBook.id))).data();
        if (!sameData(plain(academicSource || {}), plain(expectedSource)) || !sameData(plain(academicBook || {}), plain(expectedBook))) {
          throw new Error('Hồ sơ hoặc điểm năm trước vừa thay đổi. Mở lại bảng đối chiếu để xét lớp.');
        }
        const decision = buildStudentYearReconciliation({ records: [{ ...current, id: target.id }, { ...academicSource, id: expectedSource.id }],
          scorebooks: [{ ...academicBook, id: expectedBook.id }], targetSchoolYear: input.schoolYear }).find(item => item.student.id === target.id);
        if (decision?.action !== 'review' || decision.proposedClass !== input.className || decision.outcome !== input.promotion?.outcome) {
          throw new Error('Kết quả cả năm không đủ hoặc không khớp lớp đã duyệt. Chưa sửa hồ sơ.');
        }
      }
      const requestDecisions = [];
      for (const decision of decisions) {
        const requestRef = ref('student_profile_requests', decision.requestId);
        const request = (await transaction.get(requestRef)).data();
        if (!request || request.studentId !== target.id || (request.status || 'pending') !== 'pending' || !sameData(request.changes, decision.expectedChanges)) throw new Error('Yêu cầu hồ sơ vừa thay đổi. Tải lại trước khi duyệt.');
        requestDecisions.push({ requestRef, decision });
      }
      const studentKey = current?.studentKey || current?.accessCode || source?.studentKey || source?.accessCode || `student-${target.id}`;
      if (current?.studentKey && input.studentKey && input.studentKey !== current.studentKey) throw new Error('Không được thay đổi định danh học sinh.');
      if (duplicates.some(item => item.id !== target.id && item.id !== sourceId && (item.data().studentKey || item.data().accessCode) !== studentKey)) return null;
      const codeRef = ref('student_code_registry', candidate);
      const owner = (await transaction.get(codeRef)).data();
      if (owner && !ownsCode(owner, studentKey, target.id, sourceId)) return null;
      const oldCode = current?.accessCode;
      const oldRef = oldCode && oldCode !== candidate ? ref('student_code_registry', oldCode) : null;
      const oldOwner = oldRef ? (await transaction.get(oldRef)).data() : null;
      const counterRef = prefix ? ref('student_code_counters', prefix) : null;
      const counter = counterRef ? (await transaction.get(counterRef)).data() : null;
      if (counter && (!Number.isSafeInteger(counter.next) || counter.next < 1)) throw new Error('Bộ cấp mã cần đối soát.');
      const retainedRepair = current?.sheetSync?.repairSchoolYearFrom && current?.sheetSync?.repairStudentRecordId
        ? { repairSchoolYearFrom: current.sheetSync.repairSchoolYearFrom, repairStudentRecordId: current.sheetSync.repairStudentRecordId } : {};
      const data = { ...(current || {}), ...plain(input), studentKey, accessCode: candidate,
        createdAt: current?.createdAt || Date.now(), updatedAt: Date.now(), updatedBy: actor,
        syncRevision: Number(current?.syncRevision || 0) + 1, sheetSync: { status: 'pending', jobId: `${target.id}--${mutationId}`, updatedAt: Date.now(), ...retainedRepair } };
      if (data.status === 'dropped') {
        const classHistory = { ...(data.classHistory || {}) };
        const currentYear = normalizeSchoolYearKey(data.schoolYear);
        const previousClass = data.dropoutPreviousClassName || data.className || Object.entries(classHistory)
          .find(([year]) => normalizeSchoolYearKey(year) === currentYear)?.[1] || '';
        data.entryGrade = getStudentEntryGrade(data);
        data.dropoutPreviousClassName = typeof previousClass === 'string' ? previousClass : previousClass.className || '';
        data.dropoutYear ||= data.schoolYear;
        Object.keys(classHistory).forEach(year => { if (normalizeSchoolYearKey(year) === currentYear) delete classHistory[year]; });
        Object.assign(data, { className: '', grade: '', classHistory, dropoutReactivationRevision: 0 });
      } else if (reactivateDropout) {
        if (current?.status !== 'dropped' || data.status !== 'active' || !data.className) throw new Error('Thiếu lớp học lại hợp lệ.');
        Object.assign(data, { dropoutYear: '', dropoutReactivationRevision: data.syncRevision });
      }
      assertStudentSchoolYear(data);
      if (!data.fullName || (!data.className && data.status !== 'dropped') || !data.schoolYear) throw new Error('Hồ sơ thiếu họ tên, lớp hoặc năm học.');
      transaction.set(codeRef, { studentKey, studentId: target.id, studentIds: [...new Set([...(owner?.studentIds || (owner?.studentId ? [owner.studentId] : [])), target.id])], updatedAt: Date.now() });
      // Retain aliases, so old work and a historical-year login code never belong to another child.
      if (oldRef && (!oldOwner || ownsCode(oldOwner, studentKey, target.id, sourceId))) transaction.set(oldRef, { ...(oldOwner || {}), studentKey, studentId: oldOwner?.studentId || target.id, retired: true, updatedAt: Date.now() });
      if (counterRef && candidate.startsWith(prefix)) transaction.set(counterRef, { next: Math.max(Number(counter?.next || 1), Number(candidate.slice(prefix.length)) + 1) });
      transaction.set(target, data);
      for (const { requestRef, decision } of requestDecisions) {
        if (Object.keys(decision.remainingChanges || {}).length) transaction.set(requestRef, { changes: decision.remainingChanges, updatedAt: Date.now() }, { merge: true });
        else transaction.delete(requestRef);
      }
      transaction.set(ref('student_sync_jobs', data.sheetSync.jobId), { studentId: target.id, studentKey, revision: data.syncRevision,
        status: 'pending', createdAt: Date.now(), actor, registration: registration || null, ...retainedRepair });
      return { ...data, id: target.id };
    });
    if (result) return result;
    if (!allocateCode) throw new Error('Mã đã thuộc học sinh khác. Chọn mã mới hoặc cấp mã tự động.');
  }
  throw new Error('Chưa dành được mã mới. Tải lại danh sách và thử tiếp.');
}

export async function deleteStudentRecord(student, actor = '') {
  return runTransaction(db, async transaction => {
    const target = ref('students', student.id);
    const current = (await transaction.get(target)).data();
    const settings = (await transaction.get(ref('settings', 'global'))).data() || {};
    if (settings.maintenance?.active) throw new Error('Hệ thống đang bảo trì/phục hồi. Chưa xóa hồ sơ.');
    if (!current) return { replayed: true };
    if (Object.entries(plain(student)).some(([key, value]) => !sameData(current[key], value))) throw new Error('Hồ sơ vừa thay đổi. Tải lại trước khi xóa.');
    transaction.set(ref('student_archives', student.id), { ...current, archivedAt: Date.now(), archivedBy: actor });
    if (current.sheetSync?.jobId) transaction.set(ref('student_sync_jobs', current.sheetSync.jobId), { status: 'cancelled', updatedAt: Date.now() }, { merge: true });
    transaction.delete(target);
    return { archived: true };
  });
}

export async function retryStudentSync(studentId, send, { registrationComplete } = {}) {
  const target = ref('students', studentId);
  const initial = (await getDocFromServer(target)).data();
  if (!initial?.sheetSync?.jobId) throw new Error('Chưa có lượt đồng bộ bền vững cho hồ sơ này.');
  const jobRef = ref('student_sync_jobs', initial.sheetSync.jobId);
  const workerId = globalThis.crypto.randomUUID();
  const job = await runTransaction(db, async transaction => {
    const student = (await transaction.get(target)).data();
    const current = (await transaction.get(jobRef)).data();
    const settings = (await transaction.get(ref('settings', 'global'))).data();
    if (settings?.maintenance?.active) throw new Error('Hệ thống đang sao lưu hoặc phục hồi. Chưa chạy đồng bộ.');
    if (!current || current.status === 'success') return null;
    if (student?.syncRevision !== current.revision || student?.sheetSync?.jobId !== jobRef.id) {
      transaction.set(jobRef, { status: 'superseded', updatedAt: Date.now() }, { merge: true }); return null;
    }
    if (current.leaseUntil > Date.now()) throw new Error('Hồ sơ đang đồng bộ ở một phiên khác. Thử lại sau.');
    transaction.set(jobRef, { status: 'running', workerId, leaseUntil: Date.now() + 60000 }, { merge: true });
    return { ...current, student: { ...student, id: studentId,
      sheetSync: { ...(student.sheetSync || {}),
        ...(current.repairSchoolYearFrom ? { repairSchoolYearFrom: current.repairSchoolYearFrom } : {}),
        ...(current.repairStudentRecordId ? { repairStudentRecordId: current.repairStudentRecordId } : {}) } } };
  });
  if (!job) return;
  let failure;
  try { await send(job.student); if (job.registration && registrationComplete) await registrationComplete(job.registration, job.student); }
  catch (error) { failure = error; }
  await runTransaction(db, async transaction => {
    const student = (await transaction.get(target)).data();
    const current = (await transaction.get(jobRef)).data();
    if (current?.workerId !== workerId) return;
    const status = failure ? 'failed' : 'success';
    const state = { status, updatedAt: Date.now(), message: failure?.message || '', leaseUntil: 0 };
    const retainedRepair = failure ? {
      ...(job.repairSchoolYearFrom ? { repairSchoolYearFrom: job.repairSchoolYearFrom } : {}),
      ...(job.repairStudentRecordId ? { repairStudentRecordId: job.repairStudentRecordId } : {})
    } : {};
    transaction.set(jobRef, state, { merge: true });
    if (student?.syncRevision === job.revision && student?.sheetSync?.jobId === jobRef.id) transaction.set(target, { sheetSync: { ...state, jobId: jobRef.id, ...retainedRepair } }, { merge: true });
  });
  if (failure) throw failure;
}

export async function retryPendingStudentSync(students, send, onProgress, options) {
  return processRecords(students.filter(student => ['pending', 'failed', 'running'].includes(student.sheetSync?.status)), student => retryStudentSync(student.id, send, options), onProgress);
}
