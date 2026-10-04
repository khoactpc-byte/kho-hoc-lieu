import { useEffect, useRef, useState } from 'react';
import { doc, getDocFromServer, runTransaction } from 'firebase/firestore';
import { appId, db } from '../config/firebase';
import { hasLegacyRowEdits, migrateLegacyRowEdits } from '../utils/studentScoreKeys';
import { SCOPED_AUTH_ENABLED } from '../services/scopedIdentity';
import { requestPrivateApi } from '../services/serverQuizClient';

export default function ScorebookMigrationNotice({ docId, edits, students, user, showNotification, onMigrated }) {
  const [preview, setPreview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rosterJson, setRosterJson] = useState('');
  const currentDocument = useRef(docId);
  currentDocument.current = docId;
  const migrating = useRef(false);
  useEffect(() => { setPreview(false); setConfirmed(false); setRosterJson(''); }, [docId]);
  if (!hasLegacyRowEdits(edits)) return null;
  const migrate = async () => {
    if (!confirmed || !user || migrating.current) return;
    migrating.current = true;
    const capturedId = docId;
    setBusy(true);
    try {
      // A pasted historical roster may override today's roster; never guess silently.
      const roster = rosterJson.trim() ? JSON.parse(rosterJson) : students;
      if (!Array.isArray(roster)) throw new Error('Danh sách đối chiếu phải là một mảng học sinh.');
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'scorebooks', docId);
      let result;
      if (SCOPED_AUTH_ENABLED) {
        const current = (await getDocFromServer(ref)).data() || {};
        const payload = { documentId: capturedId, roster, expectedEdits: current.edits || {}, expectedSources: current.scoreSources || {} };
        await requestPrivateApi('data', 'migrateScores', { ...payload, dryRun: true });
        result = (await requestPrivateApi('data', 'migrateScores', { ...payload, dryRun: false })).edits;
      } else result = await runTransaction(db, async transaction => {
        const data = (await transaction.get(ref)).data() || {};
        if (!hasLegacyRowEdits(data.edits)) return data.edits || {};
        const next = migrateLegacyRowEdits(data.edits, roster);
        const sources = migrateLegacyRowEdits(data.scoreSources || {}, roster);
        const migration = { verifiedBy: user.uid, verifiedAt: Date.now(), roster: roster.map(student => ({
          id: student.id || '', accessCode: student.accessCode || '', studentKey: student.studentKey || '',
          previousStudentId: student.previousStudentId || '', fullName: student.fullName || '', className: student.className || ''
        })), legacyEdits: data.edits, legacySources: data.scoreSources || {} };
        if (new TextEncoder().encode(JSON.stringify({ ...data, edits: next, scoreSources: sources, migration })).length > 800000) {
          throw new Error('Sổ điểm quá lớn để giữ bản đối chiếu trong cùng hồ sơ. Cần chuyển bằng công cụ máy chủ; dữ liệu cũ được giữ nguyên.');
        }
        transaction.set(ref, { edits: next, scoreSources: sources, schemaVersion: 2,
          migration
        }, { mergeFields: ['edits', 'scoreSources', 'schemaVersion', 'migration'] });
        return next;
      });
      if (currentDocument.current === capturedId) onMigrated?.(result);
      showNotification?.('Đã gắn dữ liệu với mã học sinh; giữ nguyên bản cũ để đối chiếu.');
    } catch (error) { showNotification?.(`Chưa chuyển dữ liệu: ${error.message}`, 'error'); }
    finally { migrating.current = false; setBusy(false); }
  };
  return <div className="my-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 print:hidden">
    <p className="font-bold">Điểm cũ cần đối chiếu danh sách học sinh trước khi hiển thị hoặc sửa.</p>
    <p>Điểm đã nhập vẫn được giữ. Chỉ chuyển khi xác nhận đúng thứ tự học sinh tại thời điểm nhập điểm.</p>
    <button type="button" onClick={() => setPreview(!preview)} className="mt-2 rounded border bg-white px-3 py-2">{preview ? 'Đóng đối chiếu' : 'Xem danh sách đối chiếu'}</button>
    {preview && <div className="mt-3">
      <ol className="max-h-56 list-inside list-decimal overflow-auto bg-white p-2">
        {students.map((student, index) => <li key={student.id || index}>{student.fullName} · {student.className} · {student.accessCode || student.id}</li>)}
      </ol>
      <label className="mt-2 block">Nếu danh sách cũ khác danh sách trên, dán danh sách JSON đã đối chiếu (id/accessCode/studentKey) theo đúng thứ tự:
        <textarea value={rosterJson} onChange={event => { setRosterJson(event.target.value); setConfirmed(false); }} className="mt-1 w-full rounded border bg-white p-2" rows={3} />
      </label>
      <label className="my-2 block"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> Tôi đã đối chiếu đúng thứ tự học sinh với dữ liệu điểm cũ.</label>
      <button type="button" onClick={migrate} disabled={!confirmed || busy} className="rounded bg-amber-700 px-3 py-2 text-white disabled:opacity-50">{busy ? 'Đang chuyển...' : 'Gắn điểm với mã học sinh'}</button>
    </div>}
  </div>;
}
