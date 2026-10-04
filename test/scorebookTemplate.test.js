import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import scorebookTemplatePlugin, { compactTemplate, templateModule } from '../scripts/scorebook-template-plugin.mjs';

test('the compact shipped template restores all real sheet cells, styles and print metadata without sharing mutable styles', async () => {
  const source = await readFile(new URL('../src/data/scorebookTemplate.json', import.meta.url), 'utf8');
  const original = JSON.parse(source);
  const packed = compactTemplate(original);
  const code = templateModule(original);
  const { default: expanded } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  assert.deepEqual(expanded, original);
  assert.ok(Buffer.byteLength(code) < Buffer.byteLength(source) * 0.5);
  assert.ok(packed.styles.length < original.sheets.reduce((count, sheet) => count + sheet.cells.length, 0) / 10);
  const first = expanded.sheets[0].cells[0].s;
  const second = expanded.sheets[0].cells[1].s;
  assert.notEqual(first, second);
  const secondSize = second.fontSize;
  const originalSize = original.sheets[0].cells[0].s.fontSize;
  first.fontSize = 999;
  assert.equal(second.fontSize, secondSize);
  assert.equal(original.sheets[0].cells[0].s.fontSize, originalSize);
  assert.equal(await scorebookTemplatePlugin().transform('', '/different/template.json'), null);
});
