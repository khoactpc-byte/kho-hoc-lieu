import { firebaseStore } from '../lib/firebaseStore.mjs';
import { createEssayWorkService, dispatchEssayJobs } from '../lib/essayWork.mjs';
export default async function () {
  const ids = await createEssayWorkService(firebaseStore()).pendingIds();
  if (ids.length) await dispatchEssayJobs(ids);
}
export const config = { schedule: '*/5 * * * *' };
