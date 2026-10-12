import { collection, doc, runTransaction } from 'firebase/firestore';
import { db, appId } from '../config/firebase';
import { sameData } from '../utils/dataEquality';
import { SCOPED_AUTH_ENABLED } from './scopedIdentity';

export async function applyCampusNormalization(plan, backupId, onProgress = () => {}) {
  if (SCOPED_AUTH_ENABLED) throw new Error('Chế độ tài khoản phân quyền cần công cụ chuẩn hóa trên máy chủ.');
  if (!backupId || plan.conflicts.length) throw new Error('Cần sao lưu và xử lý các mục cần đối chiếu trước khi chuẩn hóa.');
  let completed = 0;
  for (let index = 0; index < plan.groups.length; index += 40) {
    const groups = plan.groups.slice(index, index + 40);
    const operations = groups.flatMap(group => group.operations);
    await runTransaction(db, async transaction => {
      const settings = (await transaction.get(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'))).data() || {};
      if (settings.maintenance?.active) throw new Error('Hệ thống đang sao lưu/phục hồi. Chưa chuẩn hóa.');
      const references = operations.map(item => doc(collection(db, 'artifacts', appId, 'public', 'data', item.name), item.id));
      const snapshots = await Promise.all(references.map(ref => transaction.get(ref)));
      snapshots.forEach((snapshot, position) => {
        if (!sameData(snapshot.data(), operations[position].before)) throw new Error('Dữ liệu vừa thay đổi. Đọc lại danh sách; các mục đã hoàn tất được giữ.');
      });
      operations.forEach((item, position) => {
        const data = item.patch || item.data;
        const saved = item.patch?.campusNormalization ? { ...data, campusNormalization: { ...data.campusNormalization, backupId } } : data;
        if (item.patch) transaction.set(references[position], saved, { mergeFields: Object.keys(saved) });
        else transaction.set(references[position], saved);
      });
    });
    completed += groups.length;
    onProgress({ completed, total: plan.groups.length });
  }
  return { completed, backupId };
}
