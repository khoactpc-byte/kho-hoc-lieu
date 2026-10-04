import { collection, deleteField, doc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, writeBatch } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { assembleGeneration, contentDigest, splitUtf8Chunks } from '../utils/chunkedData';

const parentRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'thdTeachingAssignments');
const globalRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
import { sameData as unchanged } from '../utils/dataEquality';

async function readAssignmentValue(metadata, legacyValue) {
  if (!metadata) return legacyValue || {};
  if (!metadata.chunked) return metadata.value || {};
  const ref = metadata.generation
    ? collection(parentRef(), 'generations', metadata.generation, 'chunks')
    : collection(parentRef(), 'chunks');
  const pieces = (await getDocsFromServer(ref)).docs.map(item => item.data());
  return assembleGeneration(metadata, metadata.generation ? pieces : pieces.filter(piece => piece.index < metadata.chunkCount));
}

export function observeTeachingAssignments(onValue, onError) {
  let request = 0;
  const unsubscribe = onSnapshot(parentRef(), { includeMetadataChanges: true }, async snapshot => {
    if (snapshot.metadata.hasPendingWrites) return;
    const current = ++request;
    const metadata = snapshot.data();
    try {
      const legacyValue = !metadata ? (await getDocFromServer(globalRef())).data()?.thdTeachingAssignments : undefined;
      const value = await readAssignmentValue(metadata, legacyValue);
      if (current === request && value && typeof value === 'object') onValue(value);
    } catch (error) { if (current === request) onError?.(error); }
  }, onError);
  return () => { request += 1; unsubscribe(); };
}

export async function stageTeachingAssignments(value, options = {}) {
  const serialized = JSON.stringify(value);
  const generation = globalThis.crypto.randomUUID();
  const generationRef = doc(parentRef(), 'generations', generation);
  const chunks = splitUtf8Chunks(serialized);
  const digest = await contentDigest(serialized);
  // Read before staging, then compare again when switching the public pointer.
  const { expected, expectedLegacy } = await runTransaction(db, async transaction => {
    const parent = await transaction.get(parentRef());
    const global = await transaction.get(globalRef());
    return { expected: parent.data(), expectedLegacy: global.data()?.thdTeachingAssignments };
  });
  if (Object.hasOwn(options, 'baseValue')) {
    const currentValue = await readAssignmentValue(expected, expectedLegacy);
    if (!unchanged(currentValue, options.baseValue)) {
      throw new Error('Phân công đã thay đổi từ lúc bắt đầu sửa. Bản nháp được giữ lại; đối chiếu bản mới trước khi lưu.');
    }
  }
  const lifecycle = writeBatch(db);
  lifecycle.set(generationRef, { status: 'staging', createdAt: Date.now(), expiresAt: Date.now() + 24 * 3600000, chunkCount: chunks.length });
  await lifecycle.commit();
  for (let offset = 0; offset < chunks.length; offset += 300) {
    const batch = writeBatch(db);
    chunks.slice(offset, offset + 300).forEach((text, index) => {
      const position = offset + index;
      batch.set(doc(parentRef(), 'generations', generation, 'chunks', String(position)), { generation, index: position, text });
    });
    await batch.commit();
  }
  return { expected, expectedLegacy, metadata: { chunked: true, schemaVersion: 2, generation, chunkCount: chunks.length,
    digest, updatedAt: Date.now(), value: deleteField() } };
}

export async function saveTeachingAssignments(value, options) {
  const staged = await stageTeachingAssignments(value, options);
  await runTransaction(db, async transaction => {
    const current = (await transaction.get(parentRef())).data();
    const global = (await transaction.get(globalRef())).data();
    const lifecycleRef = doc(parentRef(), 'generations', staged.metadata.generation);
    const lifecycle = (await transaction.get(lifecycleRef)).data();
    if (global?.maintenance?.active) throw new Error('Hệ thống đang sao lưu hoặc phục hồi.');
    if (!lifecycle || lifecycle.status !== 'staging' || lifecycle.expiresAt <= Date.now()) throw new Error('Bản chuẩn bị đã hết hạn hoặc đang được dọn. Lưu lại từ bản nháp.');
    if (!unchanged(current, staged.expected) || !unchanged(global?.thdTeachingAssignments, staged.expectedLegacy)) {
      throw new Error('Phân công vừa được người khác sửa. Bản đang công bố được giữ nguyên; tải lại trước khi lưu.');
    }
    transaction.set(parentRef(), staged.metadata, { merge: true });
    transaction.set(lifecycleRef, { ...lifecycle, status: 'published', publishedAt: Date.now() });
    transaction.set(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), {
      thdTeachingAssignments: deleteField()
    }, { merge: true });
  });
  return { generation: staged.metadata.generation, chunkCount: staged.metadata.chunkCount, digest: staged.metadata.digest };
}

export async function saveSimpleTeachingAssignments(value, baseValue) {
  await runTransaction(db, async transaction => {
    const current = (await transaction.get(globalRef())).data()?.teachingAssignments || {};
    if (!unchanged(current, baseValue)) throw new Error('Phân công đã thay đổi từ lúc bắt đầu sửa. Bản nháp được giữ lại để đối chiếu.');
    transaction.set(globalRef(), { teachingAssignments: value }, { mergeFields: ['teachingAssignments'] });
  });
}
