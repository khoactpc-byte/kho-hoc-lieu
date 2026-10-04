import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('account form changes campus suggestions, accepts unaccented input and preserves edited usernames', async () => {
  const directory = await mkdtemp(resolve('node_modules/.teacher-account-test-'));
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = windowObject;
  globalThis.document = windowObject.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const requests = [];
  globalThis.__teacherAccountsTest = {
    post: async request => {
      requests.push(request);
      if (request.action === 'saveTeacherAccount') return { status: 'success' };
      assert.equal(request.action, 'listTeacherAccounts', 'choosing a suggestion must not submit the account form');
      return { status: 'success', accounts: [{ id: 'existing', username: 'login_giu_nguyen', fullName: 'Tên hiện tại', schoolCode: 'NAN', grades: ['6'], subjects: ['Toán'], isActive: true }] };
    }
  };
  let root;
  try {
    const outfile = join(directory, 'form.mjs');
    await build({ entryPoints: ['src/components/TeacherAccountManager.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'fake-account-api', setup(builder) {
        builder.onResolve({ filter: /utils\/helpers$/ }, () => ({ path: 'helpers', namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: 'export const postAppsScript=globalThis.__teacherAccountsTest.post;', loader: 'js' }));
      } }] });
    const TeacherAccountManager = (await import(pathToFileURL(outfile))).default;
    const { createRoot } = await import('react-dom/client');
    root = createRoot(windowObject.document.getElementById('root'));
    await act(async () => root.render(React.createElement(TeacherAccountManager, {
      nanTeachers: [{ name: 'Đặng Thị Ánh', subject: 'Toán' }, { name: 'Đặng Thị Ánh', subject: 'Chủ nhiệm' }, { name: 'Phạm Anh Khoa', subject: 'Toán' }],
      tqkTeachers: [{ name: 'Nguyễn Văn An', subject: 'Toán' }, { name: 'Lê Thị Bình', subject: 'Tiếng Anh' }]
    })));
    const input = () => windowObject.document.querySelector('[role="combobox"]');
    const options = () => [...windowObject.document.querySelectorAll('[role="option"]')].map(item => item.textContent.trim());
    const username = () => windowObject.document.querySelector('input[autocomplete="username"]').value;
    const password = () => windowObject.document.querySelector('input[autocomplete="new-password"]');
    const type = async text => act(async () => {
      Object.getOwnPropertyDescriptor(windowObject.HTMLInputElement.prototype, 'value').set.call(input(), text);
      input().dispatchEvent(new windowObject.Event('input', { bubbles: true }));
    });
    const click = async element => act(async () => element.dispatchEvent(new windowObject.MouseEvent('click', { bubbles: true })));
    const key = async value => act(async () => input().dispatchEvent(new windowObject.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));

    assert.equal(password().value, '123456');
    assert.equal(password().type, 'text');
    assert.equal(password().minLength, 6);
    await click(windowObject.document.querySelector('button[aria-label="Ẩn mật khẩu"]'));
    assert.equal(password().type, 'password');
    assert.equal(password().value, '123456');
    await click(windowObject.document.querySelector('button[aria-label="Hiện mật khẩu"]'));
    assert.equal(password().type, 'text');

    await act(async () => input().focus());
    assert.deepEqual(options(), ['Đặng Thị Ánh', 'Phạm Anh Khoa']);
    await type('dang thi anh');
    assert.deepEqual(options(), ['Đặng Thị Ánh']);
    await click(windowObject.document.querySelector('[role="option"]'));
    assert.equal(input().value, 'Đặng Thị Ánh');
    assert.equal(username(), 'anh');
    assert.equal(input().getAttribute('aria-expanded'), 'false');
    await click(input());
    assert.deepEqual(options(), ['Đặng Thị Ánh'], 'the focused input can reopen suggestions after selection');

    const tqkButton = [...windowObject.document.querySelectorAll('form button')].find(item => item.textContent === 'THCS Trần Quang Khải');
    await click(tqkButton);
    assert.equal(tqkButton.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(options(), [], 'changing campus closes stale suggestions');
    await act(async () => input().focus());
    await type('van an');
    assert.deepEqual(options(), ['Nguyễn Văn An']);
    await key('ArrowDown');
    assert.equal(input().getAttribute('aria-activedescendant'), windowObject.document.querySelector('[role="option"]').id);
    await key('Enter');
    assert.equal(input().value, 'Nguyễn Văn An');
    assert.equal(username(), 'an');
    assert.deepEqual(options(), []);
    await type('le thi');
    assert.deepEqual(options(), ['Lê Thị Bình']);
    await key('Escape');
    assert.deepEqual(options(), []);
    await type('Giáo viên mới chưa có danh sách');
    assert.deepEqual(options(), []);
    assert.match(windowObject.document.querySelector('[role="status"]').textContent, /vẫn có thể nhập tên mới/);
    await act(async () => input().blur());
    assert.equal(input().value, 'Giáo viên mới chưa có danh sách');

    await click(windowObject.document.querySelector('button[title="Sửa phân công hoặc đặt lại mật khẩu"]'));
    assert.equal(password().value, '');
    assert.equal(password().required, false);
    assert.equal(password().type, 'password');
    await act(async () => input().focus());
    await type('pham anh');
    assert.deepEqual(options(), ['Phạm Anh Khoa']);
    await key('ArrowUp');
    await key('Enter');
    assert.equal(input().value, 'Phạm Anh Khoa');
    assert.equal(username(), 'login_giu_nguyen');
    assert.equal(requests.length, 1);

    await click([...windowObject.document.querySelectorAll('form button')].find(item => item.textContent === 'Tạo mới'));
    assert.equal(password().value, '123456');
    assert.equal(password().type, 'text');
    await type('Giáo viên thử nghiệm');
    for (const text of ['Khối 6', 'Toán']) await click([...windowObject.document.querySelectorAll('form button')].find(item => item.textContent === text));
    await act(async () => windowObject.document.querySelector('form').dispatchEvent(new windowObject.Event('submit', { bubbles: true, cancelable: true })));
    const saved = requests.find(request => request.action === 'saveTeacherAccount');
    assert.equal(saved.password, '123456');
    assert.deepEqual(saved.grades, ['6']);
    assert.deepEqual(saved.subjects, ['Toán']);
    assert.equal(password().value, '123456');
    assert.equal(password().type, 'text');
  } finally {
    if (root) await act(async () => root.unmount());
    windowObject.close();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    if (previousActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    delete globalThis.__teacherAccountsTest;
    await rm(directory, { recursive: true, force: true });
  }
});
