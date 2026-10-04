import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

test('data safety shows unknown counts while loading and keeps last successful statistics after refresh fails', async () => {
  const directory = await mkdtemp(resolve('node_modules/.summary-test-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(dom.window.document.getElementById('root'));
  const requests = [], notifications = [];
  let captures = 0;
  globalThis.__summaryTest = { load: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) };
  try {
    const outfile = join(directory, 'component.mjs');
    await build({ entryPoints: ['src/components/AdminDataSafetyWorkspace.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'summary-backend', setup(builder) {
        builder.onResolve({ filter: /services\/systemSummary$|utils\/helpers$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path.endsWith('systemSummary') ? 'export const readSystemSummary=()=>globalThis.__summaryTest.load();'
          : args.path.endsWith('helpers') ? 'export const postAppsScript=async()=>({backups:[]});'
          : 'export const appId="test",db={},auth={};', loader: 'js' }));
      } }] });
    const Component = (await import(pathToFileURL(outfile))).default;
    const notify = message => notifications.push(message);
    await act(async () => root.render(React.createElement(Component, { snapshot: { collections: {} }, captureSnapshot: () => { captures++; }, showNotification: notify })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.match(dom.window.document.body.textContent, /Đang lấy thống kê dữ liệu/);
    assert.doesNotMatch(dom.window.document.body.textContent, /0 hồ sơ học sinh/);
    assert.equal(captures, 0, 'opening statistics must not capture a backup');
    await act(async () => requests[0].resolve({ counts: { students: 25, scorebooks: 3, class_attendance: 0 }, readAt: 1234 }));
    assert.match(dom.window.document.body.textContent, /25 hồ sơ học sinh, 3 sổ điểm, 0 bảng điểm danh/);
    assert.match(dom.window.document.body.textContent, /Dữ liệu lúc/);
    const button = [...dom.window.document.querySelectorAll('button')].find(item => item.textContent === 'Làm mới thống kê');
    await act(async () => button.click());
    await act(async () => requests[1].reject(new Error('network')));
    assert.match(dom.window.document.body.textContent, /25 hồ sơ học sinh/);
    assert.match(notifications.at(-1), /Chưa tải được thống kê/);
    assert.equal(captures, 0);
  } finally {
    await act(async () => root.unmount()); dom.window.close(); globalThis.window = oldWindow; globalThis.document = oldDocument;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT; delete globalThis.__summaryTest;
    await rm(directory, { recursive: true, force: true });
  }
});
