import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsyncScope } from '../src/utils/asyncScope.js';

test('late account/view responses cannot replace a new request, including a return to the same view', async () => {
  const scope = createAsyncScope();
  scope.setScope('student-a:quiz-1');
  let completeOld;
  let rendered = null;
  const old = scope.begin('submit');
  const oldResponse = new Promise(resolve => { completeOld = resolve; }).then(result => {
    if (scope.isCurrent(old)) rendered = result;
    return scope.finish(old);
  });
  assert.equal(scope.begin('submit'), null); // Click and auto-submit cannot start two writes.
  scope.setScope('student-b:quiz-2');
  scope.setScope('student-a:quiz-1');
  const next = scope.begin('submit');
  completeOld('old-result');
  assert.equal(await oldResponse, false);
  assert.equal(rendered, null);
  assert.equal(scope.isCurrent(next), true);
  assert.equal(scope.begin('submit'), null); // The old finally did not release the new write.
  assert.equal(scope.finish(next), true);
  const current = scope.begin('submit');
  scope.invalidate(); // Logout takes effect before the next React render.
  assert.equal(scope.isCurrent(current), false);
});
