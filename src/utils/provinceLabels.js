const CENTRAL_CITY_NAMES = new Set([
  'ha noi',
  'hai phong',
  'hue',
  'da nang',
  'ho chi minh',
  'can tho'
]);

// Only format option text; keep the original value for saved addresses and commune lookups.
export function provinceOptionLabel(rawValue) {
  const name = String(rawValue ?? '').replace(/\s+/g, ' ').trim();
  if (!name || /^(?:tỉnh|thành phố)\s+/i.test(name) || /^tp(?:\.|\s)/i.test(name)) return name;

  const normalized = name.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
  return `${CENTRAL_CITY_NAMES.has(normalized) ? 'Thành phố' : 'Tỉnh'} ${name}`;
}

// Normalize labels used for browsing/filtering only. Saved province values are
// kept verbatim because huyện/xã directories use the original province key.
export function provinceFilterLabel(rawValue) {
  const text = String(rawValue ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const name = text
    .replace(/^(?:tỉnh|thành phố)\s+/iu, '')
    .replace(/^tp\.?\s+/iu, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/(^|[\s-])(\p{L})/gu, (_, separator, letter) => `${separator}${letter.toLocaleUpperCase('vi-VN')}`);
  return provinceOptionLabel(name);
}

export function provinceFilterKey(rawValue) {
  return provinceFilterLabel(rawValue)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}
