import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function firebaseServer() {
  let app = getApps().find(item => item.name === 'khl-identity');
  if (!app) {
    const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    if (!account.project_id || !account.private_key || !account.client_email) throw new Error('Firebase server chưa được cấu hình.');
    app = initializeApp({ credential: cert(account) }, 'khl-identity');
  }
  return { store: getFirestore(app), auth: getAuth(app), appId: process.env.KHL_APP_ID || 'kho-hoc-lieu-chinh' };
}

export async function verifyStaffSession(payload) {
  const { APPS_SCRIPT_URL: url, APPS_SCRIPT_CLIENT_TOKEN: clientToken, IDENTITY_BRIDGE_TOKEN: identityBridgeToken } = process.env;
  if (!url || !clientToken || !identityBridgeToken) throw new Error('Chưa cấu hình máy chủ xác thực.');
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'getSessionIdentity', clientToken, identityBridgeToken,
      adminSessionToken: payload.adminSessionToken || '', staffSessionToken: payload.staffSessionToken || '' }),
    signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Máy chủ xác thực chưa phản hồi.');
  const result = await response.json();
  if (result.status !== 'success' || !result.identity) throw new Error('Phiên nhân viên đã hết hiệu lực.');
  return result.identity;
}
