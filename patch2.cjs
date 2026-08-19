
const fs = require('fs');
const file = 'src/features/tran-hung-dao/thdDefaults.js';
let content = fs.readFileSync(file, 'utf8');

const target1 = '  { name: \'Toán\', shortName: \'Toán\', periods: \'4\' },\n  { name: \'Ngữ văn\', shortName: \'Văn\', periods: \'4\' },\n  { name: \'Tiếng Anh\', shortName: \'Tiếng Anh\', periods: \'3\' },';
const repl1 = '  { name: \'Toán\', shortName: \'Toán\', periods: \'4\' },\n  { name: \'Toán (TS 10)\', shortName: \'Toán (TS 10)\', periods: \'2\' },\n  { name: \'Toán (TS10)\', shortName: \'Toán (TS 10)\', periods: \'2\' },\n  { name: \'Ngữ văn\', shortName: \'Văn\', periods: \'4\' },\n  { name: \'Ngữ văn (TS 10)\', shortName: \'Văn (TS 10)\', periods: \'2\' },\n  { name: \'Ngữ văn (TS10)\', shortName: \'Văn (TS 10)\', periods: \'2\' },\n  { name: \'Tiếng Anh\', shortName: \'Tiếng Anh\', periods: \'3\' },\n  { name: \'Tiếng Anh (TS 10)\', shortName: \'Anh (TS 10)\', periods: \'2\' },\n  { name: \'Tiếng Anh (TS10)\', shortName: \'Anh (TS 10)\', periods: \'2\' },';

content = content.replace(target1, repl1);

const target2 = '  { value: \'team-tin-gdtc\', label: \'Tổ Tin-GDTC (Tin; GDTC)\' },\n  { value: \'check-error\', label: \'Kiểm tra sai\' },';
const repl2 = '  { value: \'team-tin-gdtc\', label: \'Tổ Tin-GDTC (Tin; GDTC)\' },\n  { value: \'subject-toan\', label: \'Môn Toán\' },\n  { value: \'subject-van\', label: \'Môn Văn\' },\n  { value: \'subject-anh\', label: \'Môn Tiếng Anh\' },\n  { value: \'subject-khtn\', label: \'Môn KHTN\' },\n  { value: \'subject-lsdl\', label: \'Môn LS&ĐL\' },\n  { value: \'subject-gdcd\', label: \'Môn GDCD\' },\n  { value: \'subject-gddp\', label: \'Môn GDĐP\' },\n  { value: \'subject-cn\', label: \'Môn Công nghệ\' },\n  { value: \'subject-tin\', label: \'Môn Tin học\' },\n  { value: \'subject-mt\', label: \'Môn Mỹ thuật\' },\n  { value: \'subject-an\', label: \'Môn Âm nhạc\' },\n  { value: \'subject-gdtc\', label: \'Môn GDTC\' },\n  { value: \'subject-hdtn\', label: \'Môn HĐTN,HN\' },\n  { value: \'subject-ts10\', label: \'Môn ôn thi TS10\' },\n  { value: \'check-error\', label: \'Kiểm tra sai\' },';

content = content.replace(target2, repl2);

fs.writeFileSync(file, content, 'utf8');
console.log('Done patch 2');

