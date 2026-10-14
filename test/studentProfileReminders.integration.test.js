import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('profile checks preview and send individual missing items, respect scope and retry only failed letters', async () => {
  const directory = await mkdtemp(resolve('node_modules/.profile-reminders-test-'));
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: windowObject, document: windowObject.document, localStorage: windowObject.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const outfile = join(directory, 'manager.mjs');
    await build({ entryPoints: [resolve('src/components/HocSinhManager.jsx')], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile,
      bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', plugins: [{ name: 'offline', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|utils\/helpers$|services\/(studentMutations|jsonpClient)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
          let contents;
          if (args.path === 'firebase/firestore') contents = 'export const collection=(...a)=>a.join("/"); export const doc=collection; export const query=ref=>ref; export const where=(...a)=>a; export const onSnapshot=(_ref,next)=>{next({docs:[]});return ()=>{};}; export const setDoc=async()=>{throw new Error("Unexpected write");}; export const deleteDoc=setDoc; export const getDocsFromServer=setDoc; export const getDocFromServer=setDoc; export const runTransaction=setDoc;';
          else if (args.path.endsWith('config/firebase')) contents = 'export const db={}; export const appId="fixture";';
          else if (args.path.endsWith('utils/helpers')) contents = 'export const postAppsScript=async()=>{throw new Error("Unexpected Sheet request");}; export const IMAGE_DRIVE_FOLDER_ID="fixture";';
          else if (args.path.endsWith('services/jsonpClient')) contents = 'export const requestJsonp=async()=>({success:true,provinces:[],communes:{}});';
          else contents = 'export const saveStudentRecord=async()=>{throw new Error("Unexpected student write");}; export const deleteStudentRecord=saveStudentRecord; export const retryStudentSync=saveStudentRecord; export const retryPendingStudentSync=saveStudentRecord;';
          return { contents, loader: 'js' };
        });
      } }] });
    const { default: Manager } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    const complete = { schoolYear: '2026-2027', schoolCode: 'NAN', className: '9A', entryGrade: '6',
      fullName: 'Hồ Sơ Đủ', accessCode: 'DEMO003', birthDate: '01/01/2011', gender: 'Nam', birthProvince: 'Tỉnh Bến Tre',
      identityCode: 'DEMO', phone: '0900000000', address: 'Địa chỉ mẫu',
      portraitUrl: 'https://example.com/portrait.png', birthCertificateUrl: 'https://example.com/birth.png',
      identityCardUrl: 'https://example.com/identity.png', transcriptUrl: 'https://example.com/transcript.png' };
    const students = [
      { ...complete, id: 'province', fullName: 'Nguyễn Văn An', accessCode: 'DEMO001', birthProvince: '' },
      { ...complete, id: 'portrait', fullName: 'Lê Thị Bình', accessCode: 'DEMO002', portraitUrl: '' },
      { ...complete, id: 'complete' },
      { ...complete, id: 'no-code', fullName: 'Chưa Có Mã', accessCode: '', birthProvince: '' },
      { ...complete, id: 'dropped', fullName: 'Đã Bỏ Học', status: 'dropped', birthProvince: '' },
      { ...complete, id: 'other-grade', fullName: 'Khối Tám', className: '8A', birthProvince: '' },
      { ...complete, id: 'old-year', fullName: 'Năm Cũ', schoolYear: '2025-2026', birthProvince: '' }
    ];
    const calls = [], notices = [];
    let releaseSend;
    const onSendMailboxMessages = async messages => {
      calls.push(messages);
      if (calls.length === 1) return new Promise(resolveSend => { releaseSend = () => resolveSend({ sentCount: 1, failedMessages: [messages.find(message => message.student.id === 'portrait')] }); });
      return { sentCount: messages.length, failedMessages: [] };
    };
    root = createRoot(windowObject.document.getElementById('root'));
    const props = { students, educationLevel: 'thcs', currentSchoolYear: '2026-2027', user: { uid: 'fixture' }, onSendMailboxMessages,
      showNotification: message => notices.push(message) };
    const body = windowObject.document;
    const button = label => [...body.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label || item.textContent.trim() === label);
    const click = element => act(async () => element.click());
    const dialog = () => body.querySelector('[role="dialog"][aria-labelledby="profile-reminder-title"]');
    const openCheck = async () => {
      await click(button('Tiện ích'));
      await click([...body.querySelectorAll('[role="tab"]')].find(tab => tab.textContent.trim() === 'Rà soát hồ sơ'));
      await click(button('Kiểm tra và gửi nhắc bổ sung hồ sơ'));
    };
    await act(async () => root.render(React.createElement(Manager, props)));
    await click(button('Khối'));
    const gradeOption = label => [...body.querySelectorAll('[role="dialog"] label')].find(item => item.textContent.trim() === label).querySelector('input');
    await click(gradeOption('Chọn tất cả'));
    await click(gradeOption('Khối 9'));
    await click(button('Xong'));
    await openCheck();
    assert.equal(calls.length, 0, 'checking and previewing do not send letters');
    assert.match(dialog().textContent, /Đã kiểm tra 4 học sinh/);
    assert.match(dialog().textContent, /3 bạn còn thiếu hồ sơ; 1 bạn đã đủ/);
    assert.match(dialog().textContent, /1 bạn chưa có mã học sinh/);
    assert.equal(dialog().querySelectorAll('details > summary').length, 3, 'two recipients plus one missing-code notice');
    const previews = [...dialog().querySelectorAll('details')].filter(item => item.textContent.includes('Hồ sơ của em'));
    assert.match(previews.find(item => item.textContent.includes('Nguyễn Văn An')).textContent, /• tỉnh nơi sinh/);
    assert.doesNotMatch(previews.find(item => item.textContent.includes('Nguyễn Văn An')).textContent, /• ảnh thẻ/);
    assert.match(previews.find(item => item.textContent.includes('Lê Thị Bình')).textContent, /• ảnh thẻ/);
    await click(button('Gửi 2 thư vào hộp thư'));
    assert.equal(button('Đang gửi…').disabled, true);
    await click(button('Đang gửi…'));
    assert.equal(calls.length, 1, 'repeated clicks cannot duplicate an in-flight send');
    assert.deepEqual(calls[0].map(message => message.student.id).sort(), ['portrait', 'province']);
    for (const message of calls[0]) {
      assert.equal(message.category, 'profile');
      assert.equal(message.title, 'Thông báo bổ sung hồ sơ');
      assert.match(message.body, /Hồ sơ học sinh.*Gửi yêu cầu sửa/);
      assert.doesNotMatch(message.body, /Nguyễn Văn An|Lê Thị Bình|Chưa Có Mã/);
    }
    await act(async () => releaseSend());
    assert.match(dialog().querySelector('[role="status"]').textContent, /Đã gửi 1 thư/);
    assert.ok(button('Thử gửi lại 1 thư'));
    await click(button('Thử gửi lại 1 thư'));
    assert.deepEqual(calls[1].map(message => message.student.id), ['portrait'], 'retry excludes recipients who already received a letter');
    assert.match(dialog().querySelector('[role="status"]').textContent, /Đã gửi 2 thư/);
    assert.equal(button('Gửi 2 thư vào hộp thư'), undefined);
    await click(button('Đóng kiểm tra hồ sơ'));

    // An explicit selection takes precedence over the rest of the filtered class.
    await click(body.querySelector('input[aria-label="Chọn Lê Thị Bình"]'));
    await openCheck();
    assert.match(dialog().textContent, /Đã kiểm tra 1 học sinh đã chọn/);
    assert.ok(button('Gửi 1 thư vào hộp thư'));
    await click(button('Hủy'));
    assert.equal(calls.length, 2, 'cancelled previews never send');

    // Complete profiles and those without a login code never receive a reminder.
    await act(async () => root.render(React.createElement(Manager, { ...props, key: 'no-recipients', students: [students[2], students[3]] })));
    await openCheck();
    assert.match(dialog().textContent, /1 bạn còn thiếu hồ sơ; 1 bạn đã đủ/);
    assert.equal([...dialog().querySelectorAll('button')].some(item => /Gửi .*thư/.test(item.textContent)), false);
    await click(button('Hủy'));

    // A transport failure leaves the preview intact and allows retrying.
    await act(async () => root.render(React.createElement(Manager, { ...props, key: 'failed-send', students: [students[0]],
      onSendMailboxMessages: async () => { throw new Error('Mất kết nối'); } })));
    await openCheck();
    await click(button('Gửi 1 thư vào hộp thư'));
    assert.match(dialog().querySelector('[role="alert"]').textContent, /Mất kết nối/);
    assert.equal(button('Thử gửi lại 1 thư').disabled, false);
    assert.equal(notices.length, 0);
  } finally {
    if (root) await act(async () => root.unmount());
    windowObject.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
