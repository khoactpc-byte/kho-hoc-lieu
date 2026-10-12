import { collection, doc, runTransaction } from 'firebase/firestore';
import { db, appId } from '../config/firebase';
import { sameData } from '../utils/dataEquality';
import { SCOPED_AUTH_ENABLED } from './scopedIdentity';

export async function applyClassNormalization(plan, backupId) {
  if (SCOPED_AUTH_ENABLED) throw new Error('Cần công cụ chuẩn hóa trên máy chủ khi dùng tài khoản phân quyền.');
  if (!backupId || plan.conflicts.length) throw new Error('Cần sao lưu và đối chiếu các mục trùng trước khi chuẩn hóa.');
  const operations = plan.groups.flatMap(group => group.operations);
  if (operations.length > 400 || new TextEncoder().encode(JSON.stringify(operations)).length > 7_000_000) throw new Error('Dữ liệu vượt giới hạn cập nhật đồng thời; chưa thay đổi.');
  await runTransaction(db, async transaction => {
    const settings = (await transaction.get(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'))).data() || {};
    if (settings.maintenance?.active) throw new Error('Hệ thống đang phục hồi; chưa chuẩn hóa.');
    const refs = operations.map(item => doc(collection(db, 'artifacts', appId, 'public', 'data', item.name), item.id));
    const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
    snapshots.forEach((snapshot, index) => {
      if (!sameData(snapshot.data(), operations[index].before)) throw new Error('Dữ liệu vừa thay đổi. Hãy đọc lại trước khi chuẩn hóa.');
    });
    operations.forEach((item, index) => transaction.set(refs[index], item.patch, { mergeFields: Object.keys(item.patch) }));
  });
  return { completed: operations.length, backupId };
}
