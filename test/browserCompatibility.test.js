import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

test('older-browser fallbacks preserve score keys, secure UUIDs, replacements and negative indices', () => {
  const context = vm.createContext({ crypto: { getRandomValues: array => webcrypto.getRandomValues(array) } });
  vm.runInContext('delete Object.hasOwn; delete Array.prototype.at; delete String.prototype.replaceAll;', context);
  const source = readFileSync(new URL('../src/utils/browserCompatibility.js', import.meta.url), 'utf8').replace('export function', 'function');
  vm.runInContext(source, context);
  assert.equal(vm.runInContext('[1,2,3].at(-1)', context), 3);
  assert.equal(vm.runInContext('[1,2,3].at(Infinity)', context), undefined);
  assert.equal(vm.runInContext('Object.hasOwn({zero:0}, "zero")', context), true);
  assert.equal(vm.runInContext('Object.hasOwn({}, "toString")', context), false);
  assert.equal(vm.runInContext('"a.b.a".replaceAll(".", "-")', context), 'a-b-a');
  assert.equal(vm.runInContext('"aaa".replaceAll("a", "$&!")', context), 'a!a!a!');
  assert.throws(() => vm.runInContext('"aa".replaceAll(/a/, "x")', context), /global/);
  const ids = Array.from({ length: 100 }, () => vm.runInContext('crypto.randomUUID()', context));
  assert.equal(new Set(ids).size, 100); assert.ok(ids.every(id => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)));
});
