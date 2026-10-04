import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../apps-script/dang-ky-hoc-sinh/code_dangky.gs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../apps-script/dang-ky-hoc-sinh/Index.html', import.meta.url), 'utf8');
const fixture = () => ({
  Provinces: [['Tỉnh A'], ['TP.HCM'], ['Tỉnh B']],
  Communes: [['Tỉnh / Thành phố', 'Xã'], ['Tỉnh A', 'Phường Ánh'], ['Tỉnh A', 'Phường Ánh'], ['Tỉnh B', 'Xã Bình']],
  tinhhuyenxa: [['Tỉnh', 'Huyện', 'Xã'], ['Tỉnh A', 'Huyện 1', 'Xã Ánh'], ['Tỉnh A', 'Huyện 1', 'Xã Hai'], ['Tỉnh A', 'Huyện 2', 'Xã Ba'], ['Tỉnh B', 'Huyện B', 'Xã Bình']]
});

function server(tables = fixture()) {
  const cache = new Map(), properties = new Map();
  let reads = 0, uuid = 0, cacheUnavailable = false;
  const cacheApi = {
    get(key) { if (cacheUnavailable) throw new Error('cache unavailable'); return cache.get(key) || null; },
    getAll: keys => Object.fromEntries(keys.filter(key => cache.has(key)).map(key => [key, cache.get(key)])),
    put(key, value, ttl) {
      if (cacheUnavailable) throw new Error('cache unavailable');
      assert.ok(Buffer.byteLength(value, 'utf8') < 100000);
      assert.ok(key.length <= 250);
      assert.equal(ttl, 21600);
      cache.set(key, value);
    },
    putAll(values, ttl) { Object.entries(values).forEach(([key, value]) => this.put(key, value, ttl)); }
  };
  const context = vm.createContext({
    CacheService: { getScriptCache: () => cacheApi },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) }) },
    Utilities: { getUuid: () => `generation-${++uuid}` },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => tables[name] ? ({ getDataRange: () => ({ getValues: () => { reads++; return tables[name]; } }) }) : null }) }
  });
  vm.runInContext(source, context);
  return { context, cache, properties, tables, reads: () => reads, breakCache: () => { cacheUnavailable = true; } };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('location bootstrap builds each Sheet index once; warm province/district/ward calls read no Sheet rows', () => {
  const subject = server(), { context } = subject;
  const bootstrap = context.getRegistrationLocationBootstrap();
  assert.deepEqual(plain(bootstrap.provinces), ['TP.HCM', 'Tỉnh A', 'Tỉnh B']);
  assert.deepEqual(plain(bootstrap.birthProvinces), ['Tỉnh A', 'Tỉnh B']);
  assert.equal(subject.reads(), 3);
  assert.deepEqual(plain(context.getBirthPlaceProvince('Tỉnh A').districts), ['Huyện 1', 'Huyện 2']);
  assert.deepEqual(plain(context.getBirthPlaceCommunes('Tỉnh A', 'Huyện 1')), ['Xã Ánh', 'Xã Hai']);
  assert.deepEqual(plain(context.getRegistrationCommunes('Tỉnh B').items), ['Xã Bình']);
  assert.deepEqual(plain(context.getCommunes('Tỉnh A')), ['Phường Ánh']);
  assert.deepEqual(plain(context.getBirthPlaceDistricts('Tỉnh B')), ['Huyện B']);
  context.getRegistrationLocationBootstrap();
  assert.equal(subject.reads(), 3, 'all subsequent lookups use the public location cache');
  assert.equal(context.getBirthPlaceProvince('Tỉnh A').communesByDistrict['Tỉnh B|||Huyện B'], undefined);
  assert.deepEqual(plain(context.getBirthPlaceCommunes('Tỉnh B', 'Huyện 1')), []);
  assert.equal(context.getBirthPlaceProvince('Tỉnh A').revision, 'locations-v2:1');
  subject.tables.tinhhuyenxa.push(['Tỉnh A', 'Huyện Mới', 'Xã Mới']);
  subject.properties.set('LOCATION_DIRECTORY_VERSION', '2');
  assert.ok(context.getBirthPlaceDistricts('Tỉnh A').includes('Huyện Mới'));
  assert.equal(subject.reads(), 4, 'changing the revision invalidates the old historical index');
});

