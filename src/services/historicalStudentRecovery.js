import { collection, doc, getDocsFromServer, query, runTransaction, where } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { buildHistoricalStudentPlan, historicalStudentRecord } from '../utils/historicalStudents';
import { sameData } from '../utils/dataEquality';

const records = name => collection(db, 'artifacts', appId, 'public', 'data', name);
const ref = (name, id) => doc(records(name), id);
const plain = data => Object.fromEntries(Object.entries(data).filter(([key, value]) => !['id', 'sheetSync', 'syncRevision'].includes(key) && value !== undefined));

// Historical recovery creates a separate annual record and never moves the live roster.
export async function createHistoricalStudentRecord(row, { actor = '' } = {}) {
  const proposal = historicalStudentRecord(row);
  if (!/^HS\d{3,15}$/.test(proposal.accessCode)) throw new Error('Mã học sinh cần đối chiếu trước khi bổ sung năm cũ.');
  const byCode = await getDocsFromServer(query(records('students'), where('accessCode', '==', proposal.accessCode)));
  const byKey = await getDocsFromServer(query(records('students'), where('studentKey', '==', proposal.studentKey)));
  const observed = new Map([...(row.records || []), row.source].map(item => [item.id, item]));
  [...byCode.docs, ...byKey.docs].forEach(item => observed.set(item.id, { ...item.data(), id: item.id }));
  const target = ref('students', proposal.id);
  return runTransaction(db, async transaction => {
    const current = (await transaction.get(target)).data();
    const settings = (await transaction.get(ref('settings', 'global'))).data() || {};
    if (settings.maintenance?.active || settings.inputYearLocks?.[proposal.schoolYear]) throw new Error('Năm học đang khóa hoặc hệ thống đang bảo trì.');
    if (current) {
      if (current.studentKey !== proposal.studentKey || current.schoolYear !== proposal.schoolYear) throw new Error('Hồ sơ đích đã có dữ liệu khác.');
      return { ...current, id: target.id };
    }
    const latest = [];
    for (const id of observed.keys()) {
      const data = (await transaction.get(ref('students', id))).data();
      if (!data) throw new Error('Hồ sơ nguồn vừa thay đổi; mở lại danh sách năm cũ.');
      latest.push({ ...data, id });
    }
    const source = latest.find(item => item.id === row.source.id);
    if (!source || !sameData(plain(source), plain(row.source))) throw new Error('Hồ sơ nguồn vừa thay đổi; mở lại danh sách năm cũ.');
    const verified = buildHistoricalStudentPlan(latest, proposal.schoolYear).find(item => item.source.id === row.source.id);
    if (verified?.status !== 'ready' || verified.className !== proposal.className) throw new Error('Đã có hồ sơ năm này hoặc lịch sử lớp vừa thay đổi; tải lại để đối chiếu.');
    const codeRef = ref('student_code_registry', proposal.accessCode);
    const owner = (await transaction.get(codeRef)).data();
    const linkedIds = new Set(verified.records.map(item => item.id));
    if (owner && owner.studentKey !== proposal.studentKey && (owner.studentKey || !linkedIds.has(owner.studentId))) throw new Error('Mã đang thuộc hồ sơ khác.');
    const data = Object.fromEntries(Object.entries(historicalStudentRecord(verified)).filter(([key]) => !['id', 'historicalProjection'].includes(key)));
    Object.assign(data, { createdAt: Date.now(), updatedAt: Date.now(), updatedBy: actor, syncRevision: 1,
      sheetSync: { status: 'web_only', updatedAt: Date.now() } });
    transaction.set(target, data);
    transaction.set(codeRef, { ...(owner || {}), studentKey: proposal.studentKey, studentId: owner?.studentId || source.id,
      studentIds: [...new Set([...(owner?.studentIds || []), ...(owner?.studentId ? [owner.studentId] : []), ...linkedIds, target.id])], updatedAt: Date.now() });
    return { ...data, id: target.id };
  });
}

