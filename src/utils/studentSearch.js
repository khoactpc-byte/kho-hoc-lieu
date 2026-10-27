export const EMPTY_STUDENT_SEARCH = { mode: 'all', rules: [] };

export const STUDENT_SEARCH_TEXT_FIELDS = new Set(['fullName', 'accessCode', 'identityCode', 'phone', 'address', 'householdAddress', 'birthPlaceName', 'fatherName', 'motherName', 'fatherPhone', 'motherPhone']);
export const STUDENT_SEARCH_MISSING = '__SEARCH_MISSING__';
export const STUDENT_SEARCH_PRESENT = '__SEARCH_PRESENT__';

export function studentSearchFormDraft(search) {
  return Object.fromEntries((search?.rules || []).map(rule => [rule.field,
    rule.operator === 'empty' ? STUDENT_SEARCH_MISSING : rule.operator === 'filled' ? STUDENT_SEARCH_PRESENT : rule.value]));
}

export function studentSearchFromForm(draft, fields) {
  return { mode: 'all', rules: fields.flatMap(field => {
    const value = String(draft[field.key] ?? '').trim();
    if (!value) return [];
    const operator = value === STUDENT_SEARCH_MISSING ? 'empty' : value === STUDENT_SEARCH_PRESENT ? 'filled'
      : STUDENT_SEARCH_TEXT_FIELDS.has(field.key) ? 'contains' : 'equals';
    return [{ field: field.key, operator, value: ['empty', 'filled'].includes(operator) ? '' : value }];
  }) };
}

export const normalizeStudentSearch = value => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

export function studentSearchDate(value) {
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T)/);
  const vn = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const parts = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : vn ? [Number(vn[3]), Number(vn[2]), Number(vn[1])] : null;
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? year * 10000 + month * 100 + day : null;
}

export function studentSearchOperators(field = {}) {
  if (field.type === 'link') return [['filled', 'Đã có'], ['empty', 'Còn thiếu']];
  const operators = [['equals', 'Bằng'], ['notEquals', 'Khác']];
  if (!['date', 'number'].includes(field.type)) operators.unshift(['contains', 'Có chứa'], ['notContains', 'Không chứa'], ['startsWith', 'Bắt đầu bằng']);
  else operators.push(['gte', field.type === 'date' ? 'Từ ngày' : 'Lớn hơn hoặc bằng'], ['lte', field.type === 'date' ? 'Đến ngày' : 'Nhỏ hơn hoặc bằng'], ['between', 'Trong khoảng']);
  return [...operators, ['empty', 'Còn trống'], ['filled', 'Đã có thông tin']];
}

export function studentSearchRuleError(rule, fields) {
  const field = fields.find(item => item.key === rule.field);
  if (!field || !studentSearchOperators(field).some(([key]) => key === rule.operator)) return 'Chọn thông tin và cách lọc hợp lệ.';
  if (['empty', 'filled'].includes(rule.operator)) return '';
  const values = rule.operator === 'between' ? [rule.value, rule.valueTo] : [rule.value];
  if (values.some(value => !String(value ?? '').trim())) return 'Nhập đủ giá trị cần lọc.';
  if (field.type === 'date' && values.some(value => studentSearchDate(value) == null)) return 'Nhập ngày hợp lệ.';
  if (field.type === 'number' && values.some(value => !Number.isFinite(Number(value)))) return 'Nhập số hợp lệ.';
  const convert = field.type === 'date' ? studentSearchDate : Number;
  if (rule.operator === 'between' && convert(values[0]) > convert(values[1])) return 'Giá trị đầu phải nhỏ hơn hoặc bằng giá trị cuối.';
  return '';
}

export function matchesStudentSearch(student, search, fields, getValue = (row, field) => row[field.key]) {
  if (!search?.rules?.length) return true;
  const match = rule => {
    if (studentSearchRuleError(rule, fields)) return false;
    const field = fields.find(item => item.key === rule.field);
    const raw = getValue(student, field);
    const text = normalizeStudentSearch(raw);
    if (rule.operator === 'empty') return !text;
    if (rule.operator === 'filled') return Boolean(text);
    const target = normalizeStudentSearch(rule.value);
    if (rule.operator === 'contains') return text.includes(target);
    if (rule.operator === 'notContains') return !text.includes(target);
    if (rule.operator === 'startsWith') return text.startsWith(target);
    const convert = field.type === 'date' ? studentSearchDate : field.type === 'number'
      ? value => String(value ?? '').trim() && Number.isFinite(Number(value)) ? Number(value) : null : normalizeStudentSearch;
    const value = convert(raw), expected = convert(rule.value);
    if (value == null) return false;
    if (rule.operator === 'equals') return value === expected;
    if (rule.operator === 'notEquals') return value !== expected;
    if (rule.operator === 'gte') return value >= expected;
    if (rule.operator === 'lte') return value <= expected;
    if (rule.operator === 'between') return value >= expected && value <= convert(rule.valueTo);
    return false;
  };
  return search.mode === 'any' ? search.rules.some(match) : search.rules.every(match);
}
