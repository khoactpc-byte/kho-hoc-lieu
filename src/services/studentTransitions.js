import { collection, doc, runTransaction } from 'firebase/firestore';
import { sameData } from '../utils/dataEquality';
import { db, appId } from '../config/firebase';
import { promotionGlobalRef, requirePromotionLease, writePromotionCheckpoint } from './schoolYearPromotion';

// All reads precede writes. Existing target records are never overwritten by retries.
export async function applyStudentTransitions(operations, job, scorebookGuards = []) {
  const records = name => collection(db, 'artifacts', appId, 'public', 'data', name);
  let created = 0;
  for (let offset = 0; offset < Math.max(operations.length, 1); offset += 100) {
    created += await runTransaction(db, async transaction => {
      const group = operations.slice(offset, offset + 100);
      const existing = await Promise.all(group.map(operation => transaction.get(operation.ref)));
      const sources = await Promise.all(group.map(operation => operation.sourceRef ? transaction.get(operation.sourceRef) : null));
      const scorebooks = await Promise.all(scorebookGuards.map(guard => transaction.get(guard.ref)));
      const settings = (await transaction.get(promotionGlobalRef())).data();
      if (settings?.maintenance?.active) throw new Error('Hệ thống đang sao lưu hoặc phục hồi. Chưa chuyển năm.');
      if (job) requirePromotionLease(settings, job);
      const reservations = new Map();
      for (const operation of group) if (operation.type !== 'verify' && operation.data.accessCode) {
        const code = operation.data.accessCode;
        if (!reservations.has(code)) reservations.set(code, (await transaction.get(doc(records('student_code_registry'), code))).data());
      }
      scorebooks.forEach((snapshot, index) => {
        const data = snapshot.data();
        const guard = scorebookGuards[index];
        if (!data || Number(data.updatedAt || 0) !== guard.updatedAt || !sameData(data.edits || {}, guard.edits)) {
          throw new Error('Điểm học tập đã thay đổi từ lúc xem trước. Hãy đối soát lại trước khi chuyển năm.');
        }
      });
      let count = 0;
      group.forEach((operation, index) => {
        if (operation.sourceRef && !sameData(sources[index].data(), operation.expectedSource)) {
          throw new Error('Hồ sơ nguồn vừa thay đổi trong lúc chuyển năm. Hãy làm mới bản xem trước để đối soát.');
        }
        if (operation.type !== 'create' && !existing[index].exists()) throw new Error('Hồ sơ cần cập nhật đã bị xóa. Chưa ghi nhóm này.');
        if (operation.type !== 'create' && Object.hasOwn(operation, 'expected') && !sameData(existing[index].data(), operation.expected)) {
          throw new Error('Hồ sơ cần cập nhật vừa thay đổi. Chưa ghi nhóm này; hãy làm mới bản xem trước.');
        }
        if (operation.type === 'verify') return;
        if (operation.type === 'create' && existing[index].exists()) {
          const target = existing[index].data();
          if (target.previousStudentId !== operation.data.previousStudentId || target.schoolYear !== operation.data.schoolYear || target.className !== operation.data.className) {
            throw new Error('Hồ sơ đích đã có dữ liệu khác với bản xem trước. Chưa ghi đè; hãy đối soát lại.');
          }
          return;
        }
        const current = existing[index].data(), source = sources[index]?.data();
        const stableKey = current?.studentKey || current?.accessCode || source?.studentKey || source?.accessCode || operation.data.studentKey || `student-${operation.ref.id}`;
        if (current?.studentKey && operation.data.studentKey && current.studentKey !== operation.data.studentKey) throw new Error('Không được đổi định danh học sinh khi chuyển năm.');
        const code = operation.data.accessCode;
        if (code) {
          const owner = reservations.get(code);
          if (owner && owner.studentKey !== stableKey && ![operation.ref.id, operation.sourceRef?.id].includes(owner.studentId)) throw new Error('Mã đăng nhập đã thuộc học sinh khác. Chưa chuyển nhóm này.');
          const next = { studentKey: stableKey, studentId: operation.ref.id, studentIds: [...new Set([...(owner?.studentIds || []), operation.ref.id])], updatedAt: Date.now() };
          reservations.set(code, next); transaction.set(doc(records('student_code_registry'), code), next);
        }
        const syncRevision = Number(current?.syncRevision || 0) + 1, jobId = `${operation.ref.id}--${globalThis.crypto.randomUUID()}`;
        transaction.set(operation.ref, { ...operation.data, studentKey: stableKey, syncRevision, sheetSync: { status: 'pending', jobId, updatedAt: Date.now() } }, { merge: operation.type !== 'create' });
        transaction.set(doc(records('student_sync_jobs'), jobId), { studentId: operation.ref.id, studentKey: stableKey, revision: syncRevision, status: 'pending', createdAt: Date.now(), actor: 'school-year-transition' });
        if (operation.type === 'create') count += 1;
      });
      if (job) writePromotionCheckpoint(transaction, settings, job, Math.min(offset + group.length, operations.length));
      return count;
    });
  }
  return created;
}
