import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('registration review approves, cancels rejection, deletes only after success and preserves failed rows', async () => {
  const directory = await mkdtemp(resolve('node_modules/.registration-review-test-'));
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: windowObject, document: windowObject.document, localStorage: windowObject.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  const registrations = [
    { rowNumber: 2, fullName: 'Nguyễn Văn An', birthDate: '08/06/2020', identityCode: '095201094267' },
    { rowNumber: 3, fullName: 'Lê Thị Bình', birthDate: '09/07/2020', identityCode: '095201094268' },
    { rowNumber: 4, fullName: 'Trần Văn Chi', birthDate: '10/08/2020', identityCode: '095201094269' },
    { rowNumber: 5, fullName: 'Phạm Thị Dung', birthDate: '11/09/2020', identityCode: '095201094270' }
  ].map(item => ({ ...item, className: '2A', schoolYear: '2026-2027', schoolCode: 'NAN' }));
  const requests = [], confirmations = [], saved = [], stored = new Map(), notices = [];
  let confirmAnswer = false, deletion, failDelete = false;
  windowObject.confirm = message => { confirmations.push(message); return confirmAnswer; };
  globalThis.__registrationReview = {
    post: async request => {
      requests.push(request);
      if (request.registrationAction === 'listPending') return { status: 'success', result: { success: true, items: registrations } };
      if (request.registrationAction === 'deleteRegistration') {
        if (failDelete) throw new Error('Sheet unavailable');
        return new Promise(resolveRequest => { deletion = () => resolveRequest({ status: 'success', result: { success: true } }); });
      }
      assert.ok(['syncStudent', 'markExistingRegistration'].includes(request.registrationAction));
      return { status: 'success', result: { success: true } };
    },
    save: async (input, options) => {
      saved.push({ input, options });
      const student = { ...input, id: options.id, accessCode: 'HS2620001', sheetSync: { jobId: 'job-1', status: 'pending' } };
      stored.set(student.id, { student, registration: options.registration });
      return student;
    },
    sync: async (id, send, options) => {
      const { student, registration } = stored.get(id);
      await send(student);
      await options.registrationComplete(registration, student);
    }
  };
  let root;
  try {
    const outfile = join(directory, 'review.mjs');
    await build({ entryPoints: [resolve('src/components/HocSinhManager.jsx')], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'offline-review', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|utils\/helpers$|services\/(studentMutations|jsonpClient)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
          let contents;
          if (args.path === 'firebase/firestore') contents = 'export const collection=(...a)=>a.join("/"); export const doc=collection; export const onSnapshot=(_ref,next)=>{next({docs:[]}); return ()=>{};}; export const setDoc=async()=>{throw new Error("Unexpected write");}; export const deleteDoc=setDoc;';
          else if (args.path.endsWith('config/firebase')) contents = 'export const db={}; export const appId="fixture";';
          else if (args.path.endsWith('utils/helpers')) contents = 'export const postAppsScript=globalThis.__registrationReview.post; export const IMAGE_DRIVE_FOLDER_ID="fixture";';
          else if (args.path.endsWith('services/jsonpClient')) contents = 'export const requestJsonp=async()=>({success:true,provinces:[],communes:{}});';
          else contents = 'export const saveStudentRecord=globalThis.__registrationReview.save; export const retryStudentSync=globalThis.__registrationReview.sync; export const retryPendingStudentSync=async()=>({succeeded:[],failed:[]}); export const deleteStudentRecord=async()=>{throw new Error("Rejection must not delete database records");};';
          return { contents, loader: 'js' };
        });
      } }] });
    const { default: Manager } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    root = createRoot(windowObject.document.getElementById('root'));
    await act(async () => root.render(React.createElement(Manager, {
      currentSchoolYear: '2026-2027', initialTab: 'registrations', user: { uid: 'fixture' },
      students: [{ id: 'existing', ...registrations[3] }], showNotification: (...args) => notices.push(args)
    })));
    const rows = () => [...windowObject.document.querySelectorAll('tbody tr')];
    const row = name => rows().find(item => item.textContent.includes(name));
    const button = (name, label) => [...row(name).querySelectorAll('button')].find(item => item.textContent.trim() === label);
    const click = element => act(async () => element.dispatchEvent(new windowObject.MouseEvent('click', { bubbles: true })));
    assert.equal(rows().length, 4);
    assert.ok(windowObject.document.querySelector('th.sticky.right-0').textContent.includes('Duyệt hồ sơ'));
    assert.equal(button('Phạm Thị Dung', 'Đồng ý').disabled, true, 'duplicates must be reconciled before approval');
    assert.equal(button('Phạm Thị Dung', 'Từ chối').disabled, false, 'duplicates can still be rejected');
    await click(button('Nguyễn Văn An', 'Từ chối'));
    assert.match(confirmations[0], /Nguyễn Văn An.*xóa khỏi Google Sheet/);
    assert.equal(requests.filter(item => item.registrationAction === 'deleteRegistration').length, 0);
    assert.equal(rows().length, 4);

    confirmAnswer = true;
    const reject = button('Nguyễn Văn An', 'Từ chối');
    await act(async () => { reject.click(); reject.click(); });
    assert.equal(requests.filter(item => item.registrationAction === 'deleteRegistration').length, 1, 'double clicks must send only one deletion');
    assert.ok(row('Nguyễn Văn An'), 'keep the row until Sheet confirms deletion');
    assert.equal(button('Lê Thị Bình', 'Đồng ý').disabled, true);
    const deleted = requests.find(item => item.registrationAction === 'deleteRegistration');
    assert.equal(deleted.params.identityCode, '095201094267');
    assert.equal(deleted.params.birthDate, '08/06/2020');
    await act(async () => deletion());
    assert.equal(row('Nguyễn Văn An'), undefined);
    assert.equal(rows().length, 3);

    failDelete = true;
    await click(button('Lê Thị Bình', 'Từ chối'));
    assert.ok(row('Lê Thị Bình'));
    assert.equal(button('Lê Thị Bình', 'Từ chối').disabled, false);
    assert.ok(notices.some(([message]) => message.includes('Sheet unavailable')));
    assert.equal(saved.length, 0, 'rejecting registration must not create a student');

    await click(button('Trần Văn Chi', 'Đồng ý'));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].input.fullName, 'Trần Văn Chi');
    assert.equal(saved[0].options.createOnly, true);
    assert.ok(requests.some(item => item.registrationAction === 'syncStudent' && item.params.fullName === 'Trần Văn Chi'));
    assert.ok(requests.some(item => item.registrationAction === 'markExistingRegistration' && item.params.identityCode === '095201094269'));
    assert.equal(row('Trần Văn Chi'), undefined);
    assert.ok(row('Lê Thị Bình'));

    const pageButton = label => [...windowObject.document.querySelectorAll('button')].find(item => item.textContent.trim() === label);
    await click(pageButton('Cột'));
    await click(pageButton('Chỉ ảnh'));
    assert.ok(windowObject.document.querySelector('th.sticky.right-0').textContent.includes('Duyệt hồ sơ'));
    assert.equal(button('Lê Thị Bình', 'Đồng ý').disabled, false, 'review actions remain available while viewing documents');
    assert.equal(button('Lê Thị Bình', 'Từ chối').disabled, false);
    for (const item of rows()) assert.equal(item.children.length, windowObject.document.querySelectorAll('thead th').length);
  } finally {
    if (root) await act(async () => root.unmount());
    windowObject.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    delete globalThis.__registrationReview;
    await rm(directory, { recursive: true, force: true });
  }
});