test('large Unicode directories are cached in bounded parts and recover from eviction/corruption/cache failure', () => {
  const tables = fixture();
  for (let index = 0; index < 4500; index++) tables.tinhhuyenxa.push(['Tỉnh A', 'Huyện 1', `Xã Đặng Ánh 😀 ${index}`]);
  const subject = server(tables), { context, cache } = subject;
  const original = plain(context.getBirthPlaceDirectory());
  const key = context.locationCacheKey_('birth');
  const manifest = JSON.parse(cache.get(key));
  assert.ok(manifest.count > 1);
  assert.deepEqual(plain(context.getBirthPlaceDirectory()), original);
  assert.equal(subject.reads(), 1);
  cache.delete(`${key}:${manifest.generation}:0`);
  assert.deepEqual(plain(context.getBirthPlaceDirectory()), original);
  assert.equal(subject.reads(), 2);
  cache.set(key, '{invalid');
  assert.deepEqual(plain(context.getBirthPlaceDirectory()), original);
  assert.equal(subject.reads(), 3);
  subject.breakCache();
  assert.deepEqual(plain(context.getBirthPlaceDirectory()), original);
  assert.equal(subject.reads(), 4);
});

test('address lookups keep one-column legacy commune lists and do not cache missing Sheet failures', () => {
  const subject = server({ Provinces: [['TP.HCM']], Communes: [['Phường Một'], ['Phường Hai']] });
  assert.deepEqual(plain(subject.context.getCommunes('TP.HCM')), ['Phường Hai', 'Phường Một']);
  assert.equal(subject.context.getBirthPlaceProvince('Tỉnh A').success, false);
  subject.tables.tinhhuyenxa = fixture().tinhhuyenxa;
  assert.equal(subject.context.getBirthPlaceProvince('Tỉnh A').success, true);
});

async function form(cached) {
  const dom = new JSDOM(html, { url: 'https://registration.test/', runScripts: 'outside-only' });
  const window = dom.window, calls = [];
  if (cached) window.localStorage.setItem('student-registration-locations-v2', cached);
  window.google = { script: { get run() {
    let success, failure;
    const proxy = new Proxy({}, { get(_target, method) {
      if (method === 'withSuccessHandler') return handler => { success = handler; return proxy; };
      if (method === 'withFailureHandler') return handler => { failure = handler; return proxy; };
      return (...args) => calls.push({ method, args, resolve: success, reject: failure });
    } });
    return proxy;
  } } };
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) window.eval(match[1]);
  await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const element = id => window.document.getElementById(id);
  const change = (id, value, type = 'change') => {
    element(id).value = value;
    element(id).dispatchEvent(new window.Event(type, { bubbles: true }));
  };
  return { dom, window, calls, element, change };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const bootstrap = revision => ({ success: true, revision: revision || 'locations-v2:1', provinces: ['Tỉnh A', 'Tỉnh B'], birthProvinces: ['Tỉnh A', 'Tỉnh B'],
  config: { currentSchoolYear: '2025-2026', schools: [{ key: 'nguyen-an-ninh', name: 'THCS Nguyễn An Ninh', suffix: 'A' }] } });
const bundle = province => ({ success: true, province, revision: 'locations-v2:1', districts: [`Huyện ${province}`],
  communesByDistrict: { [`${province}|||Huyện ${province}`]: [`Xã ${province}`] } });

