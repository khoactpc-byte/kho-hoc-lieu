// Local in-memory backend for the real App UI. No external requests or real accounts.
export const fixture = {
  uid: 'admin-fixture', claims: { role: 'admin' }, writes: [], calls: [], listeners: new Set(),
  documents: new Map([
    ['settings/global', { schoolYear: '2026-2027', extraSchoolYears: ['2025-2026'], inputYearLocks: { '2025-2026': true } }],
    ['lesson_notes/g6_Toán_l1', { schoolCode: 'NAN', grade: '6', subject: 'Toán', lesson: '1', schoolYear: '2026-2027', content: '<h2>Bài học mẫu NAN</h2><p>Nội dung ở trường Nguyễn An Ninh.</p>' }],
    ['lesson_notes/TQK_g9_Toán_l1', { schoolCode: 'TQK', grade: '9', subject: 'Toán', lesson: '1', schoolYear: '2026-2027', content: '<h2>Bài học mẫu TQK</h2><p>Nội dung ở trường Trần Quang Khải.</p>' }],
    ['lesson_notes/g7_Lịchsử&ĐịaLý_l5', { schoolCode: 'NAN', grade: '7', subject: 'Lịch sử & Địa Lý', lesson: '5', schoolYear: '2026-2027', content: '<h2>Bài 4: Trung Quốc từ thế kỉ III TCN đến giữa thế kỉ XIX</h2><p>Nhà Đường (618–907).</p>' }],
    ['materials/history-attachment', { schoolCode: 'NAN', grade: '7', subject: 'Lịch sử & Địa Lý', lesson: '5', schoolYear: '2026-2027', title: 'Tài liệu minh họa', type: 'link', url: 'https://example.invalid/fixture' }],
    ['lesson_quizzes/history-quiz', { schoolCode: 'NAN', grade: '7', subject: 'Lịch sử & Địa Lý', lesson: '5', schoolYear: '2026-2027', title: 'Đề minh họa', content: '<p>Câu hỏi minh họa</p>' }]
  ])
};
export const fixtureUser = { uid: fixture.uid, isAnonymous: false, getIdTokenResult: async () => ({ claims: fixture.claims }), getIdToken: async () => 'fixture-token' };
export const auth = { currentUser: fixtureUser, authStateReady: async () => {} };
export const db = {};
export const appId = 'fixture';
export async function request(payload) {
  fixture.calls.push(payload);
  if (['validateAdminSession', 'validateStaffSession'].includes(payload.action)) return { status: 'success' };
  if (['listTeacherAccounts', 'listFiles', 'list', 'listPendingRegistrations'].includes(payload.action)) return { status: 'success', files: [], accounts: [], registrations: [] };
  return { status: 'success', files: [], data: [] };
}
const key = path => path.split('/public/data/')[1] || path;
const ref = args => ({ path: args[0]?.path ? `${args[0].path}/${args.slice(1).join('/')}` : args.slice(1).join('/') });
export const collection = (...args) => ({ ...ref(args), kind: 'collection' });
export const doc = (...args) => ({ ...ref(args), kind: 'document' });
export const where = (...args) => args;
export const query = (base, ...filters) => ({ ...base, filters });
export const orderBy = (...args) => args;
export const limit = (...args) => args;
export const limitToLast = limit;
export const deleteField = () => null;
export const increment = value => value;
export class FieldPath { constructor(...segments) { this.segments = segments; } }
const documentSnapshot = path => ({ id: path.split('/').at(-1), exists: () => fixture.documents.has(key(path)), data: () => fixture.documents.get(key(path)), metadata: { hasPendingWrites: false } });
function snapshot(reference) {
  if (reference.kind === 'document') return documentSnapshot(reference.path);
  const prefix = key(reference.path) + '/';
  return { docs: [...fixture.documents.keys()].filter(path => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
    .filter(path => (reference.filters || []).every(([field, operator, value]) => !['==', 'in'].includes(operator)
      || (operator === 'in' ? value.includes(fixture.documents.get(path)[field]) : fixture.documents.get(path)[field] === value)))
    .map(path => documentSnapshot(path)), metadata: { hasPendingWrites: false } };
}
export function onSnapshot(reference, ...args) {
  const next = args.find(value => typeof value === 'function');
  let previous;
  const listener = () => {
    const value = snapshot(reference);
    const serialized = JSON.stringify(value.docs ? value.docs.map(item => [item.id, item.data()]) : [value.exists(), value.data()]);
    if (serialized === previous) return;
    previous = serialized; next(value);
  };
  fixture.listeners.add(listener); listener();
  return () => fixture.listeners.delete(listener);
}
export const getDoc = async reference => snapshot(reference);
export const getDocFromServer = getDoc;
export const getDocs = getDoc;
export const getDocsFromServer = getDoc;
export const getCountFromServer = async reference => ({ data: () => ({ count: snapshot(reference).docs.length }) });
function write(reference, value, options) {
  const path = key(reference.path); fixture.writes.push({ path, data: structuredClone(value) });
  fixture.documents.set(path, options?.merge ? { ...fixture.documents.get(path), ...value } : { ...value });
}
const emit = () => [...fixture.listeners].forEach(listener => listener());
export const setDoc = async (...args) => { write(...args); emit(); };
export const updateDoc = async (reference, data) => setDoc(reference, data, { merge: true });
export const deleteDoc = async () => { throw new Error('Deletion is disabled in this fixture'); };
export const addDoc = async (reference, data) => { const result = doc(reference, 'new-fixture'); await setDoc(result, data); return { ...result, id: 'new-fixture' }; };
export async function runTransaction(database, callback) {
  const pending = [];
  const result = await callback({ get: getDoc, set: (...args) => pending.push(args), update: (reference, data) => pending.push([reference, data, { merge: true }]) });
  pending.forEach(args => write(...args)); if (pending.length) emit(); return result;
}
export const writeBatch = () => { const pending = []; return { set: (...args) => pending.push(args), commit: async () => { pending.forEach(args => write(...args)); emit(); } }; };
