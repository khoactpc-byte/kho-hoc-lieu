export function stableRecordId(kind, identity, year = '', campus = '') {
  const raw = JSON.stringify([kind, identity, year, campus].map(value => String(value ?? '').trim()));
  if (!String(identity || '').trim()) throw new Error('Thiếu mã hồ sơ ổn định để tránh tạo trùng.');
  const result = [...new TextEncoder().encode(raw)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (result.length > 1500) throw new Error('Mã hồ sơ quá dài. Cần sử dụng mã định danh ngắn hơn.');
  return result;
}
