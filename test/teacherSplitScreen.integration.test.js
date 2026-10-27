import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('two teaching panes select assigned lessons independently, share matching reads, ignore stale updates and clean up', async () => {
  const directory = await mkdtemp(resolve('node_modules/.split-screen-test-'));
  const page = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }).window;
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: page, document: page.document, IS_REACT_ACT_ENVIRONMENT: true });
  const jobs = [], typeset = [];
  page.MathJax = { typesetPromise: async roots => { typeset.push(...roots); } };
  let root;
  try {
    const outfile = join(directory, 'split.mjs');
    await build({ stdin: { contents: "export {default} from './src/components/TeacherSplitScreen.jsx'", resolveDir: resolve('.') }, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
      plugins: [{ name: 'no-live-data', setup(builder) {
        builder.onResolve({ filter: /services\/teachingLesson$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const observeTeachingLesson=()=>{throw new Error("Unexpected live request")};' }));
      } }] });
    const { default: Split } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client');
    root = createRoot(page.document.getElementById('root'));
    const profile = { role: 'teacher', schoolCode: 'NAN', grades: ['6', '7', '8'], subjects: ['Toán', 'Ngữ Văn'], subjectsByGrade: { 6: ['Toán', 'Ngữ Văn'], 7: ['Toán'], 8: ['Ngữ Văn'] } };
    const observeLesson = (scope, next, fail) => {
      const job = { scope, next, fail, closed: false }; jobs.push(job);
      next({ notes: [{ content: `<h2>Bài lớp ${scope.grade} tuần ${scope.lesson}</h2><section class="teacher-only">Đáp án riêng ${scope.grade}</section>` }], materials: [], quizzes: [], loading: false });
      return () => { job.closed = true; };
    };
    await act(async () => root.render(React.createElement(Split, { profile, schoolYear: '2026-2027', subscriptionScope: { user: { uid: 'teacher' } }, currentContext: { grade: '6', subject: 'Toán', lesson: '2' }, observeLesson })));
    const button = text => [...page.document.querySelectorAll('button')].find(item => item.textContent.trim() === text || item.getAttribute('aria-label') === text);
    const select = (label, value) => act(async () => { const item = page.document.querySelector(`select[aria-label="${label}"]`); item.value = value; item.dispatchEvent(new page.Event('change', { bubbles: true })); });
    await act(async () => button('Chia đôi').click());
    assert.equal(jobs.length, 2);
    const panes = () => [...page.document.querySelectorAll('.teacher-split-pane')];
    assert.match(panes()[0].textContent, /Bài lớp 6 tuần 2/);
    assert.match(panes()[1].textContent, /Bài lớp 7 tuần 2/);
    assert.ok(typeset.length);
    assert.equal(panes()[0].querySelector('.teacher-answer-disclosure').open, false);
    const workspace = page.document.querySelector('[role="dialog"]');
    workspace.requestFullscreen = async () => { Object.defineProperty(page.document, 'fullscreenElement', { configurable: true, value: workspace }); page.document.dispatchEvent(new page.Event('fullscreenchange')); };
    page.document.exitFullscreen = async () => { Object.defineProperty(page.document, 'fullscreenElement', { configurable: true, value: null }); page.document.dispatchEvent(new page.Event('fullscreenchange')); };
    await act(async () => button('Toàn màn hình').click());
    assert.equal(page.document.fullscreenElement, workspace);
    assert.ok(button('Thu màn hình'));
    await act(async () => button('Thu màn hình').click());
    assert.equal(page.document.fullscreenElement, null);
    const rightLesson = panes()[1].querySelector('.lesson-column-content');
    panes()[1].querySelector('.teacher-split-content').scrollTop = 123;
    await select('Tuần bên trái', '3');
    assert.equal(jobs[0].closed, true);
    assert.equal(jobs[1].closed, false);
    assert.equal(panes()[1].querySelector('.lesson-column-content'), rightLesson);
    assert.equal(panes()[1].querySelector('.teacher-split-content').scrollTop, 123);
    await act(async () => jobs[0].next({ notes: [{ content: 'STALE' }], materials: [], quizzes: [], loading: false }));
    assert.equal(page.document.body.textContent.includes('STALE'), false);
    await select('Lớp bên trái', '8');
    assert.equal(page.document.querySelector('select[aria-label="Môn bên trái"]').value, 'Ngữ Văn');
    assert.equal(page.document.querySelector('select[aria-label="Môn bên trái"]').options.length, 1);
    await select('Lớp bên trái', '7');
    await select('Tuần bên trái', '2');
    assert.equal(jobs.filter(job => !job.closed).length, 1, 'matching contexts share one observer');
    assert.match(panes()[0].textContent, /Bài lớp 7 tuần 2/);
    await act(async () => jobs[1].fail({ code: 'resource-exhausted', message: 'Quota exceeded' }));
    assert.match(panes()[0].textContent, /chạm hạn mức/);
    await act(async () => button('Đóng chia đôi màn hình').click());
    assert.equal(page.document.querySelector('[role="dialog"]'), null);
    assert.ok(jobs.every(job => job.closed));
    assert.equal(page.document.body.style.overflow, '');
    assert.equal(page.document.activeElement.textContent, 'Chia đôi');
  } finally {
    if (root) await act(async () => root.unmount()); page.close();
    Object.assign(globalThis, { window: previous.window, document: previous.document, IS_REACT_ACT_ENVIRONMENT: previous.act });
    await rm(directory, { recursive: true, force: true });
  }
});
