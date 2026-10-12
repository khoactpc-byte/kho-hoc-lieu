import test from 'node:test';
import assert from 'node:assert/strict';
import { solveTimetable } from '../src/utils/timetableSolver.js';

const task = (rowId, key, teacher, blockLength = 1, count = 1) => ({ rowId, key, value: key, teacherKeys: teacher ? [teacher] : [], blockLength, count });
const verify = (problem, result) => {
  assert.equal(result.status, 'complete');
  const rowSlots = new Set(), teacherSlots = new Set(), counts = new Map();
  const reserve = (cell, periods) => periods.forEach(period => {
    assert.ok(period > 0 && period <= problem.dayPeriodCounts[cell.dayKey]);
    const rowSlot = `${cell.rowId}:${cell.dayKey}:${period}`;
    assert.equal(rowSlots.has(rowSlot), false, `overlap ${rowSlot}`); rowSlots.add(rowSlot);
    for (const key of cell.teacherKeys || []) {
      const teacherSlot = `${key}:${cell.dayKey}:${period}`;
      assert.equal(teacherSlots.has(teacherSlot), false, `teacher overlap ${teacherSlot}`); teacherSlots.add(teacherSlot);
    }
  });
  problem.fixed?.forEach(cell => reserve(cell, [cell.period]));
  result.placements.forEach(placement => {
    reserve(placement, placement.periods);
    if (placement.periods.length === 2) assert.equal(placement.periods[1], placement.periods[0] + 1);
    const key = `${placement.rowId}:${placement.key}`;
    counts.set(key, (counts.get(key) || 0) + placement.periods.length);
  });
  const expected = new Map();
  problem.tasks.forEach(group => {
    const key = `${group.rowId}:${group.key}`;
    expected.set(key, (expected.get(key) || 0) + group.count * group.blockLength);
  });
  assert.deepEqual(counts, expected);
};

test('backtracking repairs an early placement to complete a tightly constrained three-class timetable', async () => {
  const problem = { rows: ['A', 'B', 'C'].map(id => ({ id })), dayPeriodCounts: { 2: 3, 3: 2 },
    tasks: [task('A', 'Math', 'T1', 2), task('A', 'Art', 'T2'), task('A', 'Music', 'T0'),
      task('B', 'Math', 'T2', 2), task('B', 'Art', 'T0'), task('B', 'Music', 'T1'),
      task('C', 'Math', 'T0', 2), task('C', 'Art', 'T1'), task('C', 'Music', 'T2')],
    fixed: [{ rowId: 'B', dayKey: '2', period: 1, value: '__OFF__' }, { rowId: 'C', dayKey: '2', period: 3, value: '__OFF__' }] };
  const original = structuredClone(problem);
  const result = await solveTimetable(problem);
  verify(problem, result);
  assert.ok(result.stats.backtracks > 0, 'must revisit an earlier decision');
  assert.deepEqual(problem, original, 'search must not mutate the current timetable');
});

test('an overloaded teacher and conflicting fixed lessons report the actual bottleneck without a partial result', async () => {
  const overloaded = await solveTimetable({ rows: [{ id: 'A' }, { id: 'B' }], tasks: [task('A', 'Math', 'T', 1, 3), task('B', 'Math', 'T', 1, 3)], dayPeriodCounts: { 2: 4 } });
  assert.equal(overloaded.status, 'infeasible');
  assert.deepEqual(overloaded.issues, [{ kind: 'teacherCapacity', teacherKey: 'T', demand: 6, available: 4 }]);
  assert.deepEqual(overloaded.placements, []);
  const conflicting = await solveTimetable({ rows: [{ id: 'A' }, { id: 'B' }], tasks: [], dayPeriodCounts: { 2: 4 }, fixed: [
    { rowId: 'A', dayKey: '2', period: 1, teacherKeys: ['T'] }, { rowId: 'B', dayKey: '2', period: 1, teacherKeys: ['T'] }] });
  assert.equal(conflicting.status, 'infeasible');
  assert.equal(conflicting.issues[0].kind, 'fixedTeacherConflict');
});

test('joint teachers, fixed rest cells and different daily limits are all enforced', async () => {
  const problem = { rows: [{ id: 'A&B' }, { id: 'C' }], dayPeriodCounts: { 2: 2, 3: 0, 4: 3 },
    tasks: [{ ...task('A&B', 'Science', '', 2), teacherKeys: ['T1', 'T2'] }, task('C', 'Math', 'T1'), task('C', 'Art', 'T2')],
    fixed: [{ rowId: 'A&B', dayKey: '4', period: 2, value: '__OFF__' }, { rowId: 'C', dayKey: '4', period: 3, teacherKeys: ['T1'] }] };
  verify(problem, await solveTimetable(problem));
});

