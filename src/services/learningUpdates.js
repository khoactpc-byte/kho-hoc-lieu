import { collection, doc, query, orderBy, limit, onSnapshot, runTransaction, writeBatch } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { LEARNING_UPDATES_COLLECTION, learningSourceCollection, learningUpdateId, learningUpdateMetadata } from '../utils/learningUpdates';
import { sameData } from '../utils/dataEquality';

const refFor = (name, id) => doc(db, 'artifacts', appId, 'public', 'data', name, id);
export async function saveLegacyQuizContent(quizId, payload) {
  const batch = writeBatch(db);
  batch.set(refFor('lesson_quizzes', quizId), payload, { merge: true });
  const metadata = learningUpdateMetadata('quiz', quizId, payload);
  if (metadata) batch.set(refFor(LEARNING_UPDATES_COLLECTION, learningUpdateId('quiz', quizId)), metadata);
  await batch.commit();
}
export function observeLearningUpdates(next, onError) {
  return onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', LEARNING_UPDATES_COLLECTION), orderBy('updatedAt', 'desc'), limit(80)),
    snapshot => next(snapshot.docs.map(item => item.data())), onError);
}
export async function syncLearningUpdate(kind, sourceId, shouldContinue = () => true) {
  const sourceName = learningSourceCollection(kind);
  if (!sourceName || !sourceId || !shouldContinue()) return;
  const updateRef = refFor(LEARNING_UPDATES_COLLECTION, learningUpdateId(kind, sourceId));
  await runTransaction(db, async transaction => {
    const source = await transaction.get(refFor(sourceName, sourceId));
    const previous = await transaction.get(updateRef);
    if (!shouldContinue()) return;
    const metadata = source.exists() ? learningUpdateMetadata(kind, sourceId, source.data()) : null;
    if (metadata) {
      if (!sameData(metadata, previous.data())) transaction.set(updateRef, metadata);
    } else if (previous.exists()) transaction.delete(updateRef);
  });
}
