import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

for (const path of ['apps-script/code_hoclieu.gs', 'apps-script/code_chambai.gs', 'apps-script/dang-ky-hoc-sinh/code_dangky.gs', 'apps-script/dang-ky-hoc-sinh/PublicRegistration.gs']) {
  new vm.Script(await readFile(path, 'utf8'), { filename: path });
}
for (const name of ['Index', 'Javascript']) {
  const registrationHtml = await readFile(`apps-script/dang-ky-hoc-sinh/${name}.html`, 'utf8');
  for (const [index, script] of [...registrationHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
    new vm.Script(script[1], { filename: `registration-${name}-script-${index + 1}` });
  }
}
new vm.Script((await Promise.all(['code_dangky', 'PublicRegistration'].map(name => readFile(`apps-script/dang-ky-hoc-sinh/${name}.gs`, 'utf8')))).join('\n'), { filename: 'registration-combined-project' });
JSON.parse(await readFile('apps-script/dang-ky-hoc-sinh/appsscript.json', 'utf8'));
JSON.parse(await readFile('firebase.secure-ready.json', 'utf8'));
JSON.parse(await readFile('firestore.indexes.secure-ready.json', 'utf8'));
console.log('Cú pháp hai Apps Script, JavaScript biểu mẫu đăng ký, manifest và cấu hình triển khai JSON hợp lệ. Chưa gọi dịch vụ Google.');
