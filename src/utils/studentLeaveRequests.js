import { parseCalendarDate } from './calendarDate.js';
import { extractSchoolYearFromText } from './schoolYearText.js';
import { getStudentSchoolCode, normalizeSchoolClassName } from './schoolClasses.js';

export const LEAVE_REQUEST_COLLECTION = 'student_leave_requests';
export const LEAVE_STATUS_LABELS = { pending: 'Chờ duyệt', approved: 'Đã đồng ý', rejected: 'Đã từ chối' };
const requireValue = (value, message, status = 400) => {
  if (!value) throw Object.assign(new Error(message), { status });
};
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 180 && !id.includes('/') && !['.', '..', '__proto__', 'constructor', 'prototype'].includes(id);
export const leaveDateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const leaveDateLabel = key => String(key || '').split('-').reverse().join('/');
export function leaveRequestId({ schoolYear, schoolCode, studentId, date }) {
  requireValue(validId(studentId) && /^[A-Z0-9]{2,12}$/.test(schoolCode || '') && /^\d{4}-\d{4}$/.test(schoolYear || '') && /^\d{4}-\d{2}-\d{2}$/.test(date || ''), 'Phạm vi đơn xin nghỉ không hợp lệ.');
  return `leave-${schoolYear}-${schoolCode}-${encodeURIComponent(studentId)}-${date}`;
}
export function leaveDateRange(from, to = from) {
  const start = parseCalendarDate(from), end = parseCalendarDate(to);
  requireValue(start && end && from <= to && (end - start) / 86400000 <= 30, 'Chọn khoảng nghỉ hợp lệ, tối đa 31 ngày.');
  const dates = [];
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    if (![0, 6].includes(date.getDay())) dates.push(leaveDateKey(date));
  }
  requireValue(dates.length > 0, 'Khoảng đang chọn không có ngày học từ thứ Hai đến thứ Sáu.');
  return dates;
}
export function leaveReviewDates(mode, anchor) {
  const day = parseCalendarDate(anchor);
  if (!day) return [];
  if (mode === 'day') return [anchor];
  const monday = new Date(day);
  monday.setDate(monday.getDate() - (monday.getDay() || 7) + 1);
  return Array.from({ length: 5 }, (_, index) => { const date = new Date(monday); date.setDate(date.getDate() + index); return leaveDateKey(date); });
}
export function approvedLeaveEntry(request, previous, now) {
  const entry = { ...(previous || {}), studentId: request.studentId, studentName: request.studentName || '', status: 'CP',
    reportedStatus: previous?.reportedStatus ?? previous?.status ?? '', leaveRequestId: request.id,
    leaveApprovedAt: request.reviewedAt || now, updatedAt: now };
  delete entry.leaveAttendanceOverride;
  delete entry.leaveOverrideBy;
  delete entry.leaveOverrideAt;
  return entry;
}
// An approved request records permission to be absent; admin can still correct actual attendance.
export function attendanceWithApprovedLeave(request, previous, status, now, { overrideApprovedLeave = false, authorId = '' } = {}) {
  const entry = approvedLeaveEntry(request, { ...previous, reportedStatus: status }, now);
  if (overrideApprovedLeave) {
    if (status === 'CP') return entry;
    return { ...entry, status, leaveAttendanceOverride: true, leaveOverrideBy: authorId, leaveOverrideAt: now };
  }
  if (previous?.leaveAttendanceOverride === true && previous.leaveRequestId === request.id
    && previous.leaveApprovedAt === entry.leaveApprovedAt && ['', 'CP', 'KP'].includes(previous.status)) {
    return { ...entry, status: previous.status, leaveAttendanceOverride: true,
      leaveOverrideBy: previous.leaveOverrideBy || '', leaveOverrideAt: previous.leaveOverrideAt };
  }
  return entry;
}
export function createLeaveRequestService({ store, root, resolveAttendanceDocument, now = Date.now }) {
  const ref = (name, id) => store.doc(`${root}/${name}/${id}`);
  const writable = (settings, year) => {
    requireValue(!settings.maintenance?.active, 'Hệ thống đang bảo trì. Vui lòng thử lại sau.', 423);
    requireValue(!settings.inputYearLocks?.[year], 'Năm học đang khóa nhập liệu.', 423);
  };
  const checkProfile = (profile, scope) => requireValue(profile && profile.status !== 'dropped'
    && profile.schoolYear === scope.schoolYear && getStudentSchoolCode(profile) === scope.schoolCode
    && normalizeSchoolClassName(profile.className) === normalizeSchoolClassName(scope.className), 'Hồ sơ đã đổi lớp, năm học hoặc cơ sở. Vui lòng tải lại.', 409);
  async function submit(actor, { dates, reason }) {
    requireValue(actor?.role === 'student' && actor.uid && validId(actor.studentId), 'Chỉ học sinh được gửi đơn của mình.', 403);
    requireValue(Array.isArray(dates) && dates.length > 0 && dates.length <= 31 && new Set(dates).size === dates.length, 'Chọn từ 1 đến 31 ngày, không trùng ngày.');
    const text = String(reason || '').trim();
    requireValue(text.length > 0 && text.length <= 1000, 'Nhập lý do xin nghỉ, tối đa 1000 ký tự.');
    return store.runTransaction(async tx => {
      const profile = (await tx.get(ref('students', actor.studentId))).data();
      const settings = (await tx.get(ref('settings', 'global'))).data() || {};
      requireValue(profile && profile.accessCode === actor.accessCode && getStudentSchoolCode(profile) === actor.schoolCode
        && profile.schoolYear === actor.schoolYear && profile.status !== 'dropped' && /^[1-9]\d*[A-Za-z0-9-]*$/.test(profile.className || ''), 'Hồ sơ đăng nhập đã thay đổi. Vui lòng đăng nhập lại.', 403);
      requireValue(extractSchoolYearFromText(settings.schoolYear, '') === profile.schoolYear, 'Chỉ gửi đơn trong năm học hiện tại.', 403);
      writable(settings, profile.schoolYear);
      const year = Number(profile.schoolYear.slice(0, 4));
      for (const date of dates) {
        const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && parseCalendarDate(date);
        requireValue(parsed && ![0, 6].includes(parsed.getDay()) && date >= `${year}-09-01` && date <= `${year + 1}-05-31`, 'Ngày xin nghỉ phải là ngày học trong năm đang học.');
      }
      const scope = { studentId: actor.studentId, schoolYear: profile.schoolYear, schoolCode: getStudentSchoolCode(profile) };
      const previous = await Promise.all(dates.map(date => tx.get(ref(LEAVE_REQUEST_COLLECTION, leaveRequestId({ ...scope, date })))));
      const created = [], existing = [];
      previous.forEach((snapshot, index) => {
        const date = dates[index], id = leaveRequestId({ ...scope, date }), old = snapshot.data();
        if (old && ['pending', 'approved'].includes(old.status)) { existing.push({ id, date, status: old.status }); return; }
        const timestamp = now();
        tx.set(ref(LEAVE_REQUEST_COLLECTION, id), { ...scope, studentName: profile.fullName || '', accessCode: profile.accessCode,
          className: profile.className, grade: String(profile.className).match(/^\d+/)?.[0] || '', date, reason: text, status: 'pending',
          version: Number(old?.version || 0) + 1, authorId: actor.uid, createdAt: timestamp, updatedAt: timestamp });
        created.push({ id, date, status: 'pending' });
      });
      return { created, existing };
    });
  }
  async function review(actor, { requestId, decision, expectedVersion }) {
    requireValue(actor?.role === 'admin' && actor.uid, 'Chỉ admin được duyệt đơn xin nghỉ.', 403);
    requireValue(validId(requestId) || typeof requestId === 'string' && requestId.startsWith('leave-') && requestId.length <= 600 && !requestId.includes('/'), 'Mã đơn không hợp lệ.');
    requireValue(['approved', 'rejected'].includes(decision) && Number.isSafeInteger(expectedVersion) && expectedVersion > 0, 'Quyết định duyệt không hợp lệ.');
    return store.runTransaction(async tx => {
      const target = ref(LEAVE_REQUEST_COLLECTION, requestId), request = (await tx.get(target)).data();
      requireValue(request && requestId === leaveRequestId(request), 'Không tìm thấy đơn hợp lệ.', 404);
      requireValue(request.version === expectedVersion, 'Đơn đã được gửi lại. Hãy tải lại trước khi duyệt.', 409);
      if (request.status === decision) return { id: requestId, status: decision, replayed: true };
      requireValue(request.status === 'pending', 'Đơn này đã được xử lý. Vui lòng tải lại.', 409);
      const profile = (await tx.get(ref('students', request.studentId))).data();
      const settings = (await tx.get(ref('settings', 'global'))).data() || {};
      writable(settings, request.schoolYear);
      let attendanceRef, attendance;
      if (decision === 'approved') {
        checkProfile(profile, request);
        const id = await resolveAttendanceDocument(request);
        requireValue(validId(id), 'Không tìm thấy bảng điểm danh hợp lệ.');
        attendanceRef = ref('class_attendance', id);
        attendance = (await tx.get(attendanceRef)).data() || {};
        requireValue(['schoolYear', 'schoolCode', 'className', 'date'].every(key => !attendance[key] || (key === 'className'
          ? normalizeSchoolClassName(attendance[key]) === normalizeSchoolClassName(request[key]) : attendance[key] === request[key])), 'Bảng điểm danh thuộc phạm vi khác. Chưa ghi đè.', 409);
      }
      const timestamp = now(), result = { id: requestId, status: decision };
      if (attendanceRef) {
        const entry = approvedLeaveEntry({ ...request, id: requestId, reviewedAt: timestamp }, attendance.records?.[request.studentId], timestamp);
        tx.set(attendanceRef, { ...attendance, schoolYear: request.schoolYear, schoolCode: request.schoolCode, className: request.className,
          date: request.date, grade: request.grade, records: { ...attendance.records, [request.studentId]: entry }, updatedAt: timestamp, updatedBy: actor.uid });
        Object.assign(result, { entry, documentId: attendanceRef.id, studentId: request.studentId, date: request.date });
      }
      tx.set(target, { ...request, status: decision, reviewedAt: timestamp, reviewedBy: actor.uid, updatedAt: timestamp });
      return result;
    });
  }
  return { submit, review };
}
