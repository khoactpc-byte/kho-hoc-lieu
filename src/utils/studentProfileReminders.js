export function studentProfileReminderBody(missing = []) {
  return [
    'Hồ sơ của em còn thiếu các mục sau:',
    ...missing.map(item => `• ${item}`),
    '',
    'Em mở Hồ sơ học sinh, bổ sung thông tin và ảnh còn thiếu rồi bấm “Gửi yêu cầu sửa”.',
    'Nếu cần xác nhận kết quả học tập hoặc đã bổ sung, em liên hệ giáo viên để kiểm tra.'
  ].join('\n');
}
