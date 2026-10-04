import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

test('scorebook renders and its second group shows the remaining students in score and summary pages', async () => {
  const directory = await mkdtemp(resolve('node_modules/.scorebook-render-test-'));
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = { window: globalThis.window, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame };
  globalThis.window = windowObject;
  globalThis.document = windowObject.document;
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(windowObject.document.getElementById('root'));
  try {
    const outfile = join(directory, 'workspace.mjs');
    await build({ entryPoints: ['src/components/ScorebookWorkspace.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'offline-firestore', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$/ }, args => ({ path: args.path, namespace: 'offline' }));
        builder.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'export const doc=(...a)=>a.join("/"); export const collection=doc; export const getDocFromServer=async()=>({data:()=>({})}); export const onSnapshot=(_ref,options,next)=>{(typeof options==="function"?options:next)({docs:[],data:()=>({}),metadata:{hasPendingWrites:false}});return ()=>{};}; export class FieldPath{}; export const deleteField=()=>null; export const runTransaction=()=>Promise.reject(new Error("Writes disabled in rendering fixture"));'
          : 'export const db={}; export const auth={}; export const appId="offline-test";', loader: 'js' }));
      } }] });
    const { default: Workspace } = await import(pathToFileURL(outfile));
    const students = Array.from({ length: 45 }, (_, index) => ({ id: `s${index}`, accessCode: `HS${index}`,
      fullName: `Học sinh ${String(index + 1).padStart(2, '0')}`, grade: '6', className: '6A', schoolCode: 'NAN', schoolYear: '2026-2027' }));
    await act(async () => root.render(React.createElement(Workspace, { grade: '6', currentSchoolYear: '2026-2027', students, user: { uid: 'fixture' } })));
    const body = windowObject.document;
    const group = [...body.querySelectorAll('label')].find(label => label.textContent.includes('Danh sách học sinh đang xem/in')).querySelector('select');
    assert.equal(group.options.length, 2);
    await act(async () => { group.value = '1'; group.dispatchEvent(new windowObject.Event('change', { bubbles: true })); });
    // The sheet selector is present in the toolbar and uses stable template names.
    const sheets = [...body.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === 'Diem_HKI_MonTinhDiem'));
    assert.ok(sheets, 'score sheet selector exists');
    const scoreOption = [...sheets.options].find(option => option.value === 'Diem_HKI_MonTinhDiem');
    await act(async () => { sheets.value = scoreOption.value; sheets.dispatchEvent(new windowObject.Event('change', { bubbles: true })); });
    const printed = body.querySelector('.scorebook-print-root').textContent;
    assert.ok(printed.includes('Học Sinh 41'), printed.slice(0, 200));
    assert.ok(printed.includes('Học Sinh 45'));
    assert.equal(printed.includes('Học Sinh 01'), false);
    await act(async () => { sheets.value = 'DiemTongKet_HKI'; sheets.dispatchEvent(new windowObject.Event('change', { bubbles: true })); });
    assert.ok(body.querySelector('.scorebook-print-root').textContent.includes('Học Sinh 45'));
  } finally {
    await act(async () => root.unmount());
    windowObject.close();
    Object.assign(globalThis, previous);
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    await rm(directory, { recursive: true, force: true });
  }
});
