import { useState } from 'react';

export default function TextbookFoldersPanel({ grades, folders, onSave, showNotification }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(grades.map(grade => [grade, folders[grade] || ''])));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const normalized = Object.fromEntries(grades.map(grade => {
      const text = String(draft[grade] || '').trim();
      return [grade, text.match(/\/folders\/([\w-]+)/)?.[1] || text];
    }));
    if (Object.values(normalized).some(value => value && !/^[\w-]{10,}$/.test(value))) {
      showNotification?.('Nhập liên kết thư mục Drive hoặc mã thư mục hợp lệ.', 'error'); return;
    }
    setSaving(true);
    try { await onSave({ ...folders, ...normalized }); }
    catch (error) { showNotification?.(`Chưa lưu được thư mục SGK: ${error.message}`, 'error'); }
    finally { setSaving(false); }
  };
  return <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{grades.map(grade => <div key={grade} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <h4 className="mb-2 font-bold text-emerald-900">SGK lớp {grade}</h4>
      {folders[grade] ? <a className="mb-3 block text-sm text-emerald-700 underline" href={`https://drive.google.com/drive/folders/${folders[grade]}`} target="_blank" rel="noopener noreferrer">Mở thư mục Drive</a>
        : <p className="mb-3 text-xs text-slate-500">Chưa gán thư mục SGK.</p>}
      <input aria-label={`Thư mục SGK lớp ${grade}`} value={draft[grade] || ''} onChange={event => setDraft(previous => ({ ...previous, [grade]: event.target.value }))}
        className="w-full rounded border bg-white p-2 text-xs" placeholder="Dán liên kết thư mục Drive" />
    </div>)}</div>
    <button onClick={save} disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-40">{saving ? 'Đang lưu…' : 'Lưu thư mục SGK'}</button>
  </div>;
}
