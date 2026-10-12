import assert from 'node:assert/strict';
import test from 'node:test';
import { provinceFilterKey, provinceFilterLabel, provinceOptionLabel } from '../src/utils/provinceLabels.js';

test('shows province or city prefixes on unprefixed options', () => {
  assert.equal(provinceOptionLabel('Bến Tre'), 'Tỉnh Bến Tre');
  assert.equal(provinceOptionLabel('Đồng Nai'), 'Tỉnh Đồng Nai');
  assert.equal(provinceOptionLabel('Hồ Chí Minh'), 'Thành phố Hồ Chí Minh');
  assert.equal(provinceOptionLabel('Huế'), 'Thành phố Huế');
});

test('preserves existing prefixes, original option values and blank entries', () => {
  assert.equal(provinceOptionLabel('Tỉnh Bến Tre'), 'Tỉnh Bến Tre');
  assert.equal(provinceOptionLabel('Thành phố Hà Nội'), 'Thành phố Hà Nội');
  assert.equal(provinceOptionLabel('TP. Hồ Chí Minh'), 'TP. Hồ Chí Minh');
  assert.equal(provinceOptionLabel(''), '');
  const original = 'Bến Tre';
  assert.equal(original, 'Bến Tre');
  assert.equal(provinceOptionLabel(original), 'Tỉnh Bến Tre');
});

test('birth province filter merges older short names while leaving stored values unchanged', () => {
  const variants = ['Bến tre', 'Bến Tre', 'Tỉnh Bến Tre', ' tỉnh bến tre '];
  variants.forEach(value => {
    assert.equal(provinceFilterLabel(value), 'Tỉnh Bến Tre');
    assert.equal(provinceFilterKey(value), provinceFilterKey('Tỉnh Bến Tre'));
  });
  assert.equal(provinceFilterLabel('An Giang'), 'Tỉnh An Giang');
  assert.equal(provinceFilterKey('An Giang'), provinceFilterKey('Tỉnh An Giang'));
  assert.equal(provinceFilterLabel('TP. Hồ Chí Minh'), 'Thành phố Hồ Chí Minh');
  assert.equal(provinceFilterLabel('Thành phố Cần Thơ'), 'Thành phố Cần Thơ');
  assert.equal(provinceFilterLabel(''), '');
  assert.equal(variants[0], 'Bến tre');
});