test('all three province pickers show one menu and accept unaccented search, keyboard and pointer selection', async () => {
  const subject = await form(), { calls, element, change, window } = subject;
  try {
    calls[0].resolve({ ...bootstrap(), birthProvinces: ['Tỉnh Đắk Lắk', 'Thành phố Hà Nội'] }); await flush();
    const key = (input, value) => {
      const event = new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      return event;
    };
    for (const prefix of ['birth', 'birthRegistration', 'hometown']) {
      const input = element(`${prefix}Province`), box = element(`${prefix}ProvinceSuggestions`);
      assert.equal(input.list, null, 'native datalist cannot open over the custom picker');
      input.focus();
      assert.equal(window.document.querySelectorAll('.province-suggestions.is-open').length, 1);
      assert.equal(input.getAttribute('aria-expanded'), 'true');
      change(input.id, 'dak lak', 'input');
      assert.deepEqual([...box.querySelectorAll('[role="option"]')].map(option => option.textContent), ['Tỉnh Đắk Lắk']);
      key(input, 'ArrowDown');
      assert.equal(box.querySelector('[aria-selected="true"]').id, input.getAttribute('aria-activedescendant'));
      assert.equal(key(input, 'Enter').defaultPrevented, true, 'selecting a suggestion must not submit the form');
      assert.equal(input.value, 'Tỉnh Đắk Lắk');
      assert.equal(input.getAttribute('aria-expanded'), 'false');
      assert.equal(window.document.querySelectorAll('.province-suggestions.is-open').length, 0);
      input.click();
      assert.equal(input.getAttribute('aria-expanded'), 'true');
      key(input, 'Escape');
      assert.equal(input.getAttribute('aria-expanded'), 'false');
    }
    assert.equal(calls.filter(call => call.method === 'getBirthPlaceProvince').length, 1);
    calls[1].resolve(bundle('Tỉnh Đắk Lắk')); await flush();
    element('birthProvince').focus();
    change('birthProvince', 'ha noi', 'input');
    const option = element('birthProvinceSuggestions').querySelector('[role="option"]');
    const down = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
    option.dispatchEvent(down);
    assert.equal(down.defaultPrevented, true);
    option.click();
    assert.equal(element('birthProvince').value, 'Thành phố Hà Nội');
    assert.equal(element('birthProvince').getAttribute('aria-expanded'), 'false');
    assert.equal(element('xaPhuongInput').list.id, 'xaPhuongList');
    assert.equal(element('xaPhuongHKInput').list.id, 'xaPhuongHKList');
  } finally { subject.dom.window.close(); }
});

test('actual registration form shares province requests, ignores late replies and changes district locally', async () => {
  const subject = await form(), { calls, element, change, window } = subject;
  try {
    assert.deepEqual(calls.map(call => call.method), ['getRegistrationLocationBootstrap']);
    change('coSoHoc', 'nguyen-an-ninh');
    change('lopHoc', '6A');
    change('tinhTrangHocSinh', '2025-2026');
    calls[0].resolve(bootstrap()); await flush();
    assert.equal(element('lopHoc').value, '6A');
    assert.equal(element('tinhTrangHocSinh').value, '2025-2026');
    change('birthProvince', 'tinh a', 'input');
    change('hometownProvince', 'Tỉnh A', 'input');
    assert.equal(element('birthProvince').value, 'Tỉnh A');
    assert.equal(calls.filter(call => call.method === 'getBirthPlaceProvince').length, 1);
    change('birthProvince', 'Tỉnh B', 'input');
    calls.find(call => call.method === 'getBirthPlaceProvince' && call.args[0] === 'Tỉnh A').resolve(bundle('Tỉnh A'));
    await flush();
    assert.equal(element('birthDistrict').disabled, true);
    assert.equal(element('hometownDistrict').disabled, false);
    calls.find(call => call.method === 'getBirthPlaceProvince' && call.args[0] === 'Tỉnh B').resolve(bundle('Tỉnh B'));
    await flush();
    change('birthDistrict', 'Huyện Tỉnh B');
    change('birthWard', 'Xã Tỉnh B');
    assert.equal(element('birthWard').value, 'Xã Tỉnh B');
    assert.equal(calls.length, 3, 'selecting a district/ward makes no server call');
    window.renderBirthDistrictOptions('birth');
    assert.equal(element('birthWard').value, 'Xã Tỉnh B', 'background redraw preserves selected district/ward');

    change('tinhThanh', 'Tỉnh A'); change('tinhThanhHK', 'Tỉnh A');
    assert.equal(calls.filter(call => call.method === 'getRegistrationCommunes').length, 1);
    change('tinhThanh', 'Tỉnh B');
    calls.find(call => call.method === 'getRegistrationCommunes' && call.args[0] === 'Tỉnh A').resolve({ success: true, province: 'Tỉnh A', items: ['Xã Ánh'] });
    await flush();
    assert.equal(element('xaPhuongInput').disabled, true);
    assert.equal(element('xaPhuongHKList').options[0].value, 'Xã Ánh');
    calls.find(call => call.method === 'getRegistrationCommunes' && call.args[0] === 'Tỉnh B').resolve({ success: true, province: 'Tỉnh B', items: ['Xã Bình'] });
    await flush();
    assert.equal(element('xaPhuongList').options[0].value, 'Xã Bình');
    change('tinhThanh', 'Tỉnh A');
    assert.equal(element('xaPhuongList').options[0].value, 'Xã Ánh');
    assert.equal(calls.length, 5, 'returning to a cached province is immediate');
    change('birthProvince', '', 'input');
    assert.equal(element('birthDistrict').disabled, true);
    assert.equal(element('birthWard').disabled, true);
    window.handleFormSubmit({ preventDefault() {} });
    assert.match(element('status').textContent, /chờ danh mục tải xong/);
    element('myForm').reset();
    await new Promise(resolve => window.setTimeout(resolve, 5));
    assert.equal(element('hometownDistrict').disabled, true);
    assert.equal(element('xaPhuongInput').disabled, true);
    assert.equal(element('xaPhuongHKList').options.length, 0);
  } finally { subject.dom.window.close(); }
});

