import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('identity bridge isolates app users and omits future student profiles from claims', async () => {
  const directory = await mkdtemp(resolve('node_modules/.identity-bridge-test-'));
  const names = ['FIREBASE_SERVICE_ACCOUNT_JSON', 'KHL_APP_ID', 'IDENTITY_BRIDGE_TOKEN', 'APPS_SCRIPT_URL', 'APPS_SCRIPT_CLIENT_TOKEN'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  const tokens = [], apps = [{ name: 'another-service' }];
  const students = [
    { id: 'past', schoolYear: '2025-2026', className: '9A' },
    { id: 'current', schoolYear: '2026/27', className: '10A' },
    { id: 'future', schoolYear: '2027-2028', className: '11A' }
  ].map(item => ({ ...item, accessCode: 'HS001', schoolCode: 'NAN' }));
  const store = {
    collection(path) {
      return { doc: id => ({ path: `${path}/${id}` }), where: () => ({ limit: () => ({
        get: async () => ({ docs: students.map(({ id, ...data }) => ({ id, data: () => data })) })
      }) }) };
    },
    doc: () => ({ get: async () => ({ data: () => ({ schoolYear: '2026-2027' }) }) }),
    runTransaction: async callback => callback({ get: async () => ({ data: () => ({}) }), set: () => {} })
  };
  globalThis.__identityBridge = {
    apps, initializeApp: (_options, name) => { const app = { name }; apps.push(app); return app; }, store,
    getAuth: app => ({ createCustomToken: async (uid, claims) => { tokens.push({ app, uid, claims }); return 'fixture-token'; } })
  };
  try {
    Object.assign(process.env, { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'fixture', private_key: 'fixture', client_email: 'fixture' }),
      KHL_APP_ID: 'first-app', IDENTITY_BRIDGE_TOKEN: 'fixture', APPS_SCRIPT_URL: 'https://fixture.invalid/', APPS_SCRIPT_CLIENT_TOKEN: 'fixture' });
    globalThis.fetch = async (_url, options) => {
      const payload = JSON.parse(options.body);
      return { ok: true, json: async () => payload.action === 'getSessionIdentity'
        ? { status: 'success', identity: { role: 'teacher', teacherId: 'teacher/with punctuation', schoolCode: 'NAN', grades: ['6'], subjects: ['Toán'], sessionVersion: 1, expiresAt: Date.now() + 3600000 } }
        : { status: 'success', studentSessionToken: 'fixture-session', expiresAt: Date.now() + 3600000 } };
    };
    const outfile = join(directory, 'bridge.mjs');
    await build({ entryPoints: ['netlify/functions/identity.mjs'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'fake-admin', setup(builder) {
        builder.onResolve({ filter: /^firebase-admin\// }, args => ({ path: args.path, namespace: 'fake' }));
        builder.onLoad({ filter: /.*/, namespace: 'fake' }, args => ({ contents: args.path.endsWith('/app')
          ? 'const b=globalThis.__identityBridge; export const getApps=()=>b.apps,initializeApp=b.initializeApp,cert=x=>x;'
          : args.path.endsWith('/auth') ? 'export const getAuth=globalThis.__identityBridge.getAuth;'
            : 'export const getFirestore=()=>globalThis.__identityBridge.store;', loader: 'js' }));
      } }] });
    const { handler } = await import(pathToFileURL(outfile));
    const login = async kind => {
      const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ kind, accessCode: 'HS001', staffSessionToken: 'fixture' }) });
      assert.equal(response.statusCode, 200);
      return tokens.at(-1);
    };
    const first = await login('student');
    assert.equal(first.app.name, 'khl-identity');
    assert.equal(first.claims.studentId, 'current'); assert.equal(first.claims.grade, '10');
    assert.equal(first.claims.schoolYear, '2026-2027');
    assert.deepEqual(first.claims.studentIds, ['past', 'current']);
    process.env.KHL_APP_ID = 'second-app';
    const second = await login('student');
    assert.notEqual(first.uid, second.uid); assert.equal(second.claims.appId, 'second-app');
    const teacherSecond = await login('staff');
    assert.match(teacherSecond.uid, /^teacher_[a-f0-9]{40}$/);
    process.env.KHL_APP_ID = 'first-app';
    const teacherFirst = await login('staff');
    assert.notEqual(teacherFirst.uid, teacherSecond.uid);
    assert.equal(apps.filter(app => app.name === 'khl-identity').length, 1);
  } finally {
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    globalThis.fetch = previousFetch; delete globalThis.__identityBridge;
    await rm(directory, { recursive: true, force: true });
  }
});
