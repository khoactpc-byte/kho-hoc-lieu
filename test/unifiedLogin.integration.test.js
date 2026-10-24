import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('unified dialog is keyboard-submittable and student passwords are edited only after selecting an account', async () => {
  const dir = await mkdtemp(resolve('node_modules/.unified-login-'));
  const page = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' }).window;
  const keys = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: page, document: page.document, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const outfile = join(dir, 'components.mjs');
    await build({ stdin: { contents: "export {default as Login} from './src/components/UnifiedLoginDialog.jsx'; export {default as Workspace} from './src/components/PasswordWorkspace.jsx'; export {default as Students} from './src/components/StudentAccountManager.jsx';", resolveDir: resolve('.') }, outfile,
      bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', define: { 'import.meta.env': '{}' } });
    const { Login, Workspace, Students } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    root = createRoot(page.document.getElementById('root'));
    let submissions = 0;
    const loginProps = { username: 'HS00123', password: 'fixture-only', onSubmit: () => { submissions++; }, onClose() {}, onRegister() {}, onUsernameChange() {}, onPasswordChange() {} };
    await act(async () => root.render(React.createElement(Login, loginProps)));
    assert.equal(page.document.querySelector('select'), null, 'no role selector');
    assert.equal(page.document.querySelector('[autocomplete="current-password"]').type, 'password');
    await act(async () => page.document.querySelector('form').dispatchEvent(new page.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(submissions, 1);
    await act(async () => root.render(React.createElement(Login, { ...loginProps, pending: true })));
    assert.equal(page.document.querySelector('.login-submit-button').disabled, true);
    const students = [{ id: 'old', accessCode: 'HS00123', fullName: 'Học sinh mẫu', className: '6A', schoolYear: '2025-2026' },
      { id: 'current', accessCode: 'HS00123', fullName: 'Học sinh mẫu', className: '7A', schoolYear: '2026-2027' }];
    const requests = [];
    let respond;
    const request = payload => { requests.push(payload); return new Promise(resolve => { respond = resolve; }); };
    const studentPanel = React.createElement(Students, { students, request });
    await act(async () => root.render(React.createElement(Workspace, { students: studentPanel }, React.createElement('p', null, 'Tài khoản giáo viên mẫu'))));
    assert.equal(page.document.querySelector('[aria-label="Tài khoản học sinh"]'), null, 'student panel mounts only when requested');
    const buttons = () => [...page.document.querySelectorAll('button')];
    await act(async () => buttons().find(button => button.textContent === 'Học sinh').click());
    assert.equal(page.document.querySelectorAll('tbody tr').length, 1, 'one account across historical profiles');
    assert.equal(page.document.querySelector('tbody').textContent.includes('7A'), true);
    assert.equal(requests.length, 0, 'listing uses the already loaded roster');
    await act(async () => buttons().find(button => button.textContent === 'Đổi mật khẩu').click());
    const input = page.document.querySelector('[autocomplete="new-password"]');
    const setter = Object.getOwnPropertyDescriptor(page.HTMLInputElement.prototype, 'value').set;
    await act(async () => { setter.call(input, 'fixture-new'); input.dispatchEvent(new page.Event('input', { bubbles: true })); });
    await act(async () => input.form.dispatchEvent(new page.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], { action: 'setStudentAccountPassword', accessCode: 'HS00123', newPassword: 'fixture-new' });
    await act(async () => respond({ status: 'success' }));
    assert.equal(page.document.querySelector('[autocomplete="new-password"]'), null);
    assert.equal(page.document.body.textContent.includes('fixture-new'), false);
    assert.equal(page.document.body.textContent.includes('Vừa đổi mật khẩu'), true);
  } finally {
    if (root) await act(async () => root.unmount());
    page.close();
    for (const key of keys) { if (previous[key] === undefined) delete globalThis[key]; else globalThis[key] = previous[key]; }
    await rm(dir, { recursive: true, force: true });
  }
});
