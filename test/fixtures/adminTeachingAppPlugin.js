import { resolve } from 'node:path';

export function adminTeachingAppPlugin() {
  const backend = resolve('test/fixtures/adminTeachingFirestore.js');
  return { name: 'admin-teaching-local-backend', setup(builder) {
    builder.onResolve({ filter: /(?:config\/firebase|^firebase\/firestore)(?:\.js)?$/ }, () => ({ path: backend }));
    builder.onResolve({ filter: /^firebase\/auth$/ }, () => ({ path: 'auth', namespace: 'admin-fixture' }));
    builder.onResolve({ filter: /utils\/helpers(?:\.js)?$/ }, args => args.namespace === 'admin-fixture' ? undefined : ({ path: 'helpers', namespace: 'admin-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'admin-fixture' }, args => ({ resolveDir: resolve('.'), contents: args.path === 'helpers'
      ? `export * from ${JSON.stringify(resolve('src/utils/helpers.js').replaceAll('\\', '/'))}; export {request as postAppsScript} from ${JSON.stringify(backend.replaceAll('\\', '/'))};`
      : `import {auth,fixtureUser} from ${JSON.stringify(backend.replaceAll('\\', '/'))};
        export const onAuthStateChanged=(_,next)=>{next(fixtureUser);return ()=>{};};
        export const signInAnonymously=async()=>({user:fixtureUser}); export const signInWithCustomToken=signInAnonymously;
        export const setPersistence=async()=>{}; export const signOut=async()=>{}; export const browserSessionPersistence={},browserLocalPersistence={}; export const getAuth=()=>auth;`
    }));
  } };
}
