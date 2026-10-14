import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';

test('students return to their own grade after browsing subjects on desktop and mobile', async () => {
  const directory = await mkdtemp(resolve('node_modules/.learning-navigation-'));
  const page = new JSDOM('<div id="root"></div>').window;
  const previous = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window: page, document: page.document, IS_REACT_ACT_ENVIRONMENT: true });
  let root;
  try {
    const outfile = join(directory, 'navigation.mjs');
    await build({ entryPoints: [resolve('src/hooks/useDefaultLearningGrade.js')], absWorkingDir: resolve('.'), tsconfigRaw: {}, outfile,
      bundle: true, platform: 'node', format: 'esm', packages: 'external' });
    const { useDefaultLearningGrade } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    const secondaryGrades = ['6', '7', '8', '9'];
    function Navigation({ role = 'student', studentGrade = '7', grades = secondaryGrades, initialGrade = null, initialSubject = null, initialLesson = null }) {
      const [grade, setGrade] = useState(initialGrade);
      const [subject, setSubject] = useState(initialSubject);
      const [lesson, setLesson] = useState(initialLesson);
      const [expanded, setTextbookExpanded] = useState(false);
      useDefaultLearningGrade({ role, studentGrade, grades, grade, subject, lesson, setGrade, setTextbookExpanded });
      return React.createElement(React.Fragment, null,
        React.createElement('output', null, `${grade || '-'}|${subject || '-'}|${lesson || '-'}|${expanded}`),
        React.createElement('button', { onClick: () => { setGrade(null); setSubject(null); setLesson(null); } }, 'Trang chủ'),
        React.createElement('button', { onClick: () => setGrade('6') }, 'Xem khối 6'),
        React.createElement('button', { onClick: () => { setSubject('Toán'); setLesson(null); } }, 'Toán'),
        React.createElement('button', { onClick: () => setLesson('2') }, 'Tuần 2'),
        React.createElement('button', { onClick: () => setLesson(null) }, 'Danh sách tuần'));
    }
    root = createRoot(page.document.getElementById('root'));
    const render = props => act(async () => root.render(React.createElement(Navigation, props)));
    const scope = () => page.document.querySelector('output').textContent;
    const click = label => act(async () => [...page.document.querySelectorAll('button')].find(button => button.textContent === label).click());

    for (const width of [1366, 390]) {
      page.innerWidth = width;
      const expanded = width >= 640;
      await render({ key: `student-${width}` });
      assert.equal(scope(), `7|-|-|${expanded}`, 'the profile grade is selected on entry');
      await click('Toán');
      await click('Tuần 2');
      assert.equal(scope(), `7|Toán|2|${expanded}`);
      await click('Danh sách tuần');
      assert.equal(scope(), `7|Toán|-|${expanded}`, 'returning from a lesson retains the grade and subject');
      await click('Trang chủ');
      assert.equal(scope(), `7|-|-|${expanded}`, 'returning home must not default to grade 6');
      await click('Xem khối 6');
      await click('Toán');
      assert.equal(scope(), `6|Toán|-|${expanded}`, 'an explicit choice of another grade is respected');
      await click('Trang chủ');
      assert.equal(scope(), `7|-|-|${expanded}`, 'home restores the current school grade');
    }

    await render({ key: 'primary', studentGrade: '4', grades: ['1', '2', '3', '4', '5'] });
    assert.equal(scope(), '4|-|-|false', 'primary students default to their own grade too');
    await render({ key: 'direct-lesson', initialGrade: '8', initialSubject: 'Toán', initialLesson: '5' });
    assert.equal(scope(), '8|Toán|5|false', 'opening an existing lesson must not redirect its grade');
    await render({ key: 'guest-mobile', studentGrade: '' });
    assert.equal(scope(), '-|-|-|false', 'a mobile visitor without a profile can still choose a grade');
    await render({ key: 'signed-out', role: null });
    assert.equal(scope(), '-|-|-|false', 'signed-out navigation remains empty');
    page.innerWidth = 1366;
    await render({ key: 'teacher', role: 'teacher', grades: ['8', '9'] });
    assert.equal(scope(), '8|-|-|true', 'teachers retain their assigned desktop default');
    await render({ key: 'student-missing-grade', studentGrade: '' });
    assert.equal(scope(), '6|-|-|true', 'desktop visitors without a class retain the grade picker default');
  } finally {
    if (root) await act(async () => root.unmount());
    page.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