test('location failures can retry and the next page uses only fresh cached province data', async () => {
  const subject = await form(), { calls, element, change } = subject;
  let cached;
  try {
    calls[0].resolve(bootstrap()); await flush();
    change('birthProvince', 'Tỉnh A', 'input');
    calls[1].reject(new Error('Bạn không có quyền thực hiện lệnh gọi SpreadsheetApp.openById. Các quyền cần có: https://www.googleapis.com/auth/spreadsheets')); await flush();
    assert.equal(element('birthDistrict').disabled, true);
    assert.match(element('birthLocationStatus').textContent, /chưa được cấp quyền đọc Google Sheet/);
    assert.doesNotMatch(element('birthLocationStatus').textContent, /SpreadsheetApp\.openById/);
    element('birthLocationStatus').querySelector('button').click();
    assert.equal(calls.length, 3);
    calls[2].resolve(bundle('Tỉnh A')); await flush();
    assert.equal(element('birthDistrict').disabled, false);
    cached = subject.window.localStorage.getItem('student-registration-locations-v2');
  } finally { subject.dom.window.close(); }
  const next = await form(cached);
  try {
    next.change('birthProvince', 'Tỉnh A', 'input');
    assert.equal(next.element('birthDistrict').disabled, false);
    assert.equal(next.calls.length, 1, 'a new page revalidates the revision but uses fresh cached options immediately');
    next.calls[0].resolve(bootstrap('locations-v2:2')); await flush();
    assert.equal(next.element('birthDistrict').disabled, true);
    assert.equal(next.calls[1].method, 'getBirthPlaceProvince');
  } finally { next.dom.window.close(); }
});

test('responses from the previous directory revision cannot replace new options or retry status', async () => {
  const subject = await form(), { calls, element, change, window } = subject;
  try {
    calls[0].resolve(bootstrap()); await flush();
    change('birthProvince', 'Tỉnh A', 'input');
    change('tinhThanh', 'Tỉnh A');
    const oldBirth = calls[1], oldAddress = calls[2];
    window.loadRegistrationLocationBootstrap();
    calls[3].resolve(bootstrap('locations-v2:2')); await flush();
    const newBirth = calls.filter(call => call.method === 'getBirthPlaceProvince').at(-1);
    const newAddress = calls.filter(call => call.method === 'getRegistrationCommunes').at(-1);
    newBirth.resolve({ ...bundle('Tỉnh A'), revision: 'locations-v2:2' });
    newAddress.resolve({ success: true, province: 'Tỉnh A', items: ['Xã Mới'] }); await flush();
    oldBirth.reject(new Error('obsolete error'));
    oldAddress.reject(new Error('obsolete error')); await flush();
    assert.equal(element('birthDistrict').disabled, false);
    assert.equal(element('xaPhuongList').options[0].value, 'Xã Mới');
    assert.doesNotMatch(element('birthLocationStatus').textContent, /obsolete/);
    assert.doesNotMatch(element('currentLocationStatus').textContent, /obsolete/);
  } finally { subject.dom.window.close(); }
});
