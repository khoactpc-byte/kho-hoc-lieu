import test from 'node:test';
import assert from 'node:assert/strict';
import { findDropoutContinuation } from '../src/utils/studentJourney.js';

test('finds an active school-year record after a dropped record', () => {
  assert.deepEqual(findDropoutContinuation([
    { schoolYear: '2025 - 2026', className: '8A', status: 'dropped' },
    { schoolYear: '2026-2027', className: '9A', status: 'active' }
  ]), {
    droppedSchoolYear: '2025 - 2026',
    continuedSchoolYear: '2026-2027',
    className: '9A'
  });
});

test('does not warn when the dropped record is the latest school year', () => {
  assert.equal(findDropoutContinuation([
    { schoolYear: '2025-2026', className: '8A', status: 'active' },
    { schoolYear: '2026-2027', className: '8A', status: 'dropped' }
  ]), null);
});

test('does not warn when no school-year record is dropped', () => {
  assert.equal(findDropoutContinuation([
    { schoolYear: '2025-2026', className: '8A', status: 'active' },
    { schoolYear: '2026-2027', className: '9A', status: 'active' }
  ]), null);
});
