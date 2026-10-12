// Merge from oldest to newest: a repeated request must not restore an older value.
export function groupProfileRequests(requests) {
  const groups = new Map();
  for (const request of [...requests].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0) || Number(a.updatedAt || 0) - Number(b.updatedAt || 0))) {
    const group = groups.get(request.studentId) || { studentId: request.studentId, requests: [], changes: {} };
    group.requests.push(request);
    Object.assign(group.changes, request.changes);
    groups.set(request.studentId, group);
  }
  return [...groups.values()];
}

// Save independently per student; retain failures and report progress without waiting on Sheet.
export async function approveProfileRequestGroups(groups, save, onProgress) {
  const succeeded = [], failed = [];
  let next = 0, completed = 0;
  await Promise.all(Array.from({ length: Math.min(3, groups.length) }, async () => {
    while (next < groups.length) {
      const group = groups[next++];
      try { succeeded.push({ record: group, value: await save(group) }); }
      catch (error) { failed.push({ record: group, error }); }
      completed += group.requests.length;
      onProgress?.({ completed, succeeded: succeeded.reduce((count, item) => count + item.record.requests.length, 0), failed: failed.reduce((count, item) => count + item.record.requests.length, 0) });
    }
  }));
  return { succeeded, failed };
}
