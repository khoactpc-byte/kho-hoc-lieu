import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('admin profiles save dropouts without classes and offer bounded school years and linked grades', async () => {
  const directory = await mkdtemp(resolve('node_modules/.student-profile-editing-test-'));
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: windowObject, document: windowObject.document, localStorage: windowObject.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  windowObject.savedProfiles = [];
  const notices = [];
  let root;
  try {
    const outfile = join(directory, 'profile.mjs');
    await build({ entryPoints: [resolve('src/components/HocSinhManager.jsx')], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'offline-profile', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|utils\/helpers$|services\/(studentMutations|jsonpClient)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
          let contents;
          if (args.path === 'firebase/firestore') contents = 'export const collection=(...a)=>a.join("/"),doc=collection,query=ref=>ref,where=(...a)=>a,onSnapshot=(ref,next)=>{next({docs:[]});return()=>{};},getDocsFromServer=async()=>({docs:[]});export const setDoc=async()=>{throw new Error("Unexpected write");};export const deleteDoc=setDoc;';
          else if (args.path.endsWith('config/firebase')) contents = 'export const db={},appId="fixture";';
          else if (args.path.endsWith('utils/helpers')) contents = 'export const postAppsScript=async()=>{throw new Error("Unexpected Sheet request");};export const IMAGE_DRIVE_FOLDER_ID="fixture";';
          else if (args.path.endsWith('jsonpClient')) contents = 'export const requestJsonp=async()=>({success:true,provinces:[],communes:{}});';
          else contents = 'export const saveStudentRecord=async(student,options)=>{window.savedProfiles.push({student,options});return student;};export const retryStudentSync=async()=>{};export const deleteStudentRecord=async()=>{throw new Error("Unexpected delete");};export const retryPendingStudentSync=deleteStudentRecord;';
          return { contents, loader: 'js' };
        });
      } }] });
    const { default: Manager } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    root = createRoot(windowObject.document.getElementById('root'));
    const students = [
      { id: 'active', fullName: 'Học Sinh Đang Học', accessCode: 'HS001', className: '6A', grade: '6', entryGrade: '6', status: 'active', enrollmentYear: '2019-2020', gender: 'Khác' },
      { id: 'dropped', fullName: 'Học Sinh Bỏ Học', accessCode: 'HS002', className: '8A', grade: '8', entryGrade: '8', status: 'dropped', enrollmentYear: '2025-2026', classHistory: { '2025-2026': '8A' } }
    ].map(student => ({ ...student, schoolYear: '2026-2027', schoolCode: 'NAN' }));
    const render = (props = {}) => act(async () => root.render(React.createElement(Manager, { students, educationLevel: 'thcs', configuredClassOptions: ['6A', '6B', '7A', '8A', '9A'], currentSchoolYear: '2026-2027', systemSchoolYear: '2028-2029', user: { uid: 'fixture' }, showNotification: (...args) => notices.push(args), ...props })));
    const document = windowObject.document;
    const button = name => [...document.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === name || item.textContent.trim() === name);
    const click = element => act(async () => element.click());
    const dialog = () => document.querySelector('[aria-labelledby="admin-student-profile-title"]');
    const field = label => [...dialog().querySelectorAll('label')].find(item => item.firstElementChild?.textContent.trim() === label)?.querySelector('input,select');
    const select = (label, value) => act(async () => { field(label).value = value; field(label).dispatchEvent(new windowObject.Event('change', { bubbles: true })); });
    const options = label => [...field(label).options].filter(option => option.value && !option.disabled).map(option => option.value);
    const open = async name => { await click(button(`Mở hồ sơ ${name}`)); await click(button('Chỉnh sửa hồ sơ')); };
    await render();
    await click(button('Trạng thái'));
    const filter = document.querySelector('[role="dialog"][aria-label^="Lọc "]');
    await click([...filter.querySelectorAll('label')].find(label => label.textContent.trim() === 'Bỏ học').querySelector('input'));
    await click(button('Xong'));
    await open('Học Sinh Bỏ Học');
    assert.equal(field('Lớp hiện tại').value, '');
    assert.equal(field('Lớp hiện tại').disabled, true);
    assert.equal(field('Khối hiện tại').value, '');
    assert.equal(field('Khối hiện tại').disabled, true);
    assert.ok([...field('Tình trạng').options].find(option => option.value === 'active').disabled, 'returning to school still requires the explicit reactivation workflow');
    assert.deepEqual(options('Khối nhập học'), ['6', '7', '8', '9']);
    const years = Array.from({ length: 9 }, (_, index) => `${2020 + index}-${2021 + index}`);
    assert.deepEqual(options('Năm học quản lý'), years, 'the saved system year, not the admin viewing year, bounds the range');
    assert.deepEqual(options('Năm nhập học'), years);
    await select('Năm học quản lý', '2027-2028');
    await select('Giới tính', 'Nữ');
    await click(button('Lưu hồ sơ'));
    assert.equal(dialog(), null);
    assert.equal(windowObject.savedProfiles.length, 1, 'a dropout without a class reaches persistence');
    const savedDropout = windowObject.savedProfiles[0];
    assert.equal(savedDropout.student.status, 'dropped');
    assert.equal(savedDropout.student.className, '');
    assert.equal(savedDropout.student.grade, '');
    assert.equal(savedDropout.student.dropoutPreviousClassName, '8A');
    assert.deepEqual(savedDropout.student.classHistory, { '2025-2026': '8A' });
    assert.equal(savedDropout.student.schoolYear, '2027-2028');
    assert.equal(savedDropout.student.gender, 'Nữ');
    assert.equal(savedDropout.options.expected.id, 'dropped');

    await open('Học Sinh Đang Học');
    assert.equal(field('Năm nhập học').value, '2019-2020', 'older values are preserved rather than silently replaced');
    assert.equal(field('Năm nhập học').selectedOptions[0].disabled, true);
    assert.equal(field('Giới tính').value, 'Khác');
    assert.deepEqual(options('Lớp hiện tại *'), ['6A', '6B']);
    await select('Khối hiện tại', '7');
    assert.equal(field('Lớp hiện tại *').value, '', 'changing grade clears the incompatible class');
    assert.deepEqual(options('Lớp hiện tại *'), ['7A']);
    await click(button('Lưu hồ sơ'));
    assert.equal(windowObject.savedProfiles.length, 1, 'active students still need a class');
    assert.match(notices.at(-1)[0], /Cần chọn lớp/);
    await select('Lớp hiện tại *', '7A');
    await select('Khối nhập học', '6');
    await select('Năm nhập học', '2024-2025');
    await render({ systemSchoolYear: '2029-2030' });
    assert.equal(options('Năm học quản lý').at(-1), '2029-2030', 'the list grows automatically when system settings change');
    assert.equal(field('Lớp hiện tại *').value, '7A', 'updating year settings preserves the open draft');
    await click(button('Lưu hồ sơ'));
    assert.equal(windowObject.savedProfiles[1].student.className, '7A');
    assert.equal(windowObject.savedProfiles[1].student.grade, '7');
    assert.equal(windowObject.savedProfiles[1].student.enrollmentYear, '2024-2025');

    await open('Học Sinh Đang Học');
    await select('Tình trạng', 'dropped');
    assert.equal(field('Lớp hiện tại').value, '');
    assert.equal(field('Khối hiện tại').value, '');
    await select('Tình trạng', 'active');
    assert.equal(field('Lớp hiện tại *').value, '6A', 'undoing an unsaved dropout restores the original class');
    await select('Tình trạng', 'dropped');
    await click(button('Lưu hồ sơ'));
    assert.equal(windowObject.savedProfiles[2].student.className, '');
    assert.equal(windowObject.savedProfiles[2].student.dropoutPreviousClassName, '6A');

    await render({ key: 'primary', educationLevel: 'primary', students: [{ ...students[0], fullName: 'Học Sinh Tiểu Học', className: '3A', entryGrade: '3', gender: 'Nam' }], configuredClassOptions: ['3A', '4A'] });
    await open('Học Sinh Tiểu Học');
    assert.deepEqual(options('Khối nhập học'), ['1', '2', '3', '4', '5']);
    assert.deepEqual(options('Khối hiện tại'), ['1', '2', '3', '4', '5']);
    await render({ key: 'empty', students: [], configuredClassOptions: [] });
    await click(button('Thêm'));
    assert.equal(field('Lớp hiện tại *').tagName, 'INPUT', 'an empty school without configured classes still permits its first profile');
  } finally {
    if (root) await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    windowObject.close();
    await rm(directory, { recursive: true, force: true });
  }
});
