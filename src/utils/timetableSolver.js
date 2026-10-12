// Hard constraints: one lesson per class/slot, one class per teacher/slot,
// fixed cells, teaching days and daily period limits. Preferences only order
// the search; they never rule out an otherwise valid timetable.
const bitCount = value => {
  let bits = value >>> 0, count = 0;
  while (bits) { bits &= bits - 1; count += 1; }
  return count;
};

export async function solveTimetable({ rows, tasks, fixed = [], dayPeriodCounts, signal, variant = 0,
  maxNodes = 150000, maxDurationMs = 2500, yieldEvery = 400, onProgress }) {
  const started = Date.now();
  const slots = Object.entries(dayPeriodCounts).flatMap(([dayKey, count]) =>
    Array.from({ length: count }, (_, index) => ({ dayKey, period: index + 1 })));
  if (slots.length > 30) throw new Error('Timetable supports at most 30 teaching slots.');
  const rowIndex = new Map(rows.map((row, index) => [row.id, index]));
  const rowBusy = new Uint32Array(rows.length);
  const teacherBusy = new Map();
  const issues = [];
  const placements = [];
  let nodes = 0, backtracks = 0, stopped = '';
  let lastYield = started;
  const result = status => ({ status, placements: status === 'complete' ? placements.map(item => ({ ...item, periods: [...item.periods] })) : [],
    issues, stats: { nodes, backtracks, elapsedMs: Date.now() - started } });
  if (signal?.aborted) return result('cancelled');
  const slotIndex = new Map(slots.map((slot, index) => [`${slot.dayKey}:${slot.period}`, index]));
  const fixedTeacherSlots = new Map();
  fixed.forEach(cell => {
    const row = rowIndex.get(cell.rowId), index = slotIndex.get(`${cell.dayKey}:${cell.period}`);
    if (row === undefined || index === undefined) {
      issues.push({ kind: 'invalidFixed', rowId: cell.rowId, dayKey: cell.dayKey, period: cell.period });
      return;
    }
    const mask = 1 << index;
    if (rowBusy[row] & mask) issues.push({ kind: 'duplicateFixed', rowId: cell.rowId });
    rowBusy[row] |= mask;
    [...new Set(cell.teacherKeys || [])].forEach(key => {
      if ((teacherBusy.get(key) || 0) & mask) issues.push({ kind: 'fixedTeacherConflict', teacherKey: key,
        rowId: cell.rowId, otherRowId: fixedTeacherSlots.get(`${key}:${index}`), dayKey: cell.dayKey, period: cell.period });
      teacherBusy.set(key, (teacherBusy.get(key) || 0) | mask);
      fixedTeacherSlots.set(`${key}:${index}`, cell.rowId);
    });
  });
  const groups = tasks.filter(task => task.count > 0).map(task => {
    if (!rowIndex.has(task.rowId) || !Number.isInteger(task.count) || ![1, 2].includes(task.blockLength)) throw new Error('Invalid timetable task.');
    const candidates = slots.flatMap((slot, index) => {
      if (slot.period + task.blockLength - 1 > dayPeriodCounts[slot.dayKey]) return [];
      const periods = Array.from({ length: task.blockLength }, (_, offset) => slot.period + offset);
      return [{ dayKey: slot.dayKey, periods, index, mask: ((1 << task.blockLength) - 1) << index }];
    });
    return { ...task, row: rowIndex.get(task.rowId), teacherKeys: [...new Set(task.teacherKeys || [])], candidates };
  });
  const remaining = groups.map(group => group.count);
  const lastIndex = groups.map(() => -1);
  const rowDemand = rows.map((_, row) => groups.reduce((sum, group) => sum + (group.row === row ? group.count * group.blockLength : 0), 0));
  const teacherDemand = new Map();
  groups.forEach(group => group.teacherKeys.forEach(key => teacherDemand.set(key, (teacherDemand.get(key) || 0) + group.count * group.blockLength)));
  rowDemand.forEach((demand, row) => {
    const available = slots.length - bitCount(rowBusy[row]);
    if (demand > available) issues.push({ kind: 'rowCapacity', rowId: rows[row].id, demand, available });
  });
  teacherDemand.forEach((demand, key) => {
    const available = slots.length - bitCount(teacherBusy.get(key) || 0);
    if (demand > available) issues.push({ kind: 'teacherCapacity', teacherKey: key, demand, available });
  });
  // A five-period day can hold at most two non-overlapping double periods.
  // Detect this bottleneck before searching, so the caller can try single slots.
  const pairCapacity = busy => {
    let pairs = 0, run = 0, previousDay;
    slots.forEach((slot, index) => {
      if (slot.dayKey !== previousDay || (busy & (1 << index))) {
        pairs += Math.floor(run / 2); run = 0;
      }
      if (!(busy & (1 << index))) run += 1;
      previousDay = slot.dayKey;
    });
    return pairs + Math.floor(run / 2);
  };
  const rowPairs = rows.map(() => 0), teacherPairs = new Map();
  groups.filter(group => group.blockLength === 2).forEach(group => {
    rowPairs[group.row] += group.count;
    group.teacherKeys.forEach(key => teacherPairs.set(key, (teacherPairs.get(key) || 0) + group.count));
  });
  rowPairs.forEach((demand, row) => {
    const available = pairCapacity(rowBusy[row]);
    if (demand > available) issues.push({ kind: 'pairCapacity', rowId: rows[row].id, demand, available });
  });
  teacherPairs.forEach((demand, key) => {
    const available = pairCapacity(teacherBusy.get(key) || 0);
    if (demand > available) issues.push({ kind: 'pairCapacity', teacherKey: key, demand, available });
  });
  if (issues.length) return result('infeasible');

  const dayMasks = Object.fromEntries(Object.keys(dayPeriodCounts).map(day => [day, slots.reduce((mask, slot, index) => slot.dayKey === day ? mask | (1 << index) : mask, 0)]));
  const preference = (group, candidate) => {
    const related = placements.filter(item => item.rowId === group.rowId && item.dayKey === candidate.dayKey);
    const same = related.filter(item => item.key === group.key);
    const sameCount = same.reduce((sum, item) => sum + item.periods.length, 0);
    const adjacent = same.some(item => item.periods.some(period => candidate.periods.some(target => Math.abs(period - target) === 1)));
    let score = sameCount * 150 + bitCount(rowBusy[group.row] & dayMasks[candidate.dayKey]) * 4;
    if (group.blockLength === 1 && sameCount === 1 && adjacent) score -= 250;
    if (group.pairWithKey && related.some(item => item.key === group.pairWithKey)) score -= 170;
    if (group.compactVisit) group.teacherKeys.forEach(key => {
      const count = bitCount((teacherBusy.get(key) || 0) & dayMasks[candidate.dayKey]);
      score += count === 1 ? -80 : count >= 2 ? count * 10 : 0;
    });
    return score;
  };
  const search = async depth => {
    if (signal?.aborted) { stopped = 'cancelled'; return false; }
    if (nodes >= maxNodes || Date.now() - started >= maxDurationMs) { stopped = 'limit'; return false; }
    nodes += 1;
    if (nodes % yieldEvery === 0 || Date.now() - lastYield >= 16) {
      onProgress?.({ nodes, backtracks, placed: depth });
      await new Promise(resolve => setTimeout(resolve, 0));
      lastYield = Date.now();
      if (signal?.aborted) { stopped = 'cancelled'; return false; }
    }
    let chosen = -1, domain;
    for (let index = 0; index < groups.length; index += 1) {
      if (!remaining[index]) continue;
      const group = groups[index];
      let busy = rowBusy[group.row];
      group.teacherKeys.forEach(key => { busy |= teacherBusy.get(key) || 0; });
      const candidates = group.candidates.filter(candidate => candidate.index > lastIndex[index] && !(candidate.mask & busy));
      if (candidates.length < remaining[index]) return false;
      if (chosen < 0 || candidates.length / remaining[index] < domain.length / remaining[chosen]
        || (candidates.length / remaining[index] === domain.length / remaining[chosen] && group.blockLength > groups[chosen].blockLength)) {
        chosen = index; domain = candidates;
      }
    }
    if (chosen < 0) return true;
    for (let row = 0; row < rows.length; row += 1) if (rowDemand[row] > slots.length - bitCount(rowBusy[row])) return false;
    for (const [key, demand] of teacherDemand) if (demand > slots.length - bitCount(teacherBusy.get(key) || 0)) return false;
    const group = groups[chosen];
    const rank = candidate => (candidate.index + variant * (group.row + 1)) % slots.length;
    domain.sort((left, right) => preference(group, left) - preference(group, right) || rank(left) - rank(right));
    for (const candidate of domain) {
      const priorIndex = lastIndex[chosen];
      lastIndex[chosen] = candidate.index;
      remaining[chosen] -= 1;
      rowDemand[group.row] -= group.blockLength;
      rowBusy[group.row] |= candidate.mask;
      group.teacherKeys.forEach(key => {
        teacherBusy.set(key, (teacherBusy.get(key) || 0) | candidate.mask);
        teacherDemand.set(key, teacherDemand.get(key) - group.blockLength);
      });
      placements.push({ rowId: group.rowId, key: group.key, value: group.value, teacherKeys: group.teacherKeys, dayKey: candidate.dayKey, periods: candidate.periods });
      if (await search(depth + 1)) return true;
      placements.pop();
      rowBusy[group.row] &= ~candidate.mask;
      rowDemand[group.row] += group.blockLength;
      group.teacherKeys.forEach(key => {
        teacherBusy.set(key, teacherBusy.get(key) & ~candidate.mask);
        teacherDemand.set(key, teacherDemand.get(key) + group.blockLength);
      });
      remaining[chosen] += 1;
      lastIndex[chosen] = priorIndex;
      backtracks += 1;
      if (stopped) return false;
    }
    return false;
  };
  return result(await search(0) ? 'complete' : (stopped || 'infeasible'));
}
