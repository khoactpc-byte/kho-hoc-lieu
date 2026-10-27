import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

test('teacher manager opens exam weeks, filters missing/pending pupils, shows ABCD/essay work and opens the exact grading context', async () => {
  const directory = await mkdtemp(resolve('node_modules/.teacher-quiz-manager-'));
  const page = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' }).window;
  const names = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  Object.assign(globalThis, { window: page, document: page.document, IS_REACT_ACT_ENVIRONMENT: true });
  page.MathJax = { typesetPromise: async () => {} };
  let root;
  try {
    const outfile = join(directory, 'manager.mjs');
    await build({ entryPoints: ['src/components/TeacherQuizManager.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', plugins: [{ name: 'no-network', setup(builder) {
      builder.onResolve({ filter: /teacherLearningMaterials$|teacherSubmissionAlerts$/ }, () => ({ path: 'observer', namespace: 'stub' }));
      builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const observeTeacherQuizManagement=()=>()=>{}; export const observeTeacherSubmissionAlerts=()=>()=>{};' }));
    } }] });
    const { default: Manager } = await import(pathToFileURL(outfile));
    const { createRoot } = await import('react-dom/client'); root = createRoot(page.document.getElementById('root'));
    const profile = { role: 'teacher', fullName: 'Giáo viên mẫu', schoolCode: 'NAN', grades: ['8'], subjects: ['Toán'] };
    const scope = { schoolCode: 'NAN', schoolYear: '2026-2027', grade: '8', subject: 'Toán', lesson: '18', quizId: 'quiz8' };
    const observers = [], navigation = [];
    const observe = (context, next, error) => { observers.push({ context, next, error }); return () => {}; };
    const data = { loading: false, quizzes: [{ ...scope, id: 'quiz8', isPublished: true, title: 'HK1' }, { ...scope, id: 'other-week', lesson: '1', isPublished: true, title: 'Tuần khác' }],
      students: ['Alpha', 'Beta', 'Gamma'].map((fullName, i) => ({ id: `${i + 1}`, fullName, accessCode: `HS${i + 1}`, className: '8A', schoolCode: 'NAN', schoolYear: scope.schoolYear })),
      results: [{ ...scope, studentAccessCode: 'HS1', score: 2.5, total: 5, answers: [{ questionText: '2 + 3 = ?', selectedOptionId: 'b', correctOptionId: 'b', isCorrect: true }] }],
      handwritten: [{ ...scope, studentAccessCode: 'HS2', fileUrl: 'https://example.com/work.pdf', fileName: 'Bài mẫu', aiScore: 3, aiMaxScore: 5 }] };
    await act(async () => root.render(React.createElement(Manager, { profile, subscriptionScope: { user: { uid: 'teacher' } }, schoolYear: scope.schoolYear,
      currentContext: { grade: scope.grade, subject: scope.subject, lesson: scope.lesson }, isQuizVisible: item => item.isPublished, observe, onOpenQuiz: (quiz, action) => navigation.push([quiz.id, quiz.grade, quiz.subject, quiz.lesson, action]) })));
    const button = label => [...page.document.querySelectorAll('button')].find(item => item.textContent === label || item.getAttribute('aria-label') === label);
    const click = label => act(async () => button(label).click());
    await click('Danh sách bài kiểm tra');
    assert.equal(page.document.getElementById('student-work-tab').getAttribute('aria-selected'), 'true');
    await click('Giáo viên');
    assert.ok(page.document.querySelector('[role="status"]'));
    assert.equal(page.document.querySelector('table'), null);
    await act(async () => observers.at(-1).next(data));
    assert.ok(page.document.querySelector('table').textContent.includes('2/3'));
    await click('Chưa nộp (1)');
    assert.equal(page.document.getElementById('missing-work-tab').getAttribute('aria-selected'), 'true');
    const missingList = page.document.querySelector('.teacher-missing-mobile-list');
    assert.match(missingList.textContent, /Gamma/);
    assert.doesNotMatch(missingList.textContent, /Alpha|Beta/, 'submitted and AI-pending pupils are not reminded as missing');
    assert.ok(button('Sao chép danh sách'));
    await click('Giáo viên');
    assert.equal(button('Tuần 1'), undefined, 'default follows the open week');
    const extraWeek = [...page.document.querySelectorAll('.teacher-week-choice label')].find(l => l.textContent === '1').querySelector('input');
    await act(async () => extraWeek.click());
    assert.ok(button('Tuần 1'), 'multi-week is opt-in');
    await act(async () => extraWeek.click());
    assert.equal(button('Tuần 1'), undefined);
    await click('Tuần 18');
    const roster = () => page.document.querySelector('[aria-label="Danh sách làm bài"]');
    assert.ok(roster().textContent.includes('2,5/5'));
    await click('Chưa làm (1)');
    assert.ok(roster().querySelector('tbody').textContent.includes('Gamma'));
    assert.equal(roster().querySelector('tbody').textContent.includes('Alpha'), false);
    await click('Đã làm (2)'); await click('Xem bài');
    assert.ok(roster().textContent.includes('Chọn: B · Đáp án: B · Đúng'));
    await click('Đóng bài làm'); await click('Chờ chấm (1)'); await click('Xem bài');
    assert.equal(roster().querySelector('a').href, 'https://example.com/work.pdf');
    assert.ok(roster().textContent.includes('Điểm AI chấm nháp'));
    await click('Bài nộp & Chấm điểm');
    assert.deepEqual(navigation[0], ['quiz8', '8', 'Toán', '18', 'scores']);
    assert.equal(page.document.querySelector('[role="dialog"]'), null);
    await click('Danh sách bài kiểm tra');
    assert.equal(page.document.getElementById('student-work-tab').getAttribute('aria-selected'), 'true', 'reopening always starts with submitted student work, even after using the teacher tab');
    const inboxData = { ...data, results: [{ ...data.results[0], id: 'r1', submittedAt: 10000 }], handwritten: [{ ...data.handwritten[0], id: 'e1', submittedAt: 11000 }],
      quickResults: [{ ...scope, id: 'review1', materialId: 'review-material', studentAccessCode: 'HS3', submittedAt: 12000, score: 0, total: 4 }], materials: [{ ...scope, id: 'review-material', type: 'quick_quiz', title: 'Ôn tập mẫu' }] };
    await act(async () => observers.at(-1).next(inboxData));
    assert.equal(observers.at(-1).context.includeInbox, true);
    assert.equal(button('Danh sách bài kiểm tra').querySelector('b').textContent, '3');
    await click('Học sinh3');
    const studentPanel = () => page.document.querySelector('[aria-label="Bài học sinh nộp"]');
    assert.match(studentPanel().textContent, /Câu hỏi ôn tập/); assert.match(studentPanel().textContent, /0\/4/);
    assert.equal(studentPanel().querySelector('.teacher-quiz-table-scroll tbody').children.length, 3);
    await click('Xem bài');
    const reader = page.document.querySelector('.teacher-grading-dialog');
    const managerOverlay = page.document.querySelector('.learning-week-overlay');
    assert.ok(reader && managerOverlay);
    assert.equal(managerOverlay.inert, true, 'the underlying manager must not intercept reader actions');
    const css = await readFile('src/index.css', 'utf8');
    const layer = selector => Number(css.match(new RegExp(`\\.${selector} \\{[^}]*z-index:\\s*(\\d+)`))?.[1]);
    assert.ok(layer('teacher-grading-dialog') > layer('learning-week-overlay'), 'the active paper must paint above its inert parent dialog');
    assert.equal(button('Danh sách bài kiểm tra').querySelector('b').textContent, '2');
    assert.ok(page.localStorage.getItem([...Object.keys(page.localStorage)].find(k => k.startsWith('khl-teacher-receipts-v1:'))).includes('quickResults:review1:12000'));
    await click('Đóng bài làm');
    assert.equal(page.document.querySelector('.teacher-grading-dialog'), null);
    assert.equal(managerOverlay.inert, undefined, 'closing the paper restores the manager');
    assert.ok(button('Đóng danh sách bài kiểm tra'));
    await click('Đánh dấu tất cả đã xem'); assert.equal(button('Danh sách bài kiểm tra').querySelector('b'), null);
    const kindSelect = page.document.querySelector('[aria-label="Loại bài nộp"]');
    await act(async () => { kindSelect.value = 'review'; kindSelect.dispatchEvent(new page.Event('change', { bubbles: true })); });
    assert.equal(studentPanel().querySelector('.teacher-quiz-table-scroll tbody').children.length, 1);
    await act(async () => observers.at(-1).next({ ...inboxData, quickResults: [{ ...inboxData.quickResults[0], submittedAt: 13000 }] }));
    assert.equal(button('Danh sách bài kiểm tra').querySelector('b').textContent, '1', 'a newer submission becomes unread again');
    await click('Giáo viên');
    await act(async () => observers.at(-1).error('Không tải được danh sách'));
    assert.ok(page.document.querySelector('[role="alert"]'));
    assert.equal(page.document.querySelector('table'), null);
  } finally {
    if (root) await act(async () => root.unmount());
    page.close(); for (const name of names) { if (previous[name] === undefined) delete globalThis[name]; else globalThis[name] = previous[name]; }
    await rm(directory, { recursive: true, force: true });
  }
});
