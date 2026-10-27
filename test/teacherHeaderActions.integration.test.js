import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('compact teacher actions retain button callbacks and close by action, outside click and Escape', async () => {
  const dir = await mkdtemp(resolve('node_modules/.teacher-header-'));
  const page = new JSDOM('<div id="root"></div><button id="outside">Ngoài menu</button>').window;
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: page, document: page.document, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const outfile = join(dir, 'fixture.mjs');
    await build({ stdin: { contents: "export {default} from './src/components/TeacherHeaderActions.jsx'", resolveDir: resolve('.') }, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' });
    const { default: Actions } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    root = createRoot(page.document.getElementById('root'));
    let calls = 0;
    await act(async () => root.render(React.createElement(Actions, { compact: true, teacherName: 'Giáo viên mẫu',
      primaryActions: React.createElement('button', { onClick: () => calls++ }, 'Danh sách') }, React.createElement('button', { onClick: () => calls++ }, 'Học liệu'))));
    const toggle = page.document.querySelector('[aria-label="Công cụ giáo viên"]');
    const click = async element => act(async () => element.click());
    await click(toggle);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    await act(async () => page.document.dispatchEvent(new page.KeyboardEvent('keydown', { key: 'Escape' })));
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(page.document.activeElement, toggle);
    await click(page.document.querySelector('.teacher-header-primary-actions button'));
    assert.equal(calls, 1, 'primary action works without opening the compact menu');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    await click(toggle);
    await act(async () => page.document.getElementById('outside').dispatchEvent(new page.Event('pointerdown', { bubbles: true })));
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    await click(toggle);
    await click(page.document.querySelector('.teacher-header-action-items button'));
    assert.equal(calls, 2);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    let homes = 0, backs = 0, exits = 0;
    await act(async () => root.render(React.createElement(Actions, { compact: true, mobile: true, onHome: () => homes++, onBack: () => backs++, onLogout: () => exits++,
      primaryActions: React.createElement('button', null, 'Kiểm tra'), primaryTools: React.createElement('button', null, 'Chia đôi') })));
    await click(page.document.querySelector('[aria-label="Trang chủ giáo viên"]'));
    await click(page.document.querySelector('.teacher-mobile-navigation button:last-child'));
    await click(page.document.querySelector('.teacher-mobile-logout'));
    assert.deepEqual([homes, backs, exits], [1,1,1]);
    assert.doesNotMatch(page.document.querySelector('.teacher-header-primary-actions').textContent, /Chia đôi/);
    assert.match(page.document.querySelector('.teacher-header-action-items').textContent, /Chia đôi/);
  } finally {
    if (root) await act(async () => root.unmount());
    page.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
    await rm(dir, { recursive: true, force: true });
  }
});
