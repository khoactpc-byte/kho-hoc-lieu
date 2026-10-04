import assert from 'node:assert/strict';
import { FieldValue } from 'firebase-admin/firestore';

// Deterministic transactional backend for service tests; Rules use the emulator separately.
export function memoryStore() {
  let data = new Map(), queue = Promise.resolve();
  const clone = value => value == null ? value : structuredClone(value);
  const field = (target, segments, value) => {
    let parent = target;
    for (const key of segments.slice(0, -1)) parent = parent[key] ||= {};
    if (value?.isEqual?.(FieldValue.delete())) delete parent[segments.at(-1)]; else parent[segments.at(-1)] = clone(value);
  };
  const snapshot = path => ({ id: path.split('/').at(-1), ref: store.doc(path), exists: data.has(path), data: () => clone(data.get(path)) });
  const collection = (path, filters = [], maximum = Infinity, after = '') => ({
    path, doc: id => store.doc(`${path}/${id}`),
    where: (key, op, value) => collection(path, [...filters, { key, op, value }], maximum, after),
    orderBy: () => collection(path, filters, maximum, after), limit: limit => collection(path, filters, limit, after),
    startAfter: id => collection(path, filters, maximum, id),
    count: () => ({ get: async () => { const result = await collection(path, filters, maximum, after).get(); return { data: () => ({ count: result.size }) }; } }),
    async listDocuments() { return [...new Set([...data.keys()].filter(key => key.startsWith(path + '/')).map(key => key.slice(path.length + 1).split('/')[0]))].sort().map(id => store.doc(`${path}/${id}`)); },
    async get() {
      const docs = [...data.keys()].filter(key => key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1)
        .sort().map(snapshot).filter(item => item.id > after && filters.every(({ key, op, value }) => op === 'in' ? value.includes(item.data()[key]) : item.data()[key] === value)).slice(0, maximum);
      return { docs, size: docs.length, empty: !docs.length };
    }
  });
  const commit = operations => {
    if (store.failCommit) throw new Error('fixture commit failure');
    // Snapshots are cloned on read and changed records are cloned below.
    const next = new Map(data);
    for (const { type, ref, value, options, args } of operations) {
      if (type === 'delete') { next.delete(ref.path); continue; }
      if (type === 'create') { assert.equal(next.has(ref.path), false); next.set(ref.path, clone(value)); continue; }
      if (type === 'set' && !options) { next.set(ref.path, clone(value)); continue; }
      const target = clone(next.get(ref.path) || {});
      if (type === 'set') {
        if (options.merge) for (const [key, v] of Object.entries(value)) field(target, [key], v);
        else for (const f of options.mergeFields) { const segments = typeof f === 'string' ? [f] : f.segments; field(target, segments, segments.reduce((item, key) => item?.[key], value)); }
      } else {
        assert.equal(next.has(ref.path), true);
        if (args.length === 1) Object.entries(args[0]).forEach(([key, v]) => field(target, [key], v));
        else for (let i = 0; i < args.length; i += 2) field(target, args[i].segments, args[i + 1]);
      }
      next.set(ref.path, target);
    }
    data = next; if (operations.length) store.commits++;
  };
  const store = {
    failCommit: false, commits: 0, collection,
    doc: path => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path), collection: name => collection(`${path}/${name}`),
      set: async (value, options) => commit([{ type: 'set', ref: { path }, value, options }]), update: async (...args) => commit([{ type: 'update', ref: { path }, args }]) }),
    get: path => clone(data.get(path)), put: (path, value) => data.set(path, clone(value)), dump: () => clone([...data]),
    runTransaction(callback) {
      const pending = queue.then(async () => {
        const operations = [], tx = {
          get: async ref => { assert.equal(operations.length, 0, 'reads must precede writes'); return ref.path && ref.doc ? ref.get() : snapshot(ref.path); },
          set: (ref, value, options) => operations.push({ type: 'set', ref, value, options }),
          create: (ref, value) => operations.push({ type: 'create', ref, value }), update: (ref, ...args) => operations.push({ type: 'update', ref, args }), delete: ref => operations.push({ type: 'delete', ref })
        };
        const result = await callback(tx); commit(operations); return result;
      });
      queue = pending.catch(() => undefined); return pending;
    }
  };
  return store;
}
