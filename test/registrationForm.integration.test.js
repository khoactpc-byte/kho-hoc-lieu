import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';

test('registration preserves fields, groups campus/class and phone correctly, retries the same request and submits the admin year', async () => {
  const directory = await mkdtemp(resolve('node_modules/.registration-form-test-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://registration.test/#/dang-ky', pretendToBeVisual: true });
  const document = dom.window.document;
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'requestAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT', '__registrationFixture'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, requestAnimationFrame: callback => callback(), IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.scrollTo = () => {};
  dom.window.requestAnimationFrame = callback => callback();
  const config = { currentSchoolYear: '2026-2027', publicApiVersion: 1, schools: [{ key: 'nan', name: 'THCS Nguyễn An Ninh', suffix: 'A' }, { key: 'tqk', name: 'THCS Trần Quang Khải', suffix: 'B' }] };
  const sent = [];
  let resolveSubmission, rejectSubmission;
  globalThis.__registrationFixture = {
    bootstrap: async () => ({ success: true, revision: 'one', config, provinces: ['Tỉnh A'], birthProvinces: ['Tỉnh A'] }),
    birth: async province => ({ success: true, districts: ['Huyện A'], communesByDistrict: { [`${province}|||Huyện A`]: ['Xã A'] } }),
    address: async () => ({ success: true, items: ['Xã A'] }),
    submit: (...args) => { sent.push(args); return new Promise((resolve, reject) => { resolveSubmission = resolve; rejectSubmission = reject; }); }
  };
  let root;
  try {
    const outfile = join(directory, 'form.mjs');
    await build({ entryPoints: ['src/features/registration/RegistrationPage.jsx'], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' },
      plugins: [{ name: 'registration-fixture', setup(builder) {
        builder.onResolve({ filter: /registrationApi$/ }, () => ({ path: 'api', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const loadRegistrationBootstrap=(...a)=>globalThis.__registrationFixture.bootstrap(...a); export const loadBirthProvince=(...a)=>globalThis.__registrationFixture.birth(...a); export const loadAddressCommunes=(...a)=>globalThis.__registrationFixture.address(...a); export const submitRegistration=(...a)=>globalThis.__registrationFixture.submit(...a);' }));
      } }] });
    const { default: Page } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    root = createRoot(document.getElementById('root'));
    await act(async () => { root.render(createElement(Page)); });
    const input = name => document.querySelector(`[name="${name}"]`);
    const set = async (name, value) => act(async () => {
      const element = input(name), prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
    const sendForm = () => act(async () => { document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
    assert.equal(document.querySelector('[name="tinhTrangHocSinh"]'), null, 'year has no student input');
    assert.equal(document.querySelector('aside'), null, 'the sidebar does not consume form width');
    assert.equal(input('soDienThoai').closest('section').querySelector('h3').textContent, 'Thông tin cá nhân');
    assert.equal(input('lopHoc').closest('section'), input('coSoHoc').closest('section'));
    await set('coSoHoc', 'nan');
    await set('lopHoc', '6A');
    await set('coSoHoc', 'tqk');
    assert.equal(input('lopHoc').value, '', 'switching campus clears the old class');
    await set('lopHoc', '6B');
    for (const [key, value] of Object.entries({ hoVaTen: 'Nguyễn Văn An', ngaySinh: '2014-01-20', gioiTinh: 'Nam', soDienThoai: '0900000000', maDinhDanh: 'học sinh chưa có' })) await set(key, value);
    await set('lopHoc', '7B');
    assert.ok(input('hocLucLop6')); assert.ok(input('hanhKiemLop6')); assert.equal(input('hocLucLop7'), null);
    assert.equal(input('hocLucLop6').required, true); assert.equal(input('hanhKiemLop6').required, true);
    await sendForm();
    assert.equal(document.querySelector('.reg-form-heading h2').textContent, 'Thông tin học sinh', 'prior results are required immediately after choosing a class');
    await set('hocLucLop6', 'Khá'); await set('hanhKiemLop6', 'Tốt');
    await set('lopHoc', '8B');
    assert.equal(input('hocLucLop6').value, 'Khá'); assert.ok(input('hocLucLop7')); assert.equal(input('hocLucLop8'), null);
    await sendForm();
    assert.equal(document.querySelector('.reg-form-heading h2').textContent, 'Thông tin học sinh', 'grade 8 also requires grade 7 results');
    await set('hocLucLop7', 'Tốt'); await set('hanhKiemLop7', 'Khá');
    await set('lopHoc', '9B');
    assert.equal(document.querySelectorAll('.reg-academic-list select').length, 6);
    await set('hocLucLop8', 'Khá'); await set('hanhKiemLop8', 'Tốt');
    for (const entry of ['5B', '6B']) { await set('lopHoc', entry); assert.equal(document.querySelector('.reg-academic-list'), null); }
    await set('lopHoc', '8B');
    assert.equal(document.querySelectorAll('.reg-academic-list select').length, 4);
    await sendForm();
    assert.equal(document.querySelector('.reg-form-heading h2').textContent, 'Khai sinh & địa chỉ');
    await act(async () => { [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Quay lại').click(); });
    assert.equal(input('hoVaTen').value, 'Nguyễn Văn An'); assert.equal(input('lopHoc').value, '8B');
    assert.equal(input('hocLucLop7').value, 'Tốt', 'previous results survive moving between steps');
    await sendForm();
    for (const prefix of ['birth', 'birthRegistration', 'hometown']) {
      await act(async () => { input(`${prefix}Province`).focus(); });
      await act(async () => { input(`${prefix}Province`).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      await set(`${prefix}District`, 'Huyện A'); await set(`${prefix}Ward`, 'Xã A');
    }
    await act(async () => { input('tinhThanh').focus(); });
    await act(async () => { input('tinhThanh').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await set('xaPhuong', 'Xã A'); await set('soNha', 'Số 12');
    await act(async () => { document.querySelector('input[type="checkbox"]').click(); });
    assert.equal(input('tinhThanhHK').value, 'Tỉnh A'); assert.equal(input('xaPhuongHK').value, 'Xã A'); assert.equal(input('soNhaHK').value, 'Số 12');
    await sendForm();
    assert.equal(document.querySelector('.reg-form-heading h2').textContent, 'Gia đình');
    assert.equal(document.querySelector('.reg-academic-list'), null, 'academic results are not repeated in the family step');
    await set('tinhTrangTamTru', 'Chuẩn bị làm tạm trú'); await set('diXe', 'Không');
    await sendForm();
    assert.equal(document.querySelector('.reg-form-heading h2').textContent, 'Hồ sơ đính kèm');
    assert.equal(document.querySelector('input[aria-label="Căn cước công dân (CCCD)"]'), null);
    assert.match(document.querySelector('.reg-identity-note').textContent, /học sinh chưa có mã định danh/);
    for (const label of ['Giấy khai sinh', 'Ảnh chân dung', 'Học bạ']) await act(async () => {
      const element = document.querySelector(`input[aria-label="${label}"]`);
      Object.defineProperty(element, 'files', { configurable: true, value: [new File(['abc'], `${label}.jpg`, { type: 'image/jpeg', lastModified: 1 })] });
      element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await sendForm();
    assert.equal(document.querySelector('.reg-form-heading h2').textContent, 'Kiểm tra & gửi');
    assert.ok(document.querySelector('.reg-review').textContent.includes('2026-2027'));
    assert.match(document.querySelector('.reg-review').textContent, /Thông tin học tập các lớp trước/);
    assert.match(document.querySelector('.reg-review').textContent, /Học lực: Khá; hạnh kiểm: Tốt/);
    // An edit from no identity to a numeric identity must restore the required CCCD upload.
    await act(async () => { document.querySelector('.reg-review-group button').click(); });
    await set('maDinhDanh', '123456789012');
    await sendForm(); await sendForm(); await sendForm();
    assert.equal(document.querySelector('.reg-form-heading h2').textContent, 'Hồ sơ đính kèm');
    const identityInput = document.querySelector('input[aria-label="Căn cước công dân (CCCD)"]');
    assert.ok(identityInput); assert.equal(identityInput.getAttribute('aria-required'), 'true');
    await sendForm();
    assert.equal(document.querySelector('.reg-form-heading h2').textContent, 'Hồ sơ đính kèm', 'CCCD cannot be skipped when the identity exists');
    assert.ok(document.querySelector('[data-field="anhCanCuoc"] [role="alert"]'));
    await act(async () => {
      Object.defineProperty(identityInput, 'files', { configurable: true, value: [new File(['abc'], 'cccd.jpg', { type: 'image/jpeg' })] });
      identityInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await sendForm();
    await sendForm(); assert.equal(sent.length, 0, 'confirmation is required');
    await act(async () => { document.querySelector('input[type="checkbox"]').click(); });
    await sendForm();
    assert.equal(sent.length, 1); assert.equal(sent[0][0].tinhTrangHocSinh, '2026-2027'); assert.equal(sent[0][0].lopHoc, '8B');
    assert.equal(sent[0][0].hocLucLop6, 'Khá'); assert.equal(sent[0][0].hanhKiemLop6, 'Tốt');
    assert.equal(sent[0][0].hocLucLop7, 'Tốt'); assert.equal(sent[0][0].hanhKiemLop7, 'Khá');
    assert.equal(sent[0][0].hocLucLop8, undefined); assert.equal(sent[0][0].hanhKiemLop8, undefined, 'hidden results are excluded from the submitted entry grade');
    assert.equal(sent[0][0].maDinhDanh, '123456789012'); assert.equal(sent[0][1].anhCanCuoc.length, 1);
    assert.equal(document.querySelector('fieldset').disabled, true);
    await sendForm(); assert.equal(sent.length, 1, 'double submit cannot start another request');
    await act(async () => { rejectSubmission(new Error('Mất kết nối thử nghiệm')); });
    assert.ok(document.querySelector('[role="alert"]').textContent.includes('Mất kết nối'));
    await sendForm(); assert.equal(sent.length, 2);
    assert.equal(sent[1][2], sent[0][2], 'retry reuses the same request ID');
    await act(async () => { resolveSubmission({ success: true, schoolYear: '2026-2027' }); });
    assert.ok(document.querySelector('.reg-success').textContent.includes('Đăng ký thành công!'));
    assert.equal(dom.window.localStorage.length, 0, 'personal data is not persisted in browser storage');
  } finally {
    if (root) await act(async () => { root.unmount(); });
    dom.window.close();
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    await rm(directory, { recursive: true, force: true });
  }
});

test('registration transport encodes files, omits optional identity images and checks the actual POST response', async () => {
  const directory = await mkdtemp(resolve('node_modules/.registration-transport-test-'));
  const previousFetch = globalThis.fetch, previousReader = globalThis.FileReader;
  const requests = [];
  globalThis.FileReader = class {
    readAsDataURL(file) {
      file.arrayBuffer().then(bytes => { this.result = `data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`; this.onload(); }).catch(() => this.onerror());
    }
  };
  globalThis.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ success: true, schoolYear: '2026-2027' }) }; };
  try {
    const outfile = join(directory, 'transport.mjs');
    await build({ entryPoints: ['src/features/registration/registrationApi.js'], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
    const { submitRegistration } = await import(pathToFileURL(outfile));
    const image = new File(['abc'], 'anh.jpg', { type: 'image/jpeg' });
    const progress = [];
    const result = await submitRegistration({ maDinhDanh: 'học sinh chưa có' }, { anhKhaiSinh: [image], anhCanCuoc: [image], anhChanDung: [image], anhHocBa: [image] }, 'same-request', message => progress.push(message));
    assert.equal(result.success, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.headers['Content-Type'], 'text/plain;charset=utf-8');
    const payload = JSON.parse(requests[0].options.body);
    assert.equal(payload.requestId, 'same-request'); assert.equal(payload.action, 'submitRegistration');
    assert.equal(payload.files.anhKhaiSinh[0].bytes, 'YWJj'); assert.equal(payload.files.anhCanCuoc, undefined);
    assert.equal(progress.length, 4);
    await submitRegistration({ maDinhDanh: '123456789012' }, { anhCanCuoc: [image] }, 'with-identity');
    assert.equal(JSON.parse(requests[1].options.body).files.anhCanCuoc[0].bytes, 'YWJj');
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: false, message: 'Năm học vừa thay đổi' }) });
    await assert.rejects(submitRegistration({}, {}, 'retry'), /Năm học vừa thay đổi/);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(submitRegistration({}, {}, 'retry'), /Kết nối bị gián đoạn/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousReader === undefined) delete globalThis.FileReader; else globalThis.FileReader = previousReader;
    await rm(directory, { recursive: true, force: true });
  }
});
