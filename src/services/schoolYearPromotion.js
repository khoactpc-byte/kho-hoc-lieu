import { doc, runTransaction } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { stableRecordId } from '../utils/idempotency';
import { buildNextSchoolYearClasses } from '../utils/schoolClasses';

const globalRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
const jobRef = id => doc(db, 'artifacts', appId, 'public', 'data', 'school_year_jobs', id);
const attemptRef = job => jobRef(`${job.id}-${job.attemptId}`);
const LEASE_MS = 10 * 60 * 1000;

export function requirePromotionLease(settings, job) {
  const active = settings?.schoolYearPromotion;
  if (active?.attemptId !== job.attemptId || active.status !== 'pending' || !(active.leaseExpiresAt > Date.now())) {
    throw new Error('Lượt chuyển năm này đã hết quyền ghi. Hãy chạy lại để đối soát và tiếp tục.');
  }
}

export async function beginPromotionJob(sourceSchoolYear, targetSchoolYear, actor, kind = 'promotion') {
  const validYear = value => /^20\d{2}-20\d{2}$/.test(value) && Number(value.slice(5)) === Number(value.slice(0, 4)) + 1;
  if (!validYear(sourceSchoolYear) || !validYear(targetSchoolYear) || !actor) throw new Error('Thiếu năm học hoặc người thực hiện hợp lệ.');
  const id = stableRecordId('school-year', sourceSchoolYear, targetSchoolYear, kind);
  const attemptId = globalThis.crypto.randomUUID();
  return runTransaction(db, async transaction => {
    const settings = (await transaction.get(globalRef())).data() || {};
    const previous = (await transaction.get(jobRef(id))).data() || {};
    if (![sourceSchoolYear, targetSchoolYear].includes(settings.schoolYear)) {
      throw new Error('Năm học hệ thống vừa thay đổi. Hãy tải lại danh sách trước khi chuyển năm.');
    }
    const active = settings.schoolYearPromotion;
    if (active?.status === 'pending' && active.leaseExpiresAt > Date.now()) {
      throw new Error('Một lượt chuyển năm đang chạy. Hãy chờ lượt đó hoàn tất trước khi thử lại.');
    }
    const sameDirection = active?.sourceSchoolYear === sourceSchoolYear && active?.targetSchoolYear === targetSchoolYear && (active.kind || 'promotion') === kind;
    if (active?.status !== 'success' && active?.id && active.id !== id && !sameDirection) {
      throw new Error('Lượt đổi năm trước chưa hoàn tất. Cần tiếp tục đúng lượt đó trước khi đổi sang năm khác.');
    }
    const sequence = Number(settings.schoolYearChangeSequence || 0) + 1;
    if (!Number.isSafeInteger(sequence)) throw new Error('Số lượt đổi năm không hợp lệ; cần kiểm tra thiết lập.');
    const job = { id, attemptId, sequence, kind, sourceSchoolYear, targetSchoolYear, status: 'pending', stage: 'backup',
      attemptCount: Number(previous.attemptCount || 0) + 1, startedAt: previous.startedAt || Date.now(),
      updatedAt: Date.now(), updatedBy: actor, leaseExpiresAt: Date.now() + LEASE_MS, message: '',
      firebaseProcessed: 0, sheetProcessed: 0 };
    transaction.set(jobRef(id), job);
    transaction.set(attemptRef(job), job);
    transaction.set(globalRef(), { schoolYearPromotion: job, schoolYearChangeSequence: sequence }, { mergeFields: ['schoolYearPromotion', 'schoolYearChangeSequence'] });
    return job;
  });
}

export async function recordPromotionStage(job, stage, progress = {}) {
  await runTransaction(db, async transaction => {
    const settings = (await transaction.get(globalRef())).data();
    requirePromotionLease(settings, job);
    const patch = { ...progress, stage, updatedAt: Date.now(), leaseExpiresAt: Date.now() + LEASE_MS };
    const next = { ...settings.schoolYearPromotion, ...patch };
    transaction.set(jobRef(job.id), patch, { merge: true });
    transaction.set(attemptRef(job), patch, { merge: true });
    transaction.set(globalRef(), { schoolYearPromotion: next }, { mergeFields: ['schoolYearPromotion'] });
  });
}

// Called in the same transaction as each group of student writes.
export function writePromotionCheckpoint(transaction, settings, job, processed) {
  requirePromotionLease(settings, job);
  const progress = { firebaseProcessed: processed, stage: 'firebase', updatedAt: Date.now(), leaseExpiresAt: Date.now() + LEASE_MS };
  transaction.set(jobRef(job.id), progress, { merge: true });
  transaction.set(attemptRef(job), progress, { merge: true });
  transaction.set(globalRef(), { schoolYearPromotion: { ...settings.schoolYearPromotion, ...progress } }, { mergeFields: ['schoolYearPromotion'] });
}

export async function finalizePromotionJob(job, classNames) {
  return runTransaction(db, async transaction => {
    const settings = (await transaction.get(globalRef())).data() || {};
    requirePromotionLease(settings, job);
    if (![job.sourceSchoolYear, job.targetSchoolYear].includes(settings.schoolYear)) throw new Error('Năm hệ thống vừa bị đổi; chưa chốt lượt chuyển năm này.');
    const schoolClassesByYear = { ...(settings.schoolClassesByYear || {}) };
    if (classNames) schoolClassesByYear[job.targetSchoolYear] = buildNextSchoolYearClasses(schoolClassesByYear[job.targetSchoolYear], classNames);
    const extraSchoolYears = [...new Set([...(settings.extraSchoolYears || []), job.targetSchoolYear])];
    const complete = { ...settings.schoolYearPromotion, status: 'success', stage: 'complete', message: '',
      updatedAt: Date.now(), completedAt: Date.now(), leaseExpiresAt: 0 };
    transaction.set(jobRef(job.id), complete, { merge: true });
    transaction.set(attemptRef(job), complete, { merge: true });
    transaction.set(globalRef(), { schoolYear: job.targetSchoolYear, schoolClassesByYear, extraSchoolYears, schoolYearPromotion: complete },
      { mergeFields: ['schoolYear', 'schoolClassesByYear', 'extraSchoolYears', 'schoolYearPromotion'] });
    return { schoolClassesByYear, extraSchoolYears };
  });
}

export async function failPromotionJob(job, message) {
  await runTransaction(db, async transaction => {
    const settings = (await transaction.get(globalRef())).data();
    if (settings?.schoolYearPromotion?.attemptId !== job.attemptId || settings.schoolYearPromotion.status !== 'pending') return;
    const failed = { ...settings.schoolYearPromotion, status: 'failed', message, updatedAt: Date.now(), leaseExpiresAt: 0 };
    transaction.set(jobRef(job.id), failed, { merge: true });
    transaction.set(attemptRef(job), failed, { merge: true });
    transaction.set(globalRef(), { schoolYearPromotion: failed }, { mergeFields: ['schoolYearPromotion'] });
  });
}

export const promotionGlobalRef = globalRef;
