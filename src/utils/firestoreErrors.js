export function isFirestoreQuotaError(error) {
  return error?.code === 8 || error?.status === 429
    || /resource[-_]exhausted|quota exceeded|exceeded.*quota/i.test(`${error?.code || ''} ${error?.message || error || ''}`);
}

export function leaveRequestErrorMessage(error) {
  return isFirestoreQuotaError(error)
    ? 'Hệ thống dữ liệu đã chạm hạn mức. Đã dừng duyệt; các đơn chưa lưu vẫn chờ xử lý. Quản trị viên cần kiểm tra hạn mức Firestore trước khi thử lại.'
    : error?.message || 'Chưa xử lý được đơn xin nghỉ. Vui lòng thử lại.';
}
