const fs = require('fs');
let content = fs.readFileSync('c:/Users/khoac/kho-hoc-lieu/src/features/tran-hung-dao/thdDefaults.js', 'utf8');

const subjects = [
  { value: 'subject-KHTN', label: 'KHTN' },
  { value: 'subject-LS&ĐL', label: 'LS&ĐL' },
  { value: 'subject-GDCD', label: 'GDCD' },
  { value: 'subject-GDĐP', label: 'GDĐP' },
  { value: 'subject-HĐTT', label: 'HĐTT' },
  { value: 'subject-Toán', label: 'Toán' },
  { value: 'subject-Toán (TS 10)', label: 'Toán (TS 10)' },
  { value: 'subject-Văn', label: 'Văn' },
  { value: 'subject-Văn (TS 10)', label: 'Văn (TS 10)' },
  { value: 'subject-Anh (TS 10)', label: 'Anh (TS 10)' },
  { value: 'subject-C nghệ', label: 'C nghệ' },
  { value: 'subject-Chủ nhiệm', label: 'Chủ nhiệm' },
];

let subjectStr = subjects.map(s => `  { value: '${s.value}', label: '${s.label}' },`).join('\n');

content = content.replace(/export const TEACHING_FILTER_OPTIONS = \[\r?\n/, `export const TEACHING_FILTER_OPTIONS = [\n${subjectStr}\n`);
fs.writeFileSync('c:/Users/khoac/kho-hoc-lieu/src/features/tran-hung-dao/thdDefaults.js', content, 'utf8');
