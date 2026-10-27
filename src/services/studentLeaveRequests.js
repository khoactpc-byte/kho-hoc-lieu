import { collection, doc, getDocs, limit, onSnapshot, query, runTransaction, where } from 'firebase/firestore';
import { appId, auth, db } from '../config/firebase';
import { createLeaveRequestService, LEAVE_REQUEST_COLLECTION } from '../utils/studentLeaveRequests';
import { attendanceDocumentId } from '../utils/classNormalization';
import { getStudentSchoolCode } from '../utils/schoolClasses';
import { processRecords } from '../utils/bulkOperations';
import { SCOPED_AUTH_ENABLED } from './scopedIdentity';
import { requestPrivateApi } from './serverQuizClient';
import { isFirestoreQuotaError } from '../utils/firestoreErrors';

const root = `artifacts/${appId}/public/data`;
const service = createLeaveRequestService({ root, store: { doc: path => doc(db, path), runTransaction: callback => runTransaction(db, callback) },
  resolveAttendanceDocument: async scope => {
    const source = query(collection(db, `${root}/class_attendance`), ...['schoolYear', 'schoolCode', 'className', 'date'].map(key => where(key, '==', scope[key])), limit(3));
    const rows = (await getDocs(source)).docs.map(item => ({ ...item.data(), id: item.id }));
    return attendanceDocumentId(rows, scope);
  }
});
export function subscribeLeaveRequests({ role, studentId, schoolYear }, next, error) {
  if (!['student', 'admin'].includes(role) || role === 'student' && !studentId) throw new Error('Không có quyền xem đơn xin nghỉ.');
  const filters = role === 'student' ? [where('studentId', '==', studentId)] : [where('schoolYear', '==', schoolYear)];
  return onSnapshot(query(collection(db, `${root}/${LEAVE_REQUEST_COLLECTION}`), ...filters), snapshot =>
    next(snapshot.docs.map(item => ({ ...item.data(), id: item.id })).filter(item => item.schoolYear === schoolYear)), error);
}
const actor = ({ role, student }) => ({ role, uid: auth.currentUser?.uid, studentId: student?.id, accessCode: student?.accessCode,
  schoolCode: student ? getStudentSchoolCode(student) : '', schoolYear: student?.schoolYear });
export function submitLeaveRequest(student, payload) {
  if (!auth.currentUser) throw new Error('Cần đăng nhập lại để gửi đơn.');
  return SCOPED_AUTH_ENABLED ? requestPrivateApi('data', 'submitLeaveRequest', payload) : service.submit(actor({ role: 'student', student }), payload);
}
export function reviewLeaveRequest(request, decision) {
  if (!auth.currentUser) throw new Error('Cần đăng nhập admin để duyệt đơn.');
  const payload = { requestId: request.id, expectedVersion: request.version, decision };
  return SCOPED_AUTH_ENABLED ? requestPrivateApi('data', 'reviewLeaveRequest', payload) : service.review(actor({ role: 'admin' }), payload);
}
export function reviewLeaveRequests(requests, decision, onProgress, shouldContinue = () => true) {
  const session = auth.currentUser;
  return processRecords(requests, request => {
    if (!session || auth.currentUser !== session || !shouldContinue()) throw new Error('Màn hình hoặc phiên đăng nhập đã đổi. Chưa duyệt đơn này.');
    return reviewLeaveRequest(request, decision);
  }, onProgress, { stopOnError: error => isFirestoreQuotaError(error) || !session || auth.currentUser !== session || !shouldContinue() });
}
