import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
test('local braces mitigation rejects deep patterns and cyclic ASTs without breaking ordinary source globs', async () => {
  await import('../scripts/harden-build-dependencies.mjs');
  const braces = require('braces');
  assert.deepEqual(braces('src/**/*.{js,jsx,ts,tsx}', { expand: true }), ['src/**/*.js', 'src/**/*.jsx', 'src/**/*.ts', 'src/**/*.tsx']);
  const nested = '{'.repeat(4000) + 'x' + '}'.repeat(4000);
  for (const method of ['parse', 'compile', 'expand', 'stringify']) assert.throws(() => braces[method](nested), error => error instanceof SyntaxError && /depth/.test(error.message));
  const cycle = { type: 'root', nodes: [] }; cycle.nodes.push(cycle);
  for (const method of ['compile', 'expand', 'stringify']) assert.throws(() => braces[method](cycle), /depth/);
});
