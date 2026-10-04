import { collection, getCountFromServer } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { SCOPED_AUTH_ENABLED } from './scopedIdentity';
import { requestPrivateApi } from './serverQuizClient';

// Reading statistics must not create a backup job or enable a maintenance fence.
export async function readSystemSummary() {
  if (SCOPED_AUTH_ENABLED) return requestPrivateApi('system', 'readSummary', {});
  const names = ['students', 'scorebooks', 'class_attendance'];
  const counts = await Promise.all(names.map(async name => [name, (await getCountFromServer(collection(db, 'artifacts', appId, 'public', 'data', name))).data().count]));
  return { counts: Object.fromEntries(counts), readAt: Date.now() };
}
