import { FieldPath } from 'firebase-admin/firestore';
import { documentId, fail } from './dataPolicy.mjs';
const retention = 30 * 24 * 3600000;
export function createGenerationService({ store, appId, now = Date.now }) {
  const root = `artifacts/${appId}/public/data/settings/`, parent = store.doc(root + 'thdTeachingAssignments'), global = store.doc(root + 'global');
  const admin = actor => fail(actor.role === 'admin', 403, 'Chỉ admin được dọn bản phân công.');
  const eligible = (meta, active, id) => id !== active && meta?.createdAt > 0 && now() - meta.createdAt >= retention && (meta.status !== 'staging' || meta.expiresAt < now());
  async function previewGenerations(actor) {
    admin(actor); const pointer = (await parent.get()).data();
    const references = await parent.collection('generations').listDocuments();
    const rows = [];
    for (const ref of references) { const meta = (await ref.get()).data(); rows.push({ id: ref.id, createdAt: meta?.createdAt || null, status: meta?.status || 'legacy-unknown', eligible: eligible(meta, pointer?.generation, ref.id), active: ref.id === pointer?.generation }); }
    return { activeGeneration: pointer?.generation || null, retentionDays: 30, generations: rows };
  }
  async function cleanGeneration(actor, { generation, expectedActiveGeneration, dryRun = true }) {
    admin(actor); documentId(generation); const ref = parent.collection('generations').doc(generation);
    if (dryRun) { const preview = await previewGenerations(actor); return { ...preview.generations.find(row => row.id === generation), dryRun: true }; }
    const chunks = await ref.collection('chunks').orderBy(FieldPath.documentId()).limit(70).get();
    return store.runTransaction(async tx => {
      const pointer = (await tx.get(parent)).data(), settings = (await tx.get(global)).data(), meta = (await tx.get(ref)).data();
      fail(!settings?.maintenance?.active, 423, 'Đang có sao lưu hoặc phục hồi. Chưa dọn dữ liệu.');
      fail((pointer?.generation || null) === expectedActiveGeneration, 409, 'Bản đang công bố vừa thay đổi. Xem trước lại.');
      fail(eligible(meta, pointer?.generation, generation), 409, 'Bản đang dùng, chưa hết hạn hoặc chưa đủ căn cứ để dọn.');
      chunks.docs.forEach(item => tx.delete(item.ref));
      tx.set(ref, { ...meta, status: chunks.docs.length < 70 ? 'deleted' : 'deleting', cleanedAt: now() });
      return { generation, deletedChunks: chunks.docs.length, complete: chunks.docs.length < 70 };
    });
  }
  return { previewGenerations, cleanGeneration };
}
