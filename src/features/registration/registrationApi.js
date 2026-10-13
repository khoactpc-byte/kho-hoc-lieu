import { REGISTRATION_WEB_APP_URL } from '../../config/registration';
import { requestJsonp } from '../../services/jsonpClient';
import { FILE_FIELDS, hasNoIdentity } from './registrationModel';

export const loadRegistrationBootstrap = options => requestJsonp(REGISTRATION_WEB_APP_URL, { action: 'locationBootstrap' }, { timeoutMs: 20000, ...options });
export const loadBirthProvince = province => requestJsonp(REGISTRATION_WEB_APP_URL, { action: 'birthPlaceProvince', province }, { timeoutMs: 20000 });
export const loadAddressCommunes = province => requestJsonp(REGISTRATION_WEB_APP_URL, { action: 'communes', province }, { timeoutMs: 20000 })
  .then(data => ({ ...data, success: data.success !== false && Array.isArray(data.items) }));

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Chưa đọc được tệp ${file.name}. Vui lòng chọn lại.`));
    reader.onload = () => resolve({ name: file.name, type: file.type, bytes: String(reader.result).split(',')[1] });
    reader.readAsDataURL(file);
  });
}

export async function submitRegistration(form, files, requestId, onProgress = () => {}) {
  const encoded = {};
  const specs = FILE_FIELDS.filter(spec => !(spec.key === 'anhCanCuoc' && hasNoIdentity(form.maDinhDanh)));
  const total = specs.reduce((sum, spec) => sum + (files[spec.key]?.length || 0), 0);
  let done = 0;
  // Read one file at a time to keep memory usage predictable on phones.
  for (const spec of specs) {
    encoded[spec.key] = [];
    for (const file of files[spec.key] || []) {
      encoded[spec.key].push(await readFile(file));
      onProgress(`Đang chuẩn bị hồ sơ (${++done}/${total} tệp)…`);
    }
  }
  onProgress('Đang gửi và lưu hồ sơ. Vui lòng giữ trang này mở…');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(REGISTRATION_WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'submitRegistration', form, files: encoded, requestId }), signal: controller.signal, redirect: 'follow' });
    if (!response.ok) throw new Error('Máy chủ chưa phản hồi. Vui lòng thử gửi lại.');
    let result;
    try { result = await response.json(); } catch { throw new Error('Biểu mẫu đang được cập nhật. Vui lòng thử lại sau hoặc dùng biểu mẫu dự phòng.'); }
    if (!result.success) throw new Error(result.message || 'Chưa gửi được hồ sơ. Vui lòng thử lại.');
    return result;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Kết nối bị gián đoạn. Thông tin vẫn được giữ trên trang; bấm gửi lại để kiểm tra và hoàn tất cùng hồ sơ.', { cause: error });
    throw error;
  } finally { clearTimeout(timer); }
}
