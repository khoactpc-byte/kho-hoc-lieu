import { collection, doc, getDocFromServer, getDocsFromServer, runTransaction } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { postAppsScript } from '../utils/helpers';
import { sameData } from '../utils/dataEquality';
import { PROFILE_DOCUMENT_FIELDS, referencedProfileFileIds } from '../utils/profileDocumentFiles';

const records = name => collection(db, 'artifacts', appId, 'public', 'data', name);
const record = (name, id) => doc(records(name), id);

// Jobs are saved atomically with approval, so an interrupted cleanup can be retried.
export async function retryProfileFileCleanup(jobId, syncStudent) {
  const jobRef = record('student_file_cleanup_jobs', jobId);
  const workerId = globalThis.crypto.randomUUID();
  const job = await runTransaction(db, async tx => {
    const current = (await tx.get(jobRef)).data();
    const settings = (await tx.get(record('settings', 'global'))).data();
    if (settings?.maintenance?.active) throw new Error('Hệ thống đang bảo trì. Chưa dọn file.');
    if (!current || current.status === 'done') return null;
    if (current.leaseUntil > Date.now()) throw new Error('File đang được dọn ở một phiên khác.');
    tx.set(jobRef, { status: 'running', workerId, leaseUntil: Date.now() + 180000, updatedAt: Date.now() }, { merge: true });
    return current;
  });
  if (!job) return { alreadyDone: true, results: [] };
  let result, failure;
  try {
    // Keep jobs created by the previous, single-field approval flow retryable.
    const fields = job.fields || [{ fieldKey: job.fieldKey, expectedValue: job.expectedValue, fileIds: job.fileIds }];
    if (!Array.isArray(fields) || !fields.length || fields.length > PROFILE_DOCUMENT_FIELDS.length
      || fields.some(field => !PROFILE_DOCUMENT_FIELDS.includes(field.fieldKey) || !Array.isArray(field.fileIds) || typeof field.expectedValue !== 'string')) {
      throw new Error('Yêu cầu dọn file không hợp lệ. File cũ được giữ lại.');
    }
    const matchesApproval = student => student && student.studentKey === job.studentKey
      && fields.every(field => sameData(student[field.fieldKey], field.expectedValue));
    const studentRef = record('students', job.studentId);
    const before = (await getDocFromServer(studentRef)).data();
    if (!matchesApproval(before)) {
      throw new Error('Ảnh hoặc hồ sơ đã thay đổi. File cũ được giữ để đối chiếu.');
    }
    if (before.sheetSync?.status !== 'success') await syncStudent({ ...before, id: job.studentId });
    const [current, students, requests, archives] = await Promise.all([
      getDocFromServer(studentRef), getDocsFromServer(records('students')),
      getDocsFromServer(records('student_profile_requests')), getDocsFromServer(records('student_archives'))
    ]);
    const student = current.data();
    if (!matchesApproval(student) || student.sheetSync?.status !== 'success') {
      throw new Error('Ảnh mới chưa được lưu và đồng bộ đầy đủ. Chưa dọn file cũ.');
    }
    const referenced = referencedProfileFileIds([
      ...students.docs.map(item => item.data()), ...archives.docs.map(item => item.data()),
      ...requests.docs.map(item => item.data().changes)
    ]);
    const candidates = [...new Set(fields.flatMap(field => field.fileIds))];
    const retained = candidates.filter(id => referenced.has(id)).map(fileId => ({ fileId, status: 'retained', message: 'File còn được hồ sơ hoặc yêu cầu khác sử dụng.' }));
    result = { results: retained };
    const handled = new Set();
    for (const field of fields) {
      const eligible = [...new Set(field.fileIds)].filter(id => !referenced.has(id) && !handled.has(id));
      eligible.forEach(id => handled.add(id));
      // The Apps Script endpoint accepts at most 20 files per request.
      for (let offset = 0; offset < eligible.length; offset += 20) {
        const fileIds = eligible.slice(offset, offset + 20);
        const response = await postAppsScript({ action: 'registrationAdminAction', registrationAction: 'trashReplacedStudentFiles', params: {
          studentRecordId: job.studentId, studentKey: student.studentKey, accessCode: student.accessCode,
          syncRevision: student.syncRevision, syncJobId: student.sheetSync.jobId,
          fieldKey: field.fieldKey, expectedValue: field.expectedValue, fileIds
        } });
        if (response.status !== 'success' || !response.result?.success || !Array.isArray(response.result.results)
          || fileIds.some(id => !response.result.results.some(item => item.fileId === id && ['trashed', 'alreadyTrashed', 'retained', 'failed'].includes(item.status)))) {
          throw new Error(response.message || 'Máy chủ chưa xác nhận kết quả dọn file.');
        }
        result.results.push(...response.result.results);
      }
    }
    const failed = result.results.filter(item => item.status === 'failed');
    if (failed.length) throw new Error(failed[0].message || 'Một số file chưa chuyển được vào thùng rác.');
  } catch (error) {
    failure = /Thao tác (đăng ký )?không được hỗ trợ|chưa hỗ trợ thao tác xuất/i.test(error.message)
      ? new Error('Cần cập nhật và triển khai lại cả Apps Script chính và Apps Script đăng ký để dọn file cũ.', { cause: error }) : error;
  }
  await runTransaction(db, async tx => {
    const current = (await tx.get(jobRef)).data();
    if (current?.workerId !== workerId) return;
    tx.set(jobRef, { status: failure ? 'failed' : 'done', message: failure?.message || '', results: result?.results || [],
      leaseUntil: 0, updatedAt: Date.now() }, { merge: true });
  });
  if (failure) throw failure;
  return result;
}

export function profileCleanupMessage(result) {
  const trashed = result.results.filter(item => ['trashed', 'alreadyTrashed'].includes(item.status)).length;
  const retained = result.results.filter(item => item.status === 'retained').length;
  return `Đã dọn ${trashed} file cũ vào thùng rác.${retained ? ` Giữ lại ${retained} file còn được sử dụng hoặc ngoài thư mục hồ sơ.` : ''}`;
}
