import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Workers only need Firestore. Keep Auth's JWT dependencies out of their runtime.
export function firebaseStore() {
  let app = getApps().find(item => item.name === 'khl-identity');
  if (!app) {
    const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    if (!account.project_id || !account.private_key || !account.client_email) throw new Error('Firebase server chưa được cấu hình.');
    app = initializeApp({ credential: cert(account) }, 'khl-identity');
  }
  return { app, store: getFirestore(app), appId: process.env.KHL_APP_ID || 'kho-hoc-lieu-chinh' };
}
