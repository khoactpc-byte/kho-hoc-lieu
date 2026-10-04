import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const directory = dirname(require.resolve('braces/package.json'));
const packageData = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
if (packageData.version !== '3.0.3') throw new Error('Re-evaluate braces mitigation for the new version before building.');
const guard = `'use strict';
// Local mitigation of GHSA-vfj7-8cjw-p6xm. Never follow parent/prev links.
module.exports = root => {
  const stack = [[root, 0]], seen = new WeakSet();
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (depth > 128 || seen.has(node)) throw new SyntaxError('Brace nesting exceeds safe build depth');
    seen.add(node);
    if (Array.isArray(node.nodes)) for (const child of node.nodes) stack.push([child, depth + 1]);
  }
};
`;
const specifications = [
  ['parse.js', 'e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310', '  while (index < length) {', "  while (index < length) {\n    if (stack.length > 128) throw new SyntaxError('Brace nesting exceeds safe build depth');"],
  ['compile.js', 'dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f', 'const compile = (ast, options = {}) => {', "const compile = (ast, options = {}) => {\n  require('./safe-depth')(ast);"],
  ['expand.js', '41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7', 'const expand = (ast, options = {}) => {', "const expand = (ast, options = {}) => {\n  require('./safe-depth')(ast);"],
  ['stringify.js', '379f22d77bfA1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a'.toLowerCase(), 'module.exports = (ast, options = {}) => {', "module.exports = (ast, options = {}) => {\n  require('./safe-depth')(ast);"]
];
// Verify all originals before modifying anything; detect unexpected upstream edits.
const patches = [];
for (const [name, checksum, from, to] of specifications) {
  const path = join(directory, 'lib', name), source = await readFile(path, 'utf8');
  const original = source.includes(to) ? source.replace(to, from) : source;
  if (createHash('sha256').update(original).digest('hex') !== checksum || !original.includes(from)) throw new Error('Unexpected braces source: ' + name);
  patches.push([path, original.replace(from, to)]);
}
await writeFile(join(directory, 'lib', 'safe-depth.js'), guard);
for (const [path, source] of patches) await writeFile(path, source);
console.log('Build dependency depth guard verified (Tailwind 3 compatibility).');
