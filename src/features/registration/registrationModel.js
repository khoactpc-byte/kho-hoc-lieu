// Field names match the existing Apps Script form and Sheet mapping.
export const REGISTRATION_STEPS = ['Thông tin học sinh', 'Khai sinh & địa chỉ', 'Gia đình', 'Hồ sơ đính kèm', 'Kiểm tra & gửi'];
export const RESULT_OPTIONS = ['Tốt', 'Khá', 'Đạt'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
export const FILE_FIELDS = [
  { key: 'anhKhaiSinh', label: 'Giấy khai sinh', hint: 'Ảnh chụp rõ nội dung, tối đa 2 ảnh.', limit: 2 },
  { key: 'anhCanCuoc', label: 'Căn cước công dân (CCCD)', hint: 'Mặt trước và mặt sau, tối đa 2 ảnh.', limit: 2 },
  { key: 'anhChanDung', label: 'Ảnh chân dung', hint: 'Một ảnh thẻ hoặc ảnh chân dung rõ mặt.', limit: 1 },
  { key: 'anhHocBa', label: 'Học bạ', hint: 'Chọn các trang học bạ bằng ảnh hoặc PDF.', limit: 20, pdf: true }
];
export const emptyRegistration = () => ({ coSoHoc: '', lopHoc: '', hoVaTen: '', ngaySinh: '', gioiTinh: '', maDinhDanh: '', soDienThoai: '',
  birthPlaceName: '', birthProvince: '', birthDistrict: '', birthWard: '', birthRegistrationProvince: '', birthRegistrationDistrict: '', birthRegistrationWard: '',
  hometownProvince: '', hometownDistrict: '', hometownWard: '', tinhThanh: '', xaPhuong: '', soNha: '', tinhThanhHK: '', xaPhuongHK: '', soNhaHK: '',
  tenCha: '', namSinhCha: '', ngheNghiepCha: '', sdtCha: '', tenMe: '', namSinhMe: '', ngheNghiepMe: '', sdtMe: '', tinhTrangTamTru: '', diXe: '' });
export const normalizeSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
// Accept the previous phrase for existing drafts; all new submissions use the current wording.
export const hasNoIdentity = value => ['hoc sinh chua co', 'be chua co'].includes(normalizeSearch(value).replace(/\s+/g, ' '));
export const previousGrades = className => {
  const grade = Number(String(className || '').match(/^\d+/)?.[0] || 0);
  return grade >= 7 && grade <= 9 ? Array.from({ length: grade - 6 }, (_, index) => index + 6) : [];
};
export const formatFileSize = size => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;

export function validateFiles(files, values) {
  const errors = {};
  let total = 0;
  for (const spec of FILE_FIELDS) {
    const list = files[spec.key] || [];
    if (spec.key === 'anhCanCuoc' && hasNoIdentity(values.maDinhDanh)) continue;
    if (!list.length) errors[spec.key] = `Vui lòng đính kèm ${spec.label.toLocaleLowerCase('vi-VN')}.`;
    else if (list.length > spec.limit) errors[spec.key] = `Chọn tối đa ${spec.limit} tệp.`;
    else if (list.some(file => !/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(file.type) || (!spec.pdf && file.type === 'application/pdf'))) errors[spec.key] = 'Chọn ảnh JPG, PNG, WebP, HEIC hoặc PDF cho học bạ.';
    else if (list.some(file => !file.size || file.size > MAX_FILE_BYTES)) errors[spec.key] = 'Mỗi tệp cần có nội dung và không vượt quá 10 MB.';
    total += list.reduce((sum, file) => sum + file.size, 0);
  }
  if (total > MAX_TOTAL_BYTES) errors.files = 'Tổng hồ sơ vượt 25 MB. Vui lòng chọn tệp nhỏ hơn.';
  return errors;
}

export function validateStep(step, values, files, config) {
  const errors = {};
  const required = names => names.forEach(name => { if (!String(values[name] || '').trim()) errors[name] = 'Vui lòng điền thông tin này.'; });
  if (step === 0) {
    required(['coSoHoc', 'lopHoc', 'hoVaTen', 'ngaySinh', 'gioiTinh', 'maDinhDanh', 'soDienThoai']);
    const school = config?.schools?.find(item => item.key === values.coSoHoc);
    if (!school) errors.coSoHoc = 'Vui lòng chọn cơ sở đăng ký.';
    if (school && !new RegExp(`^[1-9]${school.suffix}$`).test(values.lopHoc)) errors.lopHoc = 'Vui lòng chọn lớp thuộc cơ sở này.';
    if (values.maDinhDanh && !/^\d{12}$/.test(values.maDinhDanh.trim()) && !hasNoIdentity(values.maDinhDanh)) errors.maDinhDanh = 'Nhập đủ 12 số hoặc ghi “học sinh chưa có”.';
    if (values.soDienThoai && !/^(?:0\d{9}|\+84\d{9})$/.test(values.soDienThoai.replace(/[\s.-]/g, ''))) errors.soDienThoai = 'Nhập số điện thoại 10 số, hoặc số bắt đầu bằng +84.';
    const date = new Date(`${values.ngaySinh}T00:00:00`);
    if (values.ngaySinh && (!Number.isFinite(date.getTime()) || date > new Date() || date.getFullYear() < 1900)) errors.ngaySinh = 'Vui lòng kiểm tra lại ngày sinh.';
    previousGrades(values.lopHoc).forEach(grade => {
      if (!RESULT_OPTIONS.includes(values[`hocLucLop${grade}`])) errors[`hocLucLop${grade}`] = `Vui lòng chọn học lực lớp ${grade}.`;
      if (!RESULT_OPTIONS.includes(values[`hanhKiemLop${grade}`])) errors[`hanhKiemLop${grade}`] = `Vui lòng chọn hạnh kiểm lớp ${grade}.`;
    });
  }
  if (step === 1) required(['birthProvince', 'birthDistrict', 'birthWard', 'birthRegistrationProvince', 'birthRegistrationDistrict', 'birthRegistrationWard', 'hometownProvince', 'hometownDistrict', 'hometownWard', 'tinhThanh', 'xaPhuong', 'tinhThanhHK', 'xaPhuongHK']);
  if (step === 2) {
    required(['tinhTrangTamTru', 'diXe']);
    ['namSinhCha', 'namSinhMe'].forEach(key => { if (values[key] && (!/^\d{4}$/.test(values[key]) || Number(values[key]) < 1900 || Number(values[key]) > new Date().getFullYear())) errors[key] = 'Nhập năm sinh hợp lệ gồm 4 số.'; });
    ['sdtCha', 'sdtMe'].forEach(key => { if (values[key] && !/^(?:0\d{9}|\+84\d{9})$/.test(values[key].replace(/[\s.-]/g, ''))) errors[key] = 'Vui lòng kiểm tra lại số điện thoại.'; });
  }
  if (step === 3) Object.assign(errors, validateFiles(files, values));
  return errors;
}

export function registrationPayload(values, config) {
  const result = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value || '').trim()]));
  result.hoVaTen = result.hoVaTen.toLocaleUpperCase('vi-VN');
  result.maDinhDanh = hasNoIdentity(result.maDinhDanh) ? 'học sinh chưa có' : result.maDinhDanh;
  result.soDienThoai = result.soDienThoai.replace(/[\s.-]/g, '');
  result.tinhTrangHocSinh = config.currentSchoolYear;
  // Only results for grades preceding the selected entry grade belong in this application.
  for (let grade = 6; grade <= 9; grade++) if (!previousGrades(result.lopHoc).includes(grade)) { delete result[`hocLucLop${grade}`]; delete result[`hanhKiemLop${grade}`]; }
  return result;
}