test('cancellation and search limits remain distinct from an impossible timetable', async () => {
  const problem = { rows: [{ id: 'A' }], tasks: [task('A', 'Math', 'T')], dayPeriodCounts: { 2: 2 } };
  assert.equal((await solveTimetable({ ...problem, maxNodes: 0 })).status, 'limit');
  const controller = new AbortController();
  const cancelled = await solveTimetable({ ...problem, signal: controller.signal, yieldEvery: 1, onProgress: () => controller.abort() });
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(cancelled.placements, []);
});

test('six classes with shared subject teachers complete all weekly loads', async () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({ id: String(index) }));
  const problem = { rows, dayPeriodCounts: { 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5 }, tasks: rows.flatMap(row => [
    task(row.id, 'Math', 'MathTeacher', 2, 2), task(row.id, 'Literature', 'LiteratureTeacher', 2, 2), task(row.id, 'Science', 'ScienceTeacher', 2, 2),
    task(row.id, 'History', 'HistoryTeacher', 2), task(row.id, 'History', 'HistoryTeacher'),
    ...['Civics', 'Technology', 'Local', 'Activity', 'Homeroom'].map(subject => task(row.id, subject, subject + row.id))]) };
  verify(problem, await solveTimetable({ ...problem, maxDurationMs: 5000 }));
});

test('seven classes can complete shared-teacher loads by relaxing double periods, without inventing extra teaching slots', async () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({ id: String(index) }));
  const tasks = rows.flatMap(row => [task(row.id, 'Math', 'Math', 2, 2), task(row.id, 'Literature', 'Literature', 2, 2),
    task(row.id, 'Science', 'Science', 2, 2), task(row.id, 'History', 'History', 2), task(row.id, 'History', 'History'),
    ...['Civics', 'Technology', 'Local', 'Activity', 'Homeroom'].map(subject => task(row.id, subject, subject))]);
  const dayPeriodCounts = { 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, 7: 5 };
  const paired = await solveTimetable({ rows, tasks, dayPeriodCounts });
  assert.equal(paired.status, 'infeasible');
  assert.ok(paired.issues.some(issue => issue.kind === 'pairCapacity' && issue.teacherKey === 'Math' && issue.demand === 14 && issue.available === 12));
  const singles = tasks.map(group => ({ ...group, count: group.count * group.blockLength, blockLength: 1 }));
  const problem = { rows, tasks: singles, dayPeriodCounts };
  verify(problem, await solveTimetable({ ...problem, maxDurationMs: 3500 }));
});

test('small feasibility decisions agree with an independent exhaustive slot assignment', async () => {
  const oracle = (tasks, fixed) => {
    const usedRows = new Set(fixed.map(cell => `${cell.rowId}:${cell.period}`)), usedTeachers = new Set();
    const visit = index => {
      if (index === tasks.length) return true;
      const current = tasks[index];
      for (let period = 1; period <= 3; period += 1) {
        const rowSlot = `${current.rowId}:${period}`, teacherSlot = `${current.teacherKeys[0]}:${period}`;
        if (usedRows.has(rowSlot) || usedTeachers.has(teacherSlot)) continue;
        usedRows.add(rowSlot); usedTeachers.add(teacherSlot);
        if (visit(index + 1)) return true;
        usedRows.delete(rowSlot); usedTeachers.delete(teacherSlot);
      }
      return false;
    };
    return visit(0);
  };
  for (let mask = 0; mask < 32; mask += 1) {
    const tasks = [0, 1, 2, 3].map(index => task(index < 2 ? 'A' : 'B', String(index), `T${(mask >> index) & 1}`));
    const fixed = mask & 16 ? [{ rowId: 'A', dayKey: '2', period: 2, value: '__OFF__' }] : [];
    const problem = { rows: [{ id: 'A' }, { id: 'B' }], tasks, fixed, dayPeriodCounts: { 2: 3 } };
    const result = await solveTimetable({ ...problem, variant: mask % 5 });
    assert.equal(result.status === 'complete', oracle(tasks, fixed), `case ${mask}`);
    if (result.status === 'complete') verify(problem, result);
  }
});
