import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const enabled = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8185';
test('Firestore Rules: leases, role scopes, private answers and maintenance fence', { skip: !enabled }, async t => {
  const env = await initializeTestEnvironment({ projectId: 'demo-khl-review', firestore: {
    host: '127.0.0.1', port: 8185, rules: await readFile(new URL('../firestore.rules.secure-ready', import.meta.url), 'utf8')
  } });
  const root = 'artifacts/rules-review/public/data';
  const scope = { schoolYear: '2026-2027', schoolCode: 'NAN', grade: '6', subject: 'Toán' };
  const people = {
    admin: { role: 'admin' }, teacher: { role: 'teacher', schoolCode: 'NAN', grades: ['6'], subjects: ['Toán'] },
    student: { role: 'student', ...scope, studentId: 's1', studentIds: ['s1', 's1-old'] }, thd: { role: 'thd' },
    expired: { role: 'admin' }, revoked: { role: 'admin' }
  };
  const session = who => who.padEnd(64, '0');
  const db = who => env.authenticatedContext(who, { appId: 'rules-review', sessionId: session(who) }).firestore();
  async function seed(path, data) { await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), path), data)); }
  try {
    await env.clearFirestore();
    for (const [who, identity] of Object.entries(people)) await seed(`artifacts/rules-review/server_sessions/${session(who)}`, {
      uid: who, identity, active: who !== 'revoked', expiresAt: Date.now() + (who === 'expired' ? -10000 : 120000), originalExpiresAt: Date.now() + 3600000
    });
    await seed(`${root}/settings/global`, { schoolYear: scope.schoolYear });
    await seed(`${root}/settings/thdTeachingAssignments`, { schemaVersion: 2 });
    for (const id of ['s1', 's1-old', 's2']) await seed(`${root}/students/${id}`, { ...scope, studentKey: id, fullName: id });
    await seed(`${root}/materials/safe`, { ...scope, type: 'link', studentSafe: true });
    await seed(`${root}/materials/legacy`, { ...scope, type: 'quick_quiz', quizData: { answer: 'SECRET' } });
    await seed(`${root}/materials/other`, { ...scope, subject: 'Văn', studentSafe: true });
    await seed(`${root}/lesson_quizzes/safe`, { ...scope, serverGraded: true });
    await seed(`${root}/quiz_results/result`, { ...scope, studentId: 's1', answers: ['SECRET'] });
    await seed(`${root}/lesson_progress/progress`, { ...scope, studentId: 's1' });
    await seed('artifacts/rules-review/server_quizzes/private', { answer: 'SECRET' });
    await t.test('anonymous, wrong application, expired and revoked sessions are denied', async () => {
      for (const client of [env.unauthenticatedContext().firestore(), db('expired'), db('revoked'),
        env.authenticatedContext('admin', { appId: 'other', sessionId: session('admin') }).firestore()]) {
        await assertFails(getDoc(doc(client, `${root}/students/s1`)));
      }
    });
    await t.test('students can query their historical identities and safe content only', async () => {
      const client = db('student');
      await assertSucceeds(getDoc(doc(client, `${root}/students/s1-old`)));
      await assertSucceeds(getDocs(query(collection(client, `${root}/students`), where('__name__', 'in', ['s1', 's1-old']))));
      await assertFails(getDoc(doc(client, `${root}/students/s2`)));
      await assertFails(getDocs(collection(client, `${root}/students`)));
      await assertSucceeds(getDocs(query(collection(client, `${root}/materials`), where('schoolCode', '==', 'NAN'), where('grade', '==', '6'), where('studentSafe', '==', true))));
      await assertSucceeds(getDoc(doc(client, `${root}/lesson_quizzes/safe`)));
      await assertFails(getDoc(doc(client, `${root}/materials/legacy`)));
      await assertFails(getDoc(doc(client, `${root}/quiz_results/result`)));
      await assertSucceeds(getDoc(doc(client, `${root}/lesson_progress/progress`)));
      await assertFails(getDoc(doc(client, `${root}/settings/global`)));
      await assertFails(setDoc(doc(client, `${root}/handwritten_submissions/forged`), { ...scope, studentId: 's2', teacherScore: 10 }));
    });
    await t.test('teachers are constrained by campus, grade and subject; grades use APIs', async () => {
      const client = db('teacher');
      await assertSucceeds(getDocs(query(collection(client, `${root}/students`), where('schoolCode', '==', 'NAN'), where('grade', '==', '6'))));
      await assertSucceeds(getDoc(doc(client, `${root}/materials/legacy`)));
      await assertFails(getDoc(doc(client, `${root}/materials/other`)));
      await assertSucceeds(setDoc(doc(client, `${root}/lesson_notes/new`), { ...scope, content: 'Bài học' }));
      await assertFails(setDoc(doc(client, `${root}/lesson_notes/wrong`), { ...scope, schoolCode: 'THD' }));
      await assertFails(setDoc(doc(client, `${root}/scorebooks/forged`), { ...scope, edits: { arbitrary: 10 } }));
      await assertFails(setDoc(doc(client, `${root}/materials/leak`), { ...scope, studentSafe: true, quizData: { answer: 'SECRET' } }));
      await assertFails(updateDoc(doc(client, `${root}/materials/safe`), { quizData: { answer: 'SECRET' } }));
    });
    await t.test('private server graph cannot be read even by the browser admin', async () => {
      for (const who of ['student', 'teacher', 'admin', 'thd']) await assertFails(getDoc(doc(db(who), 'artifacts/rules-review/server_quizzes/private')));
    });
    await t.test('administrator keeps immutable identity; THD settings remain scoped', async () => {
      await assertSucceeds(setDoc(doc(db('admin'), `${root}/student_sync_jobs/valid`), { studentId: 's1', status: 'pending' }));
      await assertSucceeds(setDoc(doc(db('admin'), `${root}/student_archives/archived`), { ...scope, studentKey: 'archived' }));
      await assertSucceeds(setDoc(doc(db('admin'), `${root}/students/new`), { ...scope, studentKey: 'new', fullName: 'New' }));
      await assertSucceeds(updateDoc(doc(db('admin'), `${root}/students/s1`), { fullName: 'Sửa tên' }));
      await assertFails(updateDoc(doc(db('admin'), `${root}/students/s1`), { studentKey: 'other' }));
      await assertSucceeds(updateDoc(doc(db('thd'), `${root}/settings/thdTeachingAssignments`), { updatedAt: 1 }));
      await assertFails(updateDoc(doc(db('thd'), `${root}/settings/global`), { schoolYear: 'forged' }));
      await seed(`${root}/settings/global`, { schoolYear: scope.schoolYear, adminPass: 'legacy-fixture' });
      await assertSucceeds(getDoc(doc(db('admin'), `${root}/settings/global`)));
      await assertFails(getDoc(doc(db('teacher'), `${root}/settings/global`)));
      await seed(`${root}/settings/global`, { schoolYear: scope.schoolYear });
      await assertSucceeds(getDoc(doc(db('teacher'), `${root}/settings/global`)));
    });
    await t.test('year lock and maintenance block browser writes including administrators', async () => {
      await seed(`${root}/settings/global`, { inputYearLocks: { [scope.schoolYear]: true } });
      await assertFails(setDoc(doc(db('teacher'), `${root}/lesson_notes/locked`), scope));
      await assertFails(updateDoc(doc(db('admin'), `${root}/students/s1`), { fullName: 'Locked' }));
      await seed(`${root}/settings/global`, { maintenance: { active: true } });
      await assertFails(setDoc(doc(db('admin'), `${root}/student_sync_jobs/new`), scope));
      await assertFails(updateDoc(doc(db('admin'), `${root}/settings/global`), { maintenance: { active: false } }));
      await assertFails(updateDoc(doc(db('thd'), `${root}/settings/thdTeachingAssignments`), { updatedAt: 2 }));
    });
  } finally { await env.cleanup(); }
});
