import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('subject-only scheduling ignores assignments, retains locked cells, persists its mode and still enforces lesson loads', async () => {
  const directory = await mkdtemp(resolve('node_modules/.schedule-independent-test-'));
  const windowObject = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: windowObject, document: windowObject.document, IS_REACT_ACT_ENVIRONMENT: true });
  const schoolYear = '2026-2027';
  const names = ['6A', '7A'];
  const subjects = ['Toán', 'Ngữ Văn', 'Khoa học tự nhiên', 'Lịch sử & Địa lý', 'Giáo dục công dân', 'Công nghệ'];
  const classRows = names.map(id => ({ id, label: `Lớp ${id}`, grades: [id] }));
  const records = new Map([['legacy', { name: 'HK1 - Bản cũ', schoolYear, schoolCode: 'NAN', semester: 'hk1', classRows, schedule: {}, status: 'draft' }]]);
  const saves = [], notices = [];
  let listener, root;
  const snapshot = () => ({ metadata: { hasPendingWrites: false }, docs: [...records].map(([id, data]) => ({ id, data: () => data })) });
  globalThis.__scheduleIndependent = {
    subscribe: (_query, _options, next) => { listener = next; next(snapshot()); return () => { listener = null; }; },
    save: async (id, payload, news) => {
      saves.push({ id, payload, news }); records.set(id, payload); listener?.(snapshot());
    }
  };
  try {
    const outfile = join(directory, 'editor.mjs');
    await build({ entryPoints: [resolve('src/components/SimpleScheduleTable.jsx')], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'offline-schedule', setup(builder) {
        builder.onResolve({ filter: /^firebase\/firestore$|config\/firebase$|services\/schedulePublication$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'firebase/firestore'
          ? 'export const collection=(...a)=>a; export const where=(...a)=>a; export const query=(...a)=>a; export const onSnapshot=globalThis.__scheduleIndependent.subscribe;'
          : args.path.endsWith('config/firebase') ? 'export const db={}; export const appId="fixture";'
            : 'export const saveSchedulePublication=globalThis.__scheduleIndependent.save; export const deleteSchedulePublication=async()=>{throw new Error("Unexpected deletion");};', loader: 'js' }));
      } }] });
    const { default: Editor } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    let props = { currentSchoolYear: schoolYear, classNames: names, subjects, teachers: [{ name: 'Nguyễn Văn An', shortName: 'GV', subject: 'Toán' }],
      classTeacherAssignments: {}, user: { uid: 'fixture' }, showNotification: (...args) => notices.push(args) };
    const render = async () => act(async () => root.render(React.createElement(Editor, props)));
    root = createRoot(windowObject.document.getElementById('root'));
    await render();
    const body = windowObject.document;
    const button = label => [...body.querySelectorAll('button')].find(item => item.textContent.trim() === label);
    const mode = () => button('Không phụ thuộc giáo viên');
    const inputs = () => [...body.querySelectorAll('select[data-row-id]')];
    const cell = (row, day, period) => body.querySelector(`select[data-row-id="${row}"][data-day-key="${day}"][data-period="${period}"]`);
    const change = (select, value) => act(async () => { select.value = value; select.dispatchEvent(new windowObject.Event('change', { bubbles: true })); });
    const click = async element => {
      await act(async () => element.click());
      // Auto scheduling now yields to keep the UI responsive while searching.
      while (body.querySelector('[data-arranging="true"]')) await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    };
    const savedSelect = () => [...body.querySelectorAll('select')].find(select => select.options[0]?.textContent === 'Soạn TKB mới');
    assert.equal(mode().getAttribute('aria-pressed'), 'false');
    await click(button('Xếp tự động'));
    assert.ok(notices.some(([message]) => message.includes('Chưa có dữ liệu GV theo lớp')));
    assert.equal(inputs().filter(input => input.value).length, 0);

    await click(mode());
    assert.equal(mode().getAttribute('aria-pressed'), 'true');
    assert.ok([...cell('6A', '2', '1').options].some(option => option.value === 'Toán'));
    assert.equal([...cell('6A', '2', '1').options].some(option => option.value.includes(' - ')), false, 'known teachers must not be inserted into subject-only choices');
    await change(cell('6A', '2', '1'), 'Toán');
    await click(cell('6A', '2', '2').parentElement.querySelector('button'));
    assert.equal(cell('6A', '2', '2').value, '__OFF__');

    // All assignments deliberately point to one person; subject-only mode must ignore them.
    const assigned = Object.fromEntries([...subjects, 'Giáo dục địa phương', 'HDTT', 'Chủ nhiệm'].map(subject => [subject, 'Nguyễn Văn An']));
    props = { ...props, classTeacherAssignments: { '6A': assigned, '7A': assigned } };
    await render();
    await click(button('Xếp tự động'));
    assert.equal(cell('6A', '2', '1').value, 'Toán');
    assert.equal(cell('6A', '2', '2').value, '__OFF__');
    assert.equal(inputs().some(input => input.value.includes(' - ')), false);
    const expectedSlots = { 'Toán': 4, 'Văn': 4, 'KHTN': 4, 'LS&ĐL': 3, 'GDCD': 1, 'Công nghệ': 1, 'GDĐP': 1, 'HDTT': 1, 'Chủ nhiệm': 1 };
    for (const name of names) {
      const counts = {};
      inputs().filter(input => input.dataset.rowId === name && input.value && input.value !== '__OFF__').forEach(input => { counts[input.value] = (counts[input.value] || 0) + 1; });
      assert.deepEqual(counts, expectedSlots, `all lesson loads must be fulfilled for ${name}`);
    }
    assert.ok(notices.some(([message]) => message.includes('Đã xếp đủ số tiết theo môn')));
    await click(button('Lưu'));
    assert.equal(saves.length, 1);
    assert.equal(saves[0].payload.teacherIndependent, true);
    assert.equal(saves[0].payload.schedule['6A']['2'][2], '__OFF__');
    const savedId = saves[0].id;

    await act(async () => root.unmount());
    root = createRoot(body.getElementById('root'));
    await render();
    assert.equal(mode().getAttribute('aria-pressed'), 'false');
    await change(savedSelect(), savedId);
    assert.equal(mode().getAttribute('aria-pressed'), 'true', 'opening the saved record must restore the mode');
    assert.equal(cell('6A', '2', '2').value, '__OFF__');
    await click(button('Ghim TKB'));
    assert.equal(saves.length, 2);
    assert.equal(saves[1].payload.status, 'published');
    assert.equal(saves[1].payload.teacherIndependent, true);
    assert.equal(saves[1].news.type, 'class_schedule');

    await click(mode());
    assert.ok([...cell('6A', '2', '1').options].some(option => option.value === 'Toán - GV'));
    await change(cell('6A', '2', '1'), 'Toán - GV');
    await change(cell('7A', '2', '1'), 'Toán - GV');
    assert.ok(body.body.textContent.includes('GV trùng T2 tiết 1'), 'teacher conflict checks resume when the mode is off');
    await click(mode());
    assert.equal(cell('6A', '2', '1').value, 'Toán - GV', 'toggling must not erase explicitly entered assignments');
    assert.equal(body.body.textContent.includes('GV trùng T2 tiết 1'), false);

    const blank = inputs().find(input => input.dataset.rowId === '6A' && ['', '-'].includes(input.value));
    assert.ok(blank, 'there is room to deliberately add an excess lesson');
    await change(blank, 'Toán');
    assert.ok(body.body.textContent.includes('mục dư tiết'), 'load checks remain active without teacher constraints');
    await click(button('Ghim TKB'));
    assert.equal(saves.length, 2, 'invalid lesson loads must still block publication');
    assert.ok(body.body.textContent.includes('Chưa thể xuất bản TKB'));
    await change(savedSelect(), 'legacy');
    assert.equal(mode().getAttribute('aria-pressed'), 'false', 'legacy schedules use teacher constraints by default');
    await click(mode());
    await change(savedSelect(), '');
    assert.equal(mode().getAttribute('aria-pressed'), 'false', 'new schedules start with the original mode');

    // Teaching limits are hard constraints, even when the full lesson load cannot fit.
    const settings = () => body.querySelector('[aria-label="Cài đặt thời khóa biểu"]');
    const commonPeriods = () => body.querySelector('[aria-label="Số tiết chung cho các ngày dạy"]');
    const dayPeriods = day => body.querySelector(`[aria-label="Số tiết thứ ${day}"]`);
    const restDay = day => body.querySelector(`[aria-label="Nghỉ thứ ${day}"]`);
    await click(settings());
    await change(commonPeriods(), '4');
    await click(restDay('7'));
    assert.equal(dayPeriods('7').disabled, true);
    await change(dayPeriods('2'), '3');
    await click(button('Áp dụng'));
    await click(mode());
    await click(button('Xếp tự động'));
    assert.equal(inputs().some(input => input.dataset.period === '5' || input.dataset.dayKey === '7'), false);
    assert.equal(inputs().filter(input => input.value && input.value !== '__OFF__').length, 0);
    assert.ok(notices.some(([message]) => message.includes('Cài đặt hiện tại không đủ chỗ')));

    await click(settings());
    await change(dayPeriods('2'), '4');
    await click(button('Áp dụng'));
    await click(button('Xếp tự động'));
    assert.equal(inputs().some(input => input.dataset.period === '5' || input.dataset.dayKey === '7'), false);
    assert.equal(inputs().filter(input => input.value).length, 40, 'five days with four periods must fit exactly twenty slots per class');
    await click(button('Lưu'));
    const fourPeriodSave = saves.at(-1);
    assert.equal(fourPeriodSave.payload.periodCount, 4);
    assert.deepEqual(fourPeriodSave.payload.dayPeriodCounts, { 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 0 });
    await act(async () => root.unmount());
    root = createRoot(body.getElementById('root'));
    await render();
    await change(savedSelect(), fourPeriodSave.id);
    await click(settings());
    assert.equal(dayPeriods('2').value, '4');
    assert.equal(restDay('7').checked, true, 'rest days and limits survive reopening the saved record');
    await click(button('Hủy'));
    await click(button('Xếp tự động'));
    assert.equal(inputs().some(input => input.dataset.period === '5' || input.dataset.dayKey === '7'), false);

    // Different days can use different limits; short days render their remaining cells as rest.
    await change(savedSelect(), '');
    await click(mode());
    await click(settings());
    await change(commonPeriods(), '4');
    await click(restDay('7'));
    await change(dayPeriods('2'), '3');
    await change(dayPeriods('3'), '5');
    await click(button('Áp dụng'));
    await click(button('Xếp tự động'));
    assert.equal(cell('6A', '2', '4').disabled, true);
    assert.equal(cell('6A', '2', '4').value, '__OFF__');
    assert.equal(cell('6A', '2', '5').value, '__OFF__');
    assert.equal(cell('6A', '3', '5').disabled, false);
    assert.equal(cell('6A', '4', '5').disabled, true);
    assert.equal(cell('6A', '7', '1'), null);
    assert.ok(notices.at(-1)[0].includes('Đã xếp đủ số tiết'));
    const hideTuesday = [...body.querySelectorAll('details label')].find(label => label.querySelector('span')?.textContent === 'T3').querySelector('input');
    await click(hideTuesday);
    assert.equal(cell('6A', '3', '1'), null);
    await click(button('Ghim TKB'));
    const mixedSave = saves.at(-1);
    assert.equal(mixedSave.payload.status, 'published');
    assert.ok(mixedSave.payload.visibleDays.includes('3'), 'hiding a teaching day in the editor must not omit it from the published timetable');
    assert.equal(mixedSave.payload.dayPeriodCounts['2'], 3);
    assert.equal(mixedSave.payload.dayPeriodCounts['3'], 5);
    const published = new JSDOM(mixedSave.news.content);
    const newsRows = published.window.document.querySelectorAll('.schedule-news tbody tr');
    assert.equal(newsRows[3].cells[1].textContent, 'Nghỉ');
    assert.equal(newsRows[4].cells[1].textContent, 'Nghỉ');
    published.window.close();

    // Reducing limits requires explicit confirmation to clear existing lessons; cancel preserves them.
    const beforeReduction = inputs().map(input => input.value);
    const confirmations = [];
    windowObject.confirm = message => { confirmations.push(message); return false; };
    await click(settings());
    await change(commonPeriods(), '3');
    await click(button('Áp dụng'));
    assert.ok(body.querySelector('[role="dialog"]'));
    assert.deepEqual(inputs().map(input => input.value), beforeReduction);
    assert.match(confirmations[0], /tiết đã xếp.*Xóa các tiết này/);
    windowObject.confirm = () => true;
    await click(button('Áp dụng'));
    assert.equal(body.querySelector('[role="dialog"]'), null);
    assert.equal(inputs().some(input => Number(input.dataset.period) > 3), false);
    const afterReduction = inputs().map(input => input.value);
    await click(button('Xếp tự động'));
    assert.deepEqual(inputs().map(input => input.value), afterReduction, 'insufficient capacity must not increase periods or overwrite remaining lessons');
    assert.equal(inputs().some(input => Number(input.dataset.period) > 3 || input.dataset.dayKey === '7'), false);

    // Teacher conflicts cannot make the ordinary scheduler exceed the same teaching limits either.
    await change(savedSelect(), '');
    await click(settings());
    await change(commonPeriods(), '4');
    await click(restDay('7'));
    await click(button('Áp dụng'));
    assert.equal(mode().getAttribute('aria-pressed'), 'false');
    await click(button('Xếp tự động'));
    assert.equal(inputs().some(input => Number(input.dataset.period) > 4 || input.dataset.dayKey === '7'), false);
    assert.equal(inputs().some(input => input.value), false, 'an impossible run must not replace the current schedule with a partial one');
    assert.equal(notices.at(-1)[1], 'error', 'one teacher cannot teach forty lessons in twenty available periods');
    assert.match(body.body.textContent, /Nguyễn Văn An.*40 tiết.*20 khung giờ/);

    // A fixed conflict between two short-name cells is repaired, using the same
    // teacher identity as the full names in the assignment configuration.
    await change(savedSelect(), '');
    const teacherAssignments = Object.fromEntries([...subjects, 'Giáo dục địa phương', 'HDTT', 'Chủ nhiệm']
      .map((subject, index) => [subject, index === 0 ? 'Nguyễn Văn An' : `Giáo viên ${subject}`]));
    props = { ...props, classTeacherAssignments: { '6A': teacherAssignments, '7A': teacherAssignments } };
    await render();
    await change(cell('6A', '2', '1'), 'Toán - GV');
    await change(cell('7A', '2', '1'), 'Toán - GV');
    assert.ok(body.body.textContent.includes('trùng T2 tiết 1'));
    await click(button('Ghim TKB'));
    assert.ok(body.body.textContent.includes('Chưa thể ghim vì giáo viên đang trùng lịch'));
    await click(button('Xếp tự động'));
    assert.equal(inputs().filter(input => input.value && input.value !== '__OFF__').length, 40);
    assert.ok(notices.at(-1)[0].includes('sắp xếp lại'));
    const teacherSlots = new Set();
    inputs().filter(input => input.value && input.value !== '__OFF__').forEach(input => {
      const teacher = input.value.split(' - ')[1];
      assert.ok(teacher, 'every configured subject retains its assigned teacher');
      const key = `${teacher}:${input.dataset.dayKey}:${input.dataset.period}`;
      assert.equal(teacherSlots.has(key), false, `must not double-book ${key}`); teacherSlots.add(key);
    });
    await click(button('Ghim TKB'));
    assert.equal(saves.at(-1).payload.status, 'published');

    // Enough single slots remain, but explicit rest slots break too many pairs.
    // Completing the load takes precedence over the preference for double periods.
    await act(async () => root.unmount());
    props = { ...props, classNames: ['6A'] };
    root = createRoot(body.getElementById('root')); await render();
    await click(mode());
    for (const day of ['2', '3', '4', '5']) for (const period of ['2', '4']) await click(cell('6A', day, period).parentElement.querySelector('button'));
    await click(button('Xếp tự động'));
    assert.equal(inputs().filter(input => input.value && input.value !== '__OFF__').length, 20);
    assert.equal(inputs().filter(input => input.value === '__OFF__').length, 8, 'explicit rest cells remain fixed during automatic repair');
    assert.ok(body.body.textContent.includes('tách tiết đôi'));

    await act(async () => root.unmount());
    records.set('mixed', { name: 'HK1 - Bản dùng chung', schoolYear, schoolCode: 'NAN', classRows: [{ id: '1A', grades: ['1A'], label: 'Lớp 1A' }, ...classRows], schedule: { '6A': { '2': { 1: 'Toán' } } } });
    props = { ...props, educationLevel: 'primary', classNames: ['1A'], subjects: ['Tiếng Việt', 'Toán', 'Đạo đức'], classTeacherAssignments: {} };
    root = createRoot(body.getElementById('root'));
    await render();
    assert.ok(cell('1A', '2', '1'));
    assert.equal(cell('6A', '2', '1'), null);
    assert.equal([...savedSelect().options].some(option => option.value === 'legacy'), false, 'secondary-only schedules stay in secondary');
    await change(savedSelect(), 'mixed');
    assert.ok(cell('1A', '2', '1'));
    assert.equal(cell('6A', '2', '1'), null);
    await click(button('Xếp tự động'));
    const loads = body.querySelector('[aria-label="Số tiết Tiếng Việt khối 1"]');
    assert.ok(loads, 'primary auto scheduling asks for the centre lesson loads');
    await act(async () => {
      Object.getOwnPropertyDescriptor(windowObject.HTMLInputElement.prototype, 'value').set.call(loads, '2');
      loads.dispatchEvent(new windowObject.Event('input', { bubbles: true }));
    });
    await click(button('Áp dụng'));
    await click(mode());
    await click(button('Xếp tự động'));
    assert.equal(inputs().filter(input => input.value === 'Tiếng Việt').length, 2);
    assert.equal(inputs().some(input => /KHTN|GDCD|Văn/.test(input.value)), false);
    await click(button('Lưu'));
    const primarySave = saves.at(-1);
    assert.notEqual(primarySave.id, 'mixed', 'saving a legacy mixed schedule creates a separate primary document');
    assert.equal(primarySave.payload.educationLevel, 'primary');
    assert.equal(primarySave.payload.weeklyLoads['1'].tiengviet, 2);
    assert.deepEqual(primarySave.payload.classRows.map(row => row.id), ['1A']);
    assert.equal(records.get('mixed').schedule['6A']['2'][1], 'Toán');
  } finally {
    if (root) await act(async () => root.unmount());
    windowObject.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
    delete globalThis.__scheduleIndependent;
    await rm(directory, { recursive: true, force: true });
  }
});
