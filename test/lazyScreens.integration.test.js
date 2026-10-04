import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('extracted screens render student profile fields and a numeric zero in the score table', async () => {
  const directory = await mkdtemp(resolve('node_modules/.screens-test-'));
  try {
    const outputs = {};
    for (const name of ['StudentProfileModal', 'LearningResultsWorkspace']) {
      const outfile = join(directory, `${name}.mjs`);
      await build({ entryPoints: [`src/components/${name}.jsx`], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
        plugins: [{ name: 'fake-screen-config', setup(builder) {
          builder.onResolve({ filter: /config\/firebase$/ }, () => ({ path: 'config', namespace: 'fake' }));
          builder.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: 'export const db={};export const appId="test";export const auth={};', loader: 'js' }));
        } }] });
      outputs[name] = (await import(pathToFileURL(outfile))).default;
    }
    const profile = { activeStudentProfile: { id: 'a', accessCode: 'HS001', className: '6A', fullName: 'Nguyễn An' },
      activeStudentPendingProfileRequests: [], activeStudentPendingProfileFieldKeys: new Set(), activeStudentPendingProfileChanges: {},
      currentSchoolYear: '2026-2027', derivedProvinceOptions: [], currentWardOptions: [], householdWardOptions: [],
      studentProfileEditableFields: [{ key: 'fullName', label: 'Họ tên' }], studentProfileDraft: { fullName: 'Nguyễn An' },
      studentProfileDocumentOverrides: {}, studentProfileImagePreviews: {}, studentProfileImages: {}, STUDENT_PROFILE_IMAGE_FIELDS: [] };
    const profileHtml = renderToStaticMarkup(React.createElement(outputs.StudentProfileModal, { view: profile }));
    assert.match(profileHtml, /Hồ sơ học sinh/); assert.match(profileHtml, /Nguyễn An/); assert.match(profileHtml, /HS001/);
    const view = { isAdmin: true, activeSchoolYear: '2026-2027', canWriteCurrentSchoolYear: true, quickScoreGrade: '6', quickScoreSchoolCode: 'NAN',
      QUICK_SCORE_SUBJECTS: [{ key: 'toan', label: 'Toán' }], quickSelectedSubjects: [{ key: 'toan', label: 'Toán' }],
      quickSelectedSemesters: [{ key: 'hki', label: 'HK1' }], quickVisibleSubjects: new Set(['toan']), quickVisibleSemesters: new Set(['hki']),
      quickScoreStudents: [{ id: 'a', fullName: 'Nguyễn An', className: '6A', accessCode: 'HS001' }], quickScoreMailStudentIds: new Set(),
      quickSubjectColSpanBySubject: { toan: 7 }, quickVisibleScoreColumnsBySubject: [{ id: 'zero', semester: 'hki', pageIndex: 0, scoreIndex: 0, subjectKey: 'toan', editable: true }],
      quickScorebookEdits: {}, quickInputDrafts: {}, quickQuizScoreKeySet: new Set(), parseScoreNumber: value => Number(value), getQuickScoreStudentKey: student => student.id,
      getQuickScoreKey: () => 'zero', getQuickScoreInputValue: () => 0, getQuickScoreTextClass: () => '', getQuickScoreColumnWidth: () => 40,
      getQuickSemesterScoreResult: () => 'Đạt', getQuickAcademicResult: () => 'Đạt', getQuickSemesterTermAverage: () => '0.0', formatScoreDisplayValue: value => value === '' ? '' : Number(value).toFixed(1),
      toggleAllQuickScoreMailStudents: () => {} };
    const scoreHtml = renderToStaticMarkup(React.createElement(outputs.LearningResultsWorkspace, { view }));
    assert.match(scoreHtml, /Nguyễn An/); assert.match(scoreHtml, /value="0.0"/); assert.match(scoreHtml, /KQ Cả năm/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
