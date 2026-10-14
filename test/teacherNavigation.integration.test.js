import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';

test('teachers can choose their second assigned subject, return to the picker and clear revoked selections', async () => {
  const directory = await mkdtemp(resolve('node_modules/.teacher-navigation-'));
  const page = new JSDOM('<div id="root"></div>').window;
  const previous = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: page, document: page.document, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const outfile = join(directory, 'navigation.mjs');
    await build({ stdin: { contents: `export {useTeacherNavigation} from './src/hooks/useTeacherNavigation.js';
      export {default as SubjectSelect} from './src/components/TeacherSubjectSelect.jsx';
      export {default as SubjectPanel} from './src/components/LearningSubjectPanel.jsx';`, resolveDir: resolve('.') }, absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' });
    const { useTeacherNavigation, SubjectSelect, SubjectPanel } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    const profile = { role: 'teacher', schoolCode: 'NAN', grades: ['6', '7', '8', '9'], subjects: ['HĐTT', 'Toán'] };
    function Navigation({ account = profile, role = 'teacher', initialGrade = '6', initialSubject = null }) {
      const [grade, setGrade] = useState(initialGrade);
      const [subject, setSubject] = useState(initialSubject);
      const [lesson, setLesson] = useState(null);
      useTeacherNavigation({ role, profile: account, grades: account.grades, subjects: account.subjects, grade, subject, setGrade, setSubject, setLesson });
      const select = value => { setSubject(value); setLesson(null); };
      return React.createElement(React.Fragment, null,
        React.createElement('output', { 'aria-label': 'Phạm vi đang xem' }, `${grade || '-'}|${subject || '-'}|${lesson || '-'}`),
        React.createElement('button', { onClick: () => { setGrade(null); setSubject(null); setLesson(null); } }, 'Trang chủ'),
        React.createElement('button', { onClick: () => { setSubject(null); setLesson(null); } }, 'Chọn lại môn'),
        !grade ? account.grades.map(value => React.createElement('button', { key: value, onClick: () => setGrade(value) }, 'Khối ' + value))
          : !subject ? React.createElement(SubjectPanel, { role: 'teacher', subjects: account.subjects, onSelect: select, getShortName: value => value, getCardStyle: () => '' })
          : React.createElement(React.Fragment, null, React.createElement(SubjectSelect, { subjects: account.subjects, value: subject, onChange: select }), React.createElement('button', { onClick: () => setLesson('5') }, 'Tuần 5')));
    }
    root = createRoot(page.document.getElementById('root'));
    const render = props => act(async () => root.render(React.createElement(Navigation, props)));
    const button = label => [...page.document.querySelectorAll('button')].find(element => element.textContent.trim() === label);
    const click = label => act(async () => button(label).click());
    const scope = () => page.document.querySelector('output').textContent;
    const choose = value => act(async () => {
      const select = page.document.querySelector('select[aria-label="Môn dạy"]');
      select.value = value;
      select.dispatchEvent(new page.Event('change', { bubbles: true }));
    });

    await render({});
    assert.equal(scope(), '6|-|-', 'entering the account keeps the subject picker open');
    assert.ok(button('HĐTT')); assert.ok(button('Toán'));
    assert.equal(button('Ngữ Văn'), undefined, 'only assigned subjects are offered');
    await click('HĐTT');
    assert.equal(scope(), '6|HĐTT|-');
    assert.deepEqual([...page.document.querySelectorAll('select option')].map(element => element.value), ['HĐTT', 'Toán']);
    await click('Tuần 5');
    await choose('Toán');
    assert.equal(scope(), '6|Toán|-', 'switching to the second subject clears the previous week');
    await click('Chọn lại môn');
    assert.equal(scope(), '6|-|-', 'the scope guard must not force the first subject again');
    assert.ok(button('Toán'));
    await click('Toán');
    await click('Trang chủ');
    assert.equal(scope(), '-|-|-', 'the grade picker remains open after returning home');
    await click('Khối 9');
    await click('Toán');
    await click('Tuần 5');
    assert.equal(scope(), '9|Toán|5');

    await render({ account: { ...profile, subjects: ['HĐTT'] } });
    assert.equal(scope(), '9|-|-', 'revoking the active subject clears its lesson and opens remaining choices');
    assert.equal(button('Toán'), undefined);
    await click('HĐTT');
    await render({ account: { ...profile, subjects: ['HĐTT'], grades: ['6'] } });
    assert.equal(scope(), '-|-|-', 'a revoked grade cannot keep another subject or lesson selected');
    assert.equal(button('Khối 9'), undefined);
    await click('Khối 6');
    await click('HĐTT');
    await click('Chọn lại môn');
    assert.equal(scope(), '6|-|-', 'single-subject accounts can still return to their picker');
    assert.ok(button('HĐTT'));
    await render({ key: 'student', role: 'student', initialSubject: 'Toán', account: { ...profile, subjects: ['HĐTT'] } });
    assert.equal(scope(), '6|Toán|-', 'teacher navigation guards do not change student navigation');
  } finally {
    if (root) await act(async () => root.unmount());
    page.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
