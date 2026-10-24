import { firebaseStore } from '../lib/firebaseStore.mjs';
import { createLessonDeliveryService } from '../lib/lessonDelivery.mjs';
export default async function () {
  if (process.env.KHL_LESSON_SYNC_ENABLED !== 'true') return;
  const result = await createLessonDeliveryService(firebaseStore()).drain();
  if (result.processed) console.log('Lesson delivery batch:', result);
}
export const config = { schedule: '*/5 * * * *' };
