import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

for (const path of ['apps-script/code_hoclieu.gs', 'apps-script/dang-ky-hoc-sinh/code_dangky.gs']) {
  new vm.Script(await readFile(path, 'utf8'), { filename: path });
}
const registrationHtml = await readFile('apps-script/dang-ky-hoc-sinh/Index.html', 'utf8');
for (const [index, script] of [...registrationHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
  new vm.Script(script[1], { filename: `registration-Index-script-${index + 1}` });
}
JSON.parse(await readFile('apps-script/dang-ky-hoc-sinh/appsscript.json', 'utf8'));
JSON.parse(await readFile('firebase.secure-ready.json', 'utf8'));
JSON.parse(await readFile('firestore.indexes.secure-ready.json', 'utf8'));
console.log('Cú pháp hai Apps Script, JavaScript biểu mẫu đăng ký, manifest và cấu hình triển khai JSON hợp lệ. Chưa gọi dịch vụ Google.');
