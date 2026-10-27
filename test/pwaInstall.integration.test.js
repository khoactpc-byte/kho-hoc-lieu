import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('installation button, share link and fallback guidance work without inventing installation success', async () => {
  const directory = await mkdtemp(resolve('node_modules/.pwa-test-'));
  const page = new JSDOM('<div id="root"></div><button id="outside">Ngoài</button>', { url: 'https://school.example/' }).window;
  const previous = Object.fromEntries(['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: page, document: page.document, navigator: page.navigator, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  let root;
  try {
    page.matchMedia = () => ({ matches: false, addEventListener() {} });
    Object.defineProperty(page, 'isSecureContext', { value: true });
    const workerMessages = [];
    const installing = new page.EventTarget();
    const registration = new page.EventTarget();
    registration.installing = installing;
    registration.waiting = null;
    const serviceWorker = new page.EventTarget();
    serviceWorker.controller = {};
    serviceWorker.register = async (url, options) => {
      assert.equal(url, '/sw.js');
      assert.equal(options.updateViaCache, 'none');
      return registration;
    };
    Object.defineProperty(page.navigator, 'serviceWorker', { value: serviceWorker });
    let copied = '';
    page.navigator.clipboard = { writeText: async text => { copied = text; } };
    const output = join(directory, 'fixture.mjs');
    await build({ stdin: { contents: "export {default as Button} from './src/components/PwaInstallButton.jsx'; export {default as Manager} from './src/components/PwaInstallManager.jsx'; export * from './src/pwa/install.js';", resolveDir: resolve('.') }, outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' });
    const fixture = await import(pathToFileURL(output));
    fixture.initializeInstall({ registerWorker: true });
    await Promise.resolve();
    const { createRoot } = await import('react-dom/client');
    root = createRoot(page.document.getElementById('root'));
    await act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(fixture.Button), React.createElement(fixture.Manager))));
    const click = async element => { assert.ok(element); element.focus(); await act(async () => element.click()); };
    await click(page.document.querySelector('[aria-label="Cài ứng dụng"]'));
    assert.ok(page.document.querySelector('[role="dialog"]'));
    assert.match(page.document.body.textContent, /Điện thoại Android/);
    assert.equal(page.document.querySelector('#pwa-install-link').value, 'https://school.example/?install=1');
    await click([...page.document.querySelectorAll('button')].find(button => button.textContent === 'Sao chép'));
    assert.equal(copied, 'https://school.example/?install=1');
    let prompts = 0;
    const prompt = new page.Event('beforeinstallprompt', { cancelable: true });
    prompt.prompt = async () => { prompts++; };
    prompt.userChoice = Promise.resolve({ outcome: 'dismissed' });
    await act(async () => page.dispatchEvent(prompt));
    assert.equal(prompt.defaultPrevented, true);
    await click(page.document.querySelector('.pwa-primary'));
    assert.equal(prompts, 1);
    assert.match(page.document.body.textContent, /Bạn đã đóng hộp cài/);
    assert.equal(fixture.getInstallSnapshot().installed, false);
    assert.equal(page.document.querySelector('.pwa-primary'), null, 'a consumed prompt cannot be reused');
    await act(async () => page.document.dispatchEvent(new page.KeyboardEvent('keydown', { key: 'Escape' })));
    assert.equal(page.document.querySelector('[role="dialog"]'), null);
    assert.equal(page.document.activeElement.getAttribute('aria-label'), 'Cài ứng dụng');
    Object.defineProperty(page.navigator, 'userAgent', { configurable: true, value: 'iPhone' });
    await click(page.document.querySelector('[aria-label="Cài ứng dụng"]'));
    assert.match(page.document.querySelector('.pwa-steps').textContent, /iPhone \/ iPad/);
    assert.match(page.document.querySelector('.pwa-steps').textContent, /Thêm vào màn hình chính/);
    await act(async () => page.dispatchEvent(new page.Event('appinstalled')));
    assert.equal(page.document.querySelector('[aria-label="Cài ứng dụng"]'), null);
    assert.match(page.document.body.textContent, /Ứng dụng đã được cài/);
    await click(page.document.querySelector('[aria-label="Đóng hướng dẫn cài ứng dụng"]'));
    await act(async () => {
      registration.waiting = { postMessage: data => workerMessages.push(data) };
      registration.dispatchEvent(new page.Event('updatefound'));
      installing.dispatchEvent(new page.Event('statechange'));
    });
    assert.ok(page.document.querySelector('.pwa-update-notice'));
    assert.equal(workerMessages.length, 0, 'an update does not interrupt an in-progress lesson');
    await click([...page.document.querySelectorAll('button')].find(button => button.textContent === 'Xem cập nhật'));
    assert.match(page.document.querySelector('[role="dialog"]').textContent, /Hãy lưu bài làm/);
    assert.equal(workerMessages.length, 0);
    await click([...page.document.querySelectorAll('button')].find(button => button.textContent === 'Đã lưu xong, cập nhật'));
    assert.deepEqual(workerMessages, [{ type: 'ACTIVATE_UPDATE' }]);
  } finally {
    if (root) await act(async () => root.unmount());
    page.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
    await rm(directory, { force: true, recursive: true });
  }
});
