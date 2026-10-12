import test from 'node:test';
import assert from 'node:assert/strict';
import { approveProfileRequestGroups, groupProfileRequests } from '../src/utils/profileRequestBatch.js';

test('bulk approval merges repeated student requests chronologically without losing unrelated fields', async () => {
  const requests = [
    { id: 'new', studentId: 'a', createdAt: 20, changes: { portraitUrl: 'new.jpg', phone: '' } },
    { id: 'b', studentId: 'b', createdAt: 15, changes: { phone: '456' } },
    { id: 'old', studentId: 'a', createdAt: 10, changes: { portraitUrl: 'old.jpg', phone: '123', fatherName: 'Ba' } }
  ];
  const original = structuredClone(requests);
  const groups = groupProfileRequests(requests);
  assert.deepEqual(groups.find(group => group.studentId === 'a').changes, { portraitUrl: 'new.jpg', phone: '', fatherName: 'Ba' });
  const calls = [], progress = [];
  const result = await approveProfileRequestGroups(groups, async group => {
    calls.push(group.studentId);
    if (group.studentId === 'b') throw new Error('Hồ sơ vừa thay đổi');
    return { id: group.studentId };
  }, value => progress.push(value));
  assert.deepEqual(calls.sort(), ['a', 'b']);
  assert.deepEqual(result.succeeded[0].record.requests.map(request => request.id), ['old', 'new']);
  assert.equal(result.failed[0].record.requests[0].id, 'b');
  assert.deepEqual(progress.at(-1), { completed: 3, succeeded: 2, failed: 1 });
  assert.deepEqual(requests, original);
});

test('bulk approval limits concurrent student writes and handles an empty list', async () => {
  let active = 0, peak = 0;
  const groups = groupProfileRequests(Array.from({ length: 9 }, (_, index) => ({ id: String(index), studentId: String(index), changes: { phone: String(index) } })));
  const result = await approveProfileRequestGroups(groups, async group => {
    active++; peak = Math.max(active, peak);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return group.studentId;
  });
  assert.equal(peak, 3);
  assert.equal(result.succeeded.length, 9);
  assert.equal(result.failed.length, 0);
  assert.deepEqual(await approveProfileRequestGroups([], () => assert.fail('no writes')), { succeeded: [], failed: [] });
});
