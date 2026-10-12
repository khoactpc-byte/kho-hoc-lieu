import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('registration reminder loads before opening the list, refreshes, preserves failures and ignores stale reads', async () => {
  const directory = await mkdtemp(resolve('node_modules/.pending-registration-count-'));
  const page = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true }).window;
  const previous = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: page, document: page.document, IS_REACT_ACT_ENVIRONMENT: true });
  const originalNow = Date.now;
  let now = originalNow(), interval, cleared = false, current, root;
  Date.now = () => now;
  page.setInterval = (callback, ms) => { assert.equal(ms, 60000); interval = callback; return 1; };
  page.clearInterval = () => { cleared = true; };
  const reads = [];
  page.reminderFixture = {
    post: (request, options) => {
      assert.equal(request.registrationAction, 'listPending');
      return new Promise((resolveRead, reject) => reads.push({ options, resolve: resolveRead, reject }));
    },
    capture: value => { current = value; }
  };
  const items = [{ rowNumber: 2 }, { rowNumber: 3 }, { rowNumber: 4 }];
  const succeed = (index, rows = items) => reads[index].resolve({ result: { success: true, items: rows } });
  try {
    const outfile = join(directory, 'reminder.mjs');
    await build({ stdin: { contents: `import React from 'react'; import { usePendingRegistrationCount } from './src/hooks/usePendingRegistrationCount';
      export default function Reminder({enabled, scopeKey, educationLevel}) { const value=usePendingRegistrationCount(enabled, scopeKey, educationLevel); window.reminderFixture.capture(value); return React.createElement('output', null, value.count); }`,
      resolveDir: resolve('.') }, absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'offline-reminder', setup(builder) {
        builder.onResolve({ filter: /utils\/helpers$/ }, () => ({ path: 'helpers', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const postAppsScript=(...args)=>window.reminderFixture.post(...args);', loader: 'js' }));
      } }] });
    const { default: Reminder } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    root = createRoot(page.document.getElementById('root'));
    const render = (enabled, scopeKey = 'admin-one', educationLevel = '') => act(async () => root.render(React.createElement(Reminder, { enabled, scopeKey, educationLevel })));
    await render(false);
    assert.equal(reads.length, 0, 'no administrative read before login');
    await render(true);
    assert.equal(reads.length, 1, 'loads on login without mounting a student list');
    assert.equal(current.loaded, false);
    await act(async () => succeed(0));
    assert.equal(current.count, 3);
    await act(async () => page.dispatchEvent(new page.Event('focus')));
    assert.equal(reads.length, 1, 'focus does not hammer the Sheet');

    now += 60000;
    await act(async () => { interval(); interval(); });
    assert.equal(reads.length, 2, 'background reads cannot overlap');
    await act(async () => current.removeRegistrations([items[0]]));
    assert.equal(current.count, 2, 'successful decisions update immediately');
    assert.equal(reads[1].options.signal.aborted, true);
    await act(async () => succeed(1));
    assert.equal(current.count, 2, 'a stale read cannot restore a resolved registration');

    now += 60000;
    await act(async () => interval());
    await act(async () => reads[2].reject(new Error('Sheet tạm mất kết nối')));
    assert.equal(current.count, 2, 'a failed refresh must not hide pending work');
    assert.match(current.error, /Sheet/);
    await act(async () => current.replaceRegistrations(items));
    assert.equal(current.count, 3, 'manual list reload updates the same reminder');
    assert.equal(current.error, '');

    now += 20000;
    await act(async () => page.dispatchEvent(new page.Event('focus')));
    await act(async () => succeed(3, [...items, { rowNumber: 5 }]));
    assert.equal(current.count, 4, 'new submissions appear after returning to the page');
    Object.defineProperty(page.document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => interval());
    assert.equal(reads.length, 4, 'hidden pages do not poll');
    Object.defineProperty(page.document, 'visibilityState', { configurable: true, value: 'visible' });
    now += 60000;
    await act(async () => page.document.dispatchEvent(new page.Event('visibilitychange')));
    await render(false);
    assert.equal(current.count, 0, 'logout hides the previous administrator data immediately');
    assert.equal(reads[4].options.signal.aborted, true);
    assert.equal(cleared, true);
    await act(async () => succeed(4));
    assert.equal(current.count, 0);

    await render(true, 'admin-two');
    await act(async () => reads[5].resolve({ result: { success: true } }));
    assert.equal(current.loaded, false, 'a malformed response is not treated as an empty queue');
    assert.ok(current.error);
    now += 60000;
    await act(async () => interval());
    await act(async () => succeed(6, []));
    assert.equal(current.count, 0);
    assert.equal(current.loaded, true);
    assert.equal(current.error, '');
    await act(async () => current.replaceRegistrations([{ rowNumber: 8, className: '2A' }, { rowNumber: 9, khoi: '5' }, { rowNumber: 10, className: '6A' }]));
    await render(true, 'admin-two', 'primary');
    assert.equal(current.count, 2);
    await render(true, 'admin-two', 'thcs');
    assert.equal(current.count, 1, 'changing level uses the existing queue without dropping other-level registrations');
    assert.equal(reads.length, 7);
  } finally {
    if (root) await act(async () => root.unmount());
    Date.now = originalNow;
    page.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
