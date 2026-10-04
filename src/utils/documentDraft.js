import { sameData as equal } from './dataEquality.js';

export function draftPatch(base = {}, draft = {}) {
  return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(draft)])]
    .filter(key => !equal(base[key], draft[key]))
    .map(key => [key, Object.hasOwn(draft, key) ? draft[key] : undefined]));
}

export function mergeRemoteDraft(base = {}, draft = {}, remote = {}) {
  const changes = draftPatch(base, draft);
  const next = { ...remote };
  Object.entries(changes).forEach(([key, value]) => {
    if (value === undefined) delete next[key];
    else next[key] = value;
  });
  return next;
}

export function assertNoDraftConflicts(base, patch, remote) {
  for (const [key, value] of Object.entries(patch)) {
    if (!equal(remote[key], base[key]) && !equal(remote[key], value)) {
      throw new Error('Có người khác vừa sửa ô này. Bản nháp vẫn được giữ; tải lại hoặc đối chiếu trước khi lưu.');
    }
  }
}
