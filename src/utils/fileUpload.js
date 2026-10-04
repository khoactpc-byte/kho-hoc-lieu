export const STUDENT_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const STUDENT_UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

export function studentUploadMime(file) {
  const extensionTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
  const mime = String(file?.type || extensionTypes[String(file?.name || '').split('.').at(-1).toLowerCase()] || '').toLowerCase();
  if (!STUDENT_UPLOAD_ACCEPT.split(',').includes(mime)) throw new Error('Bài nộp/hồ sơ chỉ nhận JPG, PNG, WebP hoặc PDF.');
  if (!file?.size || file.size > STUDENT_UPLOAD_MAX_BYTES) throw new Error('Tệp phải có nội dung và dung lượng tối đa 20 MB.');
  return mime;
}

export function readFileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const finish = (error, value) => {
      reader.onload = reader.onerror = reader.onabort = null;
      if (error) reject(error); else resolve(value);
    };
    reader.onload = () => {
      const match = /^data:[^,]*;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(reader.result || ''));
      finish(match ? null : new Error('Không đọc được nội dung tệp.'), match?.[1]);
    };
    reader.onerror = () => finish(reader.error || new Error('Không đọc được tệp. Hãy chọn lại tệp.'));
    reader.onabort = () => finish(new DOMException('Đã hủy đọc tệp.', 'AbortError'));
    try { reader.readAsDataURL(file); } catch (error) { finish(error); }
  });
}
