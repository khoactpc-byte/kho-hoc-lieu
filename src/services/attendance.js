import { doc, runTransaction } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { sameData } from '../utils/dataEquality';
import { requestPrivateApi } from './serverQuizClient';
import { SCOPED_AUTH_ENABLED } from './scopedIdentity';
import { attendanceWithApprovedLeave, leaveRequestId, LEAVE_REQUEST_COLLECTION } from '../utils/studentLeaveRequests';

export async function saveAttendanceEntry({ documentId, student, status, expectedEntry, schoolYear, schoolCode, className, date, authorId, overrideApprovedLeave = false }) {
  if (SCOPED_AUTH_ENABLED) return requestPrivateApi('data', 'saveAttendance', { documentId, student: { id: student.id }, status, expectedEntry, schoolYear, schoolCode, className, date, overrideApprovedLeave });
  if (!student?.id || !documentId || !schoolYear || !className || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Thiếu hồ sơ hoặc ngày điểm danh.');
  if (!['', 'CP', 'KP'].includes(status)) throw new Error('Trạng thái điểm danh không hợp lệ.');
  const ref = doc(db, 'artifacts', appId, 'public', 'data', 'class_attendance', documentId);
  return runTransaction(db, async transaction => {
    const [previousSnapshot, settingsSnapshot] = await Promise.all([
      transaction.get(ref), transaction.get(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'))
    ]);
    const previous = previousSnapshot.data() || {};
    const settings = settingsSnapshot.data() || {};
    const leaveId = leaveRequestId({ studentId: student.id, schoolYear, schoolCode, date });
    const leave = (await transaction.get(doc(db, 'artifacts', appId, 'public', 'data', LEAVE_REQUEST_COLLECTION, leaveId))).data();
    if (settings.maintenance?.active) throw new Error('Hệ thống đang bảo trì. Chưa lưu điểm danh.');
    if (settings.inputYearLocks?.[schoolYear]) throw new Error('Năm học đang khóa nhập liệu. Chưa lưu điểm danh.');
    if ((previous.schoolYear && previous.schoolYear !== schoolYear) || (previous.className && previous.className !== className)
      || (previous.date && previous.date !== date) || (previous.schoolCode && previous.schoolCode !== schoolCode)) throw new Error('Hồ sơ điểm danh thuộc lớp, năm hoặc cơ sở khác. Chưa ghi đè.');
    if (!sameData(previous.records?.[student.id], expectedEntry)) throw new Error('Trạng thái học sinh vừa được người khác sửa. Hãy đối chiếu rồi chọn lại.');
    const now = Date.now();
    const entry = leave?.status === 'approved' && leave.studentId === student.id && leave.schoolYear === schoolYear
      && leave.schoolCode === schoolCode && leave.className === className && leave.date === date
      ? attendanceWithApprovedLeave({ ...leave, id: leaveId }, previous.records?.[student.id], status, now, { overrideApprovedLeave, authorId })
      : { studentId: student.id, studentName: student.fullName || '', status, updatedAt: now };
    const payload = { schoolYear, schoolCode, className, grade: String(className.match(/\d+/)?.[0] || ''), date,
      records: { ...previous.records, [student.id]: entry }, updatedAt: now, updatedBy: authorId || '' };
    transaction.set(ref, { ...previous, ...payload });
    return entry;
  });
}
