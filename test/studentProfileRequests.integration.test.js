import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { memoryStore } from './helpers/memoryStore.js';
import { createAsyncScope } from '../src/utils/asyncScope.js';
import { PROFILE_REQUEST_PENDING_MESSAGE } from '../src/utils/profileRequestPolicy.js';
import { buildStudentProfileProvinceOptions, STUDENT_PROFILE_PROVINCE_FIELDS } from '../src/utils/studentProfileProvinces.js';

test('student request client preserves pending requests and prevents duplicate tabs before uploading', async t => {
  const directory = await mkdtemp(resolve('node_modules/.profile-single-request-'));
  const root = 'artifacts/fixture/public/data';
  let store = memoryStore(), uploads = 0;
  const mock = {
    collection: (_db, ...parts) => store.collection(parts.join('/')),
    doc: (base, id) => store.doc(`${base.path}/${id}`),
    query: (base, ...filters) => filters.reduce((result, filter) => result.where(...filter), base),
    where: (...args) => args,
    getDocsFromServer: target => target.get(),
    runTransaction: (_db, callback) => store.runTransaction(callback),
    upload: async () => { uploads++; return { status: 'success', url: 'https://example.com/new.jpg' }; }
  };
  globalThis.__profileRequestFixture = mock;
  const options = () => {
    const notices = [], states = [], closed = [];
    return {
      activeStudentProfile: { id: 'an', fullName: 'An', accessCode: 'HS001', className: '8A', schoolYear: '2026-2027', phone: '123' },
      isSubmittingProfileRequest: false, activeStudentIsReadOnly: false,
      studentRequestScopeRef: { current: createAsyncScope() }, setIsSubmittingProfileRequest: value => states.push(value),
      showNotification: (...args) => notices.push(args), STUDENT_PROFILE_IMAGE_FIELDS: [{ key: 'portraitUrl', label: 'Ảnh thẻ' }],
      studentProfileImages: {}, studentProfileDocumentOverrides: {}, activeStudentPendingProfileChanges: {}, studentProfileImageAppendModes: {},
      studentProfileEditableFields: [{ key: 'phone', label: 'Số điện thoại' }], normalizeStudentResultRating: value => value,
      studentProfileDraft: { phone: '456' }, activeStudentPendingProfileRequests: [], currentSchoolYear: '2026-2027',
      setShowStudentProfileModal: value => closed.push(value), IMAGE_DRIVE_FOLDER_ID: 'fixture', notices, states, closed
    };
  };
  try {
    const outfile = join(directory, 'client.mjs');
    await build({ stdin: { contents: "export * from './src/services/studentProfileRequests.js'; export * from './src/services/profileRequestGate.js';", resolveDir: resolve('.'), loader: 'js' }, absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm',
      plugins: [{ name: 'offline-profile-request', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|services\/serverQuizClient$|\.\/serverQuizClient$|\.\/scopedIdentity$|utils\/helpers$|utils\/fileUpload$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
          let contents;
          if (args.path === 'firebase/firestore') contents = 'export const {collection,doc,query,where,getDocsFromServer,runTransaction}=globalThis.__profileRequestFixture;';
          else if (args.path.endsWith('config/firebase')) contents = 'export const db={},appId="fixture";';
          else if (args.path.endsWith('scopedIdentity')) contents = 'export const SCOPED_AUTH_ENABLED=false;';
          else if (args.path.endsWith('serverQuizClient')) contents = 'export const requestPrivateApi=()=>{throw new Error("Unexpected API request");};';
          else if (args.path.endsWith('utils/helpers')) contents = 'export const postAppsScript=(...args)=>globalThis.__profileRequestFixture.upload(...args);';
          else contents = 'export const studentUploadMime=()=>"image/jpeg"; export const readFileBase64=async()=>"fixture";';
          return { contents, loader: 'js' };
        });
      } }] });
    const service = await import(pathToFileURL(outfile));
    await t.test('invalid province edits cannot upload files or create requests', async () => {
      for (const [key, field] of Object.entries(STUDENT_PROFILE_PROVINCE_FIELDS)) {
        store = memoryStore(); uploads = 0;
        const input = options();
        input.studentProfileEditableFields.push({ key, label: field.label });
        input.studentProfileDraft[key] = 'Tphcm';
        input.studentProfileProvinceOptions = buildStudentProfileProvinceOptions({ provinces: ['Hồ Chí Minh'], birthProvinces: ['Hồ Chí Minh'] });
        input.studentProfileImages = { portraitUrl: { name: 'photo.jpg' } };
        await service.submitStudentProfileChange(input);
        assert.match(input.notices.at(-1)[0], /chọn.*danh sách.*không nhập tên viết tắt/);
        assert.equal(uploads, 0); assert.equal(store.commits, 0);
        assert.deepEqual(input.states, []); assert.deepEqual(input.closed, []);
      }
    });
    await t.test('province selections store complete names while unrelated edits preserve existing legacy values', async () => {
      store = memoryStore();
      const input = options();
      input.studentProfileEditableFields.push({ key: 'birthProvince', label: 'Tỉnh nơi sinh' }, { key: 'province', label: 'Tỉnh / Thành' });
      input.studentProfileProvinceOptions = buildStudentProfileProvinceOptions({ provinces: ['Hồ Chí Minh'], birthProvinces: ['Bến Tre'] });
      Object.assign(input.studentProfileDraft, { birthProvince: 'Tỉnh Bến Tre', province: 'Thành phố Hồ Chí Minh' });
      await service.submitStudentProfileChange(input);
      assert.deepEqual(store.get(`${root}/student_profile_requests/profile-an`).changes, { phone: '456', birthProvince: 'Tỉnh Bến Tre', province: 'Thành phố Hồ Chí Minh' });
      store = memoryStore();
      const legacy = options();
      legacy.activeStudentProfile.birthProvince = 'Tphcm';
      legacy.studentProfileDraft.birthProvince = 'Tphcm';
      legacy.studentProfileEditableFields.push({ key: 'birthProvince', label: 'Tỉnh nơi sinh' });
      await service.submitStudentProfileChange(legacy);
      assert.deepEqual(store.get(`${root}/student_profile_requests/profile-an`).changes, { phone: '456' });
    });
    await t.test('cached pending request blocks immediately without uploading or writing', async () => {
      store = memoryStore(); uploads = 0;
      const input = options();
      input.activeStudentPendingProfileRequests = [{ id: 'old', changes: { phone: '789' } }];
      input.studentProfileImages = { portraitUrl: { name: 'photo.jpg' } };
      await service.submitStudentProfileChange(input);
      assert.deepEqual(input.notices, [[PROFILE_REQUEST_PENDING_MESSAGE, 'error']]);
      assert.equal(uploads, 0); assert.equal(store.commits, 0); assert.deepEqual(input.states, []);
    });
    await t.test('fresh server check catches a legacy request missing from the local listener', async () => {
      store = memoryStore(); uploads = 0;
      store.put(`${root}/student_profile_requests/legacy`, { studentId: 'an', changes: { phone: '789' } });
      const before = store.dump(), input = options();
      input.studentProfileImages = { portraitUrl: { name: 'photo.jpg' } };
      await service.submitStudentProfileChange(input);
      assert.match(input.notices.at(-1)[0], /đang chờ quản trị viên duyệt/);
      assert.equal(uploads, 0); assert.deepEqual(store.dump(), before);
      assert.deepEqual(input.states, [true, false]); assert.deepEqual(input.closed, []);
      await assert.rejects(service.assertNoPendingProfileRequest('an'), /đang chờ quản trị viên duyệt/);
    });
    await t.test('two simultaneous tabs produce one immutable pending request', async () => {
      store = memoryStore();
      const first = { studentId: 'an', changes: { phone: '456' } };
      const outcomes = await Promise.allSettled([service.createPendingProfileRequest(first), service.createPendingProfileRequest({ ...first, changes: { phone: '789' } })]);
      assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
      assert.match(outcomes.find(item => item.status === 'rejected').reason.message, /đang chờ quản trị viên duyệt/);
      assert.deepEqual(store.get(`${root}/student_profile_requests/profile-an`).changes, first.changes);
      assert.equal(store.commits, 1);
    });
    await t.test('new submissions are enabled after admin removes the fully reviewed request', async () => {
      store = memoryStore();
      const input = options();
      await service.submitStudentProfileChange(input);
      assert.deepEqual(input.closed, [false]);
      assert.deepEqual(store.get(`${root}/student_profile_requests/profile-an`).changes, { phone: '456' });
      await service.submitStudentProfileChange(options());
      assert.equal(store.commits, 1);
      await store.runTransaction(async tx => { tx.delete(store.doc(`${root}/student_profile_requests/profile-an`)); });
      await service.assertNoPendingProfileRequest('an');
      const next = options(); next.studentProfileDraft.phone = '789';
      await service.submitStudentProfileChange(next);
      assert.deepEqual(next.closed, [false]);
      assert.deepEqual(store.get(`${root}/student_profile_requests/profile-an`).changes, { phone: '789' });
    });
  } finally {
    delete globalThis.__profileRequestFixture;
    await rm(directory, { recursive: true, force: true });
  }
});
