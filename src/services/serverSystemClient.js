import { requestPrivateApi } from './serverQuizClient';
import { SCOPED_AUTH_ENABLED } from './scopedIdentity';
import { contentDigest } from '../utils/chunkedData';
export const SERVER_SYSTEM_ENABLED = SCOPED_AUTH_ENABLED && import.meta.env.VITE_SERVER_SYSTEM_ENABLED === 'true';
const call = (action, payload) => requestPrivateApi('system', action, payload);
export async function continueMaintenance(jobId, { rollback = false, onProgress = () => {} } = {}) {
  let result;
  do { result = await call('stepRestore', { jobId, rollback }); onProgress(result); }
  while (!['complete', 'rolledBack'].includes(result.status));
  return result;
}
export async function continueRestorePreparation(jobId, { dryRun = false, onProgress = () => {} } = {}) {
  let job;
  do { job = await call('prepareRestore', { jobId, dryRun }); onProgress(job); }
  while (!['validated', 'restoring'].includes(job.status) || !dryRun && job.status !== 'restoring');
  return job;
}
export async function captureServerSnapshot(schoolYear, onProgress = () => {}, existingJobId = null) {
  const jobId = existingJobId || (await call('beginBackup', {})).jobId;
  window.localStorage.setItem('khl-maintenance-job-v1', jobId);
  let job;
  do { job = await call('stepBackup', { jobId }); onProgress(job); } while (job.status !== 'complete');
  const chunks = [], counts = {};
  for (let index = 0; index < job.chunkCount; index++) {
    const part = await call('readBackup', { jobId, index });
    if (await contentDigest(part.json) !== part.checksum) throw new Error('Mảnh sao lưu không khớp checksum.');
    chunks.push(part);
    for (const row of JSON.parse(part.json)) { if (row.fragment && row.fragment.index !== 0) continue; const name = row.path.startsWith('public/data/') ? row.path.split('/')[2] : row.path.split('/')[0]; counts[name] = (counts[name] || 0) + 1; }
  }
  return { version: 3, createdAt: job.createdAt, maintenanceJobId: jobId, schoolYear, chunks,
    manifest: { version: 3, scope: 'firestore-full-graph', consistency: 'server-maintenance-fence', counts,
      checksums: chunks.map(part => part.checksum), includesDriveFiles: false, includesTeacherAccountsSheet: false, excludesSessions: true } };
}
export async function prepareServerRestore(snapshot, onProgress = () => {}, mailboxRows = null) {
  const mailbox = [];
  if (mailboxRows !== null) {
    let group = [];
    for (const row of mailboxRows) {
      if (group.length >= 70 || new TextEncoder().encode(JSON.stringify([...group, row])).length > 400000) { mailbox.push(JSON.stringify(group)); group = []; }
      group.push(row);
    }
    if (group.length) mailbox.push(JSON.stringify(group));
  }
  const mailboxChecksums = mailboxRows === null ? null : await Promise.all(mailbox.map(contentDigest));
  const { jobId } = await call('beginRestore', { manifest: snapshot.manifest, mailboxChecksums });
  window.localStorage.setItem('khl-maintenance-job-v1', jobId);
  for (let index = 0; index < snapshot.chunks.length; index++) {
    const part = snapshot.chunks[index];
    if (await contentDigest(part.json) !== snapshot.manifest.checksums[index]) throw new Error('Checksum bản sao lưu sai. Chưa ghi dữ liệu chính.');
    await call('uploadRestoreChunk', { jobId, index, json: part.json }); onProgress({ status: 'uploading', cursor: index + 1, total: snapshot.chunks.length });
  }
  for (let index = 0; index < mailbox.length; index++) await call('uploadMailboxChunk', { jobId, index, json: mailbox[index] });
  const preview = await continueRestorePreparation(jobId, { dryRun: true, onProgress });
  return { ...preview, jobId };
}
export async function executeServerRestore(jobId, onProgress) {
  await continueRestorePreparation(jobId, { onProgress });
  const result = await continueMaintenance(jobId, { onProgress });
  if (result.mailboxStatus !== 'notIncluded') await call('applyMailbox', { jobId });
  window.localStorage.removeItem('khl-maintenance-job-v1'); return result;
}
export const listMaintenanceJobs = () => call('listJobs', {});
export const cancelMaintenance = jobId => call('cancelJob', { jobId });
export async function completeBackupExport(jobId, fileId) {
  await call('completeBackupExport', { jobId, fileId });
  window.localStorage.removeItem('khl-maintenance-job-v1');
}
export const retryMailboxRestore = jobId => call('applyMailbox', { jobId });
export const previewGenerations = () => call('previewGenerations', {});
export const previewStudentMetadata = after => call('previewMetadata', { after });
export const applyStudentMetadata = row => call('applyMetadata', { id: row.id, expectedChecksum: row.checksum });
export const previewMaterials = after => call('previewMaterials', { after });
export const applyMaterial = row => call('applyMaterial', { id: row.id, expectedChecksum: row.checksum, reviewed: true });
export async function cleanGeneration(generation, expectedActiveGeneration) {
  let result;
  do { result = await call('cleanGeneration', { generation, expectedActiveGeneration, dryRun: false }); } while (!result.complete);
  return result;
}
