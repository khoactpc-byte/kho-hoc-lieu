import { collection, deleteField, doc, getDocFromServer, getDocsFromServer, runTransaction } from 'firebase/firestore';
import { sameData } from '../utils/dataEquality';
import { appId, db } from '../config/firebase';
import { BACKUP_COLLECTIONS, buildAtomicRestorePlan, validateRestoreSnapshot } from '../utils/backupManifest';
import { assembleGeneration } from '../utils/chunkedData';
import { stageTeachingAssignments } from './teachingAssignments';
import { SERVER_SYSTEM_ENABLED, captureServerSnapshot, prepareServerRestore, executeServerRestore, cancelMaintenance } from './serverSystemClient';

const dataCollection = name => collection(db, 'artifacts', appId, 'public', 'data', name);
const globalRef = () => doc(dataCollection('settings'), 'global');

export async function captureSystemSnapshot(schoolYear) {
  if (SERVER_SYSTEM_ENABLED) return captureServerSnapshot(schoolYear);
  const startedAt = Date.now();
  const collections = {};
  // Fetch a bounded number of collections concurrently; fail closed on any unreadable collection.
  for (let index = 0; index < BACKUP_COLLECTIONS.length; index += 4) {
    await Promise.all(BACKUP_COLLECTIONS.slice(index, index + 4).map(async name => {
      const result = await getDocsFromServer(dataCollection(name));
      collections[name] = result.docs.map(item => ({ ...item.data(), id: item.id }));
    }));
  }
  const originalSettings = (await getDocFromServer(globalRef())).data();
  const settings = { ...(originalSettings || {}) };
  ['adminPass', 'teacherPass', 'thdAdminPass'].forEach(key => delete settings[key]);
  const parent = doc(dataCollection('settings'), 'thdTeachingAssignments');
  const metadata = (await getDocFromServer(parent)).data();
  let teachingAssignments = settings.thdTeachingAssignments;
  if (metadata?.chunked) {
    const ref = metadata.generation ? collection(parent, 'generations', metadata.generation, 'chunks') : collection(parent, 'chunks');
    const pieces = (await getDocsFromServer(ref)).docs.map(item => item.data());
    teachingAssignments = await assembleGeneration(metadata, metadata.generation ? pieces : pieces.filter(piece => piece.index < metadata.chunkCount));
  } else if (metadata?.value) teachingAssignments = metadata.value;
  await runTransaction(db, async transaction => {
    const global = (await transaction.get(globalRef())).data();
    const assignments = (await transaction.get(parent)).data();
    if (!sameData(global, originalSettings) || !sameData(assignments, metadata)) throw new Error('Thiết lập hoặc phân công vừa thay đổi trong lúc sao lưu. Thử lại để lấy bản đầy đủ.');
  });
  return { version: 2, createdAt: Date.now(), schoolYear, collections, settings,
    teachingAssignments: teachingAssignments || {},
    manifest: { counts: Object.fromEntries(Object.entries(collections).map(([name, rows]) => [name, rows.length])),
      startedAt, consistency: 'server-reads-per-collection',
      includesDriveFiles: false, includesTeacherAccountsSheet: false } };
}

export async function restoreAtomicSnapshot(snapshot, { mailboxRows = null } = {}) {
  validateRestoreSnapshot(snapshot);
  if (snapshot.version === 3) {
    if (!SERVER_SYSTEM_ENABLED) throw new Error('Bản sao lưu đầy đủ cần bật công cụ phục hồi máy chủ.');
    const preview = await prepareServerRestore(snapshot, undefined, mailboxRows);
    if (!window.confirm(`Xem trước phục hồi: thêm ${preview.previewCreateCount || 0} hồ sơ, ghi lại ${preview.previewUpdateCount || 0} hồ sơ và xóa ${preview.previewDeleteCount || 0} hồ sơ ngoài bản lưu. Số lượng được lập lại sau khi khóa ghi. Tiếp tục?`)) {
      await cancelMaintenance(preview.jobId); throw new Error('Đã hủy phục hồi trước khi ghi dữ liệu chính.');
    }
    return executeServerRestore(preview.jobId);
  }
  if (SERVER_SYSTEM_ENABLED) throw new Error('Bản cũ thiếu dữ liệu đề/lượt làm riêng. Chuyển đổi và đối soát trước khi phục hồi; chưa thay đổi dữ liệu.');
  const existing = {};
  const before = new Map();
  for (const name of Object.keys(snapshot.collections)) {
    const documents = (await getDocsFromServer(dataCollection(name))).docs;
    existing[name] = documents.map(item => item.id);
    documents.forEach(item => before.set(`${name}/${item.id}`, item.data()));
  }
  const operations = buildAtomicRestorePlan(snapshot, existing);
  const previousSettings = (await getDocFromServer(globalRef())).data();
  const teachingValue = snapshot.teachingAssignments || snapshot.settings?.thdTeachingAssignments;
  const parent = doc(dataCollection('settings'), 'thdTeachingAssignments');
  let safeSettings = {};
  if (snapshot.settings) {
    safeSettings = { ...snapshot.settings };
    ['adminPass', 'teacherPass', 'thdAdminPass', 'thdTeachingAssignments'].forEach(key => delete safeSettings[key]);
    // Restore the saved settings exactly, retaining only credentials from the
    // current server state. Fields created after the backup must disappear.
    ['adminPass', 'teacherPass', 'thdAdminPass'].forEach(key => {
      if (Object.hasOwn(previousSettings || {}, key)) safeSettings[key] = previousSettings[key];
    });
  }
  // Include settings in the bound; staging must not start for an oversized payload.
  if (new TextEncoder().encode(JSON.stringify({ operations, settings: safeSettings })).length > 7 * 1024 * 1024) {
    throw new Error('Nội dung phục hồi quá lớn cho giao dịch an toàn. Chưa thay đổi dữ liệu chính.');
  }
  const staged = teachingValue ? await stageTeachingAssignments(teachingValue) : null;
  await runTransaction(db, async transaction => {
    const references = operations.map(operation => doc(dataCollection(operation.name), operation.id));
    const observed = await Promise.all(references.map(ref => transaction.get(ref)));
    const global = await transaction.get(globalRef());
    const assignment = staged ? await transaction.get(parent) : null;
    observed.forEach((item, index) => {
      const operation = operations[index];
      if (!sameData(item.data(), before.get(`${operation.name}/${operation.id}`))) {
        throw new Error('Có dữ liệu vừa thay đổi trong lúc chuẩn bị phục hồi. Chưa ghi/xóa dữ liệu chính; dừng nhập liệu rồi thử lại.');
      }
    });
    if (!sameData(global.data(), previousSettings)) throw new Error('Thiết lập vừa thay đổi. Hãy thử phục hồi lại.');
    if (staged && !sameData(assignment.data(), staged.expected)) {
      throw new Error('Phân công vừa thay đổi. Chưa công bố bản phục hồi.');
    }
    operations.forEach((operation, index) => {
      if (operation.type === 'delete') transaction.delete(references[index]);
      else transaction.set(references[index], operation.data);
    });
    if (snapshot.settings) transaction.set(globalRef(), safeSettings);
    else if (staged) transaction.set(globalRef(), { thdTeachingAssignments: deleteField() }, { merge: true });
    if (staged) transaction.set(parent, staged.metadata, { merge: true });
  });
  return { collections: Object.keys(snapshot.collections), teachingAssignments: Boolean(staged) };
}
