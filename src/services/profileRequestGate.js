import { collection, doc, getDocsFromServer, query, runTransaction, where } from 'firebase/firestore';
import { db, appId } from '../config/firebase';
import { isPendingProfileRequest, PROFILE_REQUEST_PENDING_MESSAGE } from '../utils/profileRequestPolicy';
import { PROFILE_INTAKE_ENABLED, requestProfileIntake } from './profileIntake';

const requests = () => collection(db, 'artifacts', appId, 'public', 'data', 'student_profile_requests');

export async function assertNoPendingProfileRequest(studentId) {
  if (!studentId) throw new Error('Không tìm thấy hồ sơ học sinh.');
  if(PROFILE_INTAKE_ENABLED){const result=await requestProfileIntake('check');if(result.requests?.length)throw new Error(PROFILE_REQUEST_PENDING_MESSAGE);return;}
  const snapshot = await getDocsFromServer(query(requests(), where('studentId', '==', studentId)));
  if (snapshot.docs.some(item => isPendingProfileRequest(item.data()))) throw new Error(PROFILE_REQUEST_PENDING_MESSAGE);
}

export async function createPendingProfileRequest(payload) {
  if(PROFILE_INTAKE_ENABLED){
    const result=await requestProfileIntake('submit',{changes:payload.changes});
    return result.id;
  }
  const target = doc(requests(), `profile-${payload.studentId}`);
  // A fixed ID and transactional check also block simultaneous submissions from two tabs.
  return runTransaction(db, async transaction => {
    const previous = (await transaction.get(target)).data();
    if (isPendingProfileRequest(previous)) throw new Error(PROFILE_REQUEST_PENDING_MESSAGE);
    const now = Date.now();
    transaction.set(target, { ...payload, status: 'pending', createdAt: now, updatedAt: now });
    return target.id;
  });
}
