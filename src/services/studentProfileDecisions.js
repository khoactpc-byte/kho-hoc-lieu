import { doc, runTransaction } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { sameData } from '../utils/dataEquality';
import { profileRequestRejectedFields } from '../utils/profileRequestDecisions';

export async function rejectStudentProfileChanges(request, fieldKey = '') {
  if (!request?.id || !request.studentId) throw new Error('Thiếu yêu cầu sửa hồ sơ.');
  const requestRef = doc(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests', request.id);
  const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
  return runTransaction(db, async transaction => {
    const current = (await transaction.get(requestRef)).data();
    const settings = (await transaction.get(settingsRef)).data();
    if (settings?.maintenance?.active) throw new Error('Hệ thống đang bảo trì/phục hồi. Chưa xử lý yêu cầu.');
    if (!current || current.studentId !== request.studentId || (current.status || 'pending') !== 'pending'
      || !sameData(current.changes, request.storedChanges ?? request.changes)) {
      throw new Error('Yêu cầu hồ sơ vừa thay đổi. Tải lại trước khi xử lý.');
    }
    const rejectedFields = profileRequestRejectedFields(current.changes, fieldKey);
    if (!rejectedFields.length) throw new Error('Thông tin này không còn chờ duyệt.');
    const remainingChanges = { ...current.changes };
    for (const key of rejectedFields) delete remainingChanges[key];
    // An explicit field mask replaces the map, rather than recursively merging old keys back in.
    if (Object.keys(remainingChanges).length) transaction.set(requestRef, { changes: remainingChanges, updatedAt: Date.now() }, { mergeFields: ['changes', 'updatedAt'] });
    else transaction.delete(requestRef);
    return { rejectedFields, remainingChanges };
  });
}
