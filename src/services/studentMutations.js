import { collection, doc, getDocFromServer, getDocsFromServer, limit, query, runTransaction, where } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { sameData } from '../utils/dataEquality';
import { processRecords } from '../utils/bulkOperations';

const records = name => collection(db, 'artifacts', appId, 'public', 'data', name);
const ref = (name, id) => doc(records(name), id);
const plain = data => Object.fromEntries(Object.entries(data).filter(([key, value]) => !['id', 'sheetSync', 'syncRevision'].includes(key) && value !== undefined));
const ownsCode = (owner, studentKey, id, sourceId) => owner?.studentKey === studentKey || (!owner?.studentKey && [id, sourceId].includes(owner?.studentId));

// Freeze the legacy score identity before changing a login code. Never derive it from the new code.
export async function saveStudentRecord(input, { codePrefix, allocateCode = false, actor = '', expected, id: targetId, registration, createOnly = false, profileDecision } = {}) {
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
      if (sourceId && (!source || sourceId === target.id || String(source.schoolYear || '') >= String(input.schoolYear || '') || source.schoolCode !== input.schoolCode)) throw new Error('Hồ sơ năm trước không hợp lệ hoặc khác cơ sở. Đối soát trước khi nối định danh.');
      const requestRef = profileDecision ? ref('student_profile_requests', profileDecision.requestId) : null;
      const request = requestRef ? (await transaction.get(requestRef)).data() : null;
      if (requestRef && (!request || request.studentId !== target.id || !sameData(request.changes, profileDecision.expectedChanges))) throw new Error('Yêu cầu hồ sơ vừa thay đổi. Tải lại trước khi duyệt.');
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
      const data = { ...(current || {}), ...plain(input), studentKey, accessCode: candidate,
        createdAt: current?.createdAt || Date.now(), updatedAt: Date.now(), updatedBy: actor,
        syncRevision: Number(current?.syncRevision || 0) + 1, sheetSync: { status: 'pending', jobId: `${target.id}--${mutationId}`, updatedAt: Date.now() } };
      if (!data.fullName || !data.className || !data.schoolYear) throw new Error('Hồ sơ thiếu họ tên, lớp hoặc năm học.');
      transaction.set(codeRef, { studentKey, studentId: target.id, studentIds: [...new Set([...(owner?.studentIds || (owner?.studentId ? [owner.studentId] : [])), target.id])], updatedAt: Date.now() });
      // Retain aliases, so old work and a historical-year login code never belong to another child.
      if (oldRef && (!oldOwner || ownsCode(oldOwner, studentKey, target.id, sourceId))) transaction.set(oldRef, { ...(oldOwner || {}), studentKey, studentId: oldOwner?.studentId || target.id, retired: true, updatedAt: Date.now() });
      if (counterRef && candidate.startsWith(prefix)) transaction.set(counterRef, { next: Math.max(Number(counter?.next || 1), Number(candidate.slice(prefix.length)) + 1) });
      transaction.set(target, data);
      if (requestRef) {
        if (Object.keys(profileDecision.remainingChanges || {}).length) transaction.set(requestRef, { changes: profileDecision.remainingChanges, updatedAt: Date.now() }, { merge: true });
        else transaction.delete(requestRef);
      }
      transaction.set(ref('student_sync_jobs', data.sheetSync.jobId), { studentId: target.id, studentKey, revision: data.syncRevision,
        status: 'pending', createdAt: Date.now(), actor, registration: registration || null });
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
    return { ...current, student: { ...student, id: studentId } };
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
    transaction.set(jobRef, state, { merge: true });
    if (student?.syncRevision === job.revision && student?.sheetSync?.jobId === jobRef.id) transaction.set(target, { sheetSync: { ...state, jobId: jobRef.id } }, { merge: true });
  });
  if (failure) throw failure;
}

export async function retryPendingStudentSync(students, send, onProgress, options) {
  return processRecords(students.filter(student => ['pending', 'failed', 'running'].includes(student.sheetSync?.status)), student => retryStudentSync(student.id, send, options), onProgress);
}
