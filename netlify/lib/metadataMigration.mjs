import { createHash, randomUUID } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { stableDataString, sameData } from '../../src/utils/dataEquality.js';
import { extractSchoolYearFromText } from '../../src/utils/schoolYearText.js';
import { getStudentSchoolCode, SCHOOL_GRADES, SCHOOL_OPTIONS } from '../../src/utils/schoolClasses.js';
import { documentId, fail } from './dataPolicy.mjs';
import { GRADES, SUBJECTS } from '../../src/config/learningDomain.js';
const checksum = data => createHash('sha256').update(stableDataString(data)).digest('hex');
export function createMetadataMigrationService({ store, appId, now = Date.now }) {
  const root = `artifacts/${appId}/public/data`, ref = (name, id) => store.doc(`${root}/${name}/${documentId(id)}`);
  const admin = actor => fail(actor.role === 'admin', 403, 'Chỉ admin được đối soát dữ liệu cũ.');
  function plan(data, id) {
    const schoolYear = extractSchoolYearFromText(data.schoolYear, ''), grade = String(data.className || '').match(/^[1-9]\d*/)?.[0];
    const schoolCode = getStudentSchoolCode(data), studentKey = data.studentKey || data.accessCode;
    if (!schoolYear || !SCHOOL_GRADES.includes(grade) || schoolCode === 'UNKNOWN' || !studentKey || !/^HS\d{3,15}$/.test(data.accessCode || '')) return { id, eligible: false, reason: 'Thiếu năm/lớp/cơ sở hoặc mã hợp lệ; cần đối soát thủ công.' };
    const patch = { schoolYear, grade, schoolCode, studentKey };
    return { id, eligible: true, checksum: checksum(data), patch, fullName: data.fullName || '', changed: Object.entries(patch).some(([key, value]) => !sameData(data[key], value)) };
  }
  async function previewMetadata(actor, { after = null } = {}) {
    admin(actor); let query = store.collection(`${root}/students`).orderBy(FieldPath.documentId()).limit(50);
    if (after) query = query.startAfter(documentId(after));
    const rows = await query.get(), results = [];
    for (const item of rows.docs) {
      const data = item.data(), result = plan(data, item.id);
      if (result.eligible && data.previousStudentId && !data.studentKey) {
        const source = (await ref('students', data.previousStudentId).get()).data();
        if (!source || (source.studentKey || source.accessCode) !== result.patch.studentKey) { result.eligible = false; result.reason = 'Mã lịch sử khác mã hiện tại. Cần đối chiếu khóa điểm trước khi nối định danh.'; }
      }
      results.push(result);
    }
    return { results, after: rows.docs.length === 50 ? rows.docs.at(-1).id : null };
  }
  async function applyMetadata(actor, { id, expectedChecksum }) {
    admin(actor); const jobId = `${id}--${randomUUID()}`;
    return store.runTransaction(async tx => {
      const target = ref('students', id), data = (await tx.get(target)).data(); fail(data && checksum(data) === expectedChecksum, 409, 'Hồ sơ vừa thay đổi; xem trước lại.');
      const settings = (await tx.get(ref('settings', 'global'))).data(); fail(!settings?.maintenance?.active, 423, 'Hệ thống đang bảo trì.');
      const planned = plan(data, id); fail(planned.eligible, 409, planned.reason);
      if (data.previousStudentId && !data.studentKey) {
        const source = (await tx.get(ref('students', data.previousStudentId))).data();
        fail(source && (source.studentKey || source.accessCode) === planned.patch.studentKey, 409, 'Cần đối chiếu mã lịch sử trước.');
      }
      const code = ref('student_code_registry', data.accessCode), owner = (await tx.get(code)).data();
      fail(!owner || owner.studentKey === planned.patch.studentKey, 409, 'Registry đã dành mã cho định danh khác.');
      const aliases = await tx.get(store.collection(`${root}/students`).where('accessCode', '==', data.accessCode).limit(16));
      fail(aliases.docs.length < 16 && aliases.docs.every(item => (item.data().studentKey || item.data().accessCode) === planned.patch.studentKey)
        && new Set(aliases.docs.map(item => extractSchoolYearFromText(item.data().schoolYear, ''))).size === aliases.docs.length, 409, 'Có hồ sơ trùng mã/năm; chưa tự gộp.');
      const ids = [...new Set([...(owner?.studentIds || []), ...aliases.docs.map(item => item.id), id])];
      tx.set(code, { ...(owner || {}), studentKey: planned.patch.studentKey, studentId: owner?.studentId || id, studentIds: ids, updatedAt: now() });
      if (planned.changed) {
        const syncRevision = Number(data.syncRevision || 0) + 1;
        tx.set(target, { ...data, ...planned.patch, syncRevision, sheetSync: { status: 'pending', jobId, updatedAt: now() }, updatedAt: now(), updatedBy: actor.uid });
        tx.set(ref('student_sync_jobs', jobId), { studentId: id, studentKey: planned.patch.studentKey, revision: syncRevision, status: 'pending', createdAt: now(), actor: actor.uid });
      }
      return { id, migrated: planned.changed, registryVerified: true };
    });
  }
  const materialFields = new Set(['schoolYear', 'schoolCode', 'grade', 'subject', 'lesson', 'title', 'url', 'driveFileId', 'type', 'createdAt', 'authorId', 'updatedAt', 'studentSafe']);
  function materialPlan(data, id) {
    let url; try { url = new URL(data.url); } catch { /* Invalid links stay blocked. */ }
    const eligible = ['link', 'pdf', 'ppt', 'image', 'video'].includes(data.type) && url?.protocol === 'https:' && !url.username && !url.password
      && SCHOOL_OPTIONS.some(option => option.code !== 'UNKNOWN' && option.code === data.schoolCode) && GRADES.includes(String(data.grade)) && SUBJECTS.includes(data.subject)
      && extractSchoolYearFromText(data.schoolYear, '') === data.schoolYear && Object.keys(data).every(key => materialFields.has(key));
    return { id, title: data.title || id, url: url?.protocol === 'https:' ? url.href : '', eligible, changed: data.studentSafe !== true,
      checksum: checksum(data), reason: eligible ? '' : 'Thiếu phạm vi hoặc có trường/nội dung đề chưa tách. Chưa tự đánh dấu an toàn.' };
  }
  async function previewMaterials(actor, { after = null } = {}) {
    admin(actor); let query = store.collection(`${root}/materials`).orderBy(FieldPath.documentId()).limit(50);
    if (after) query = query.startAfter(documentId(after));
    const rows = await query.get();
    return { results: rows.docs.map(item => materialPlan(item.data(), item.id)), after: rows.docs.length === 50 ? rows.docs.at(-1).id : null };
  }
  async function applyMaterial(actor, { id, expectedChecksum, reviewed }) {
    admin(actor); fail(reviewed === true, 400, 'Cần xác nhận đã xem nội dung tài liệu dành cho học sinh.');
    return store.runTransaction(async tx => {
      const target = ref('materials', id), data = (await tx.get(target)).data();
      fail(data && checksum(data) === expectedChecksum, 409, 'Tài liệu vừa thay đổi; xem trước lại.');
      const settings = (await tx.get(ref('settings', 'global'))).data(); fail(!settings?.maintenance?.active, 423, 'Hệ thống đang bảo trì.');
      const planned = materialPlan(data, id); fail(planned.eligible, 409, planned.reason);
      tx.set(target, { ...data, studentSafe: true, updatedAt: now() }); return { id, migrated: planned.changed };
    });
  }
  return { previewMetadata, applyMetadata, previewMaterials, applyMaterial };
}
