import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Loader2, MessageCircle, Send, UserRound, X } from 'lucide-react';
import { markConversationRead, sendConversationMessage, subscribeConversationMessages } from '../services/studentConversations';
import { CONVERSATION_MESSAGE_LIMIT, conversationId, conversationUnread } from '../utils/studentConversations';
import { profileDriveFileIds } from '../utils/profileDocumentFiles';

function ConversationAvatar({ name, portraitUrl }) {
  const [failedSource, setFailedSource] = useState('');
  const firstUrl = String(portraitUrl || '').split(/\s*,\s*|\n+/).map(value => value.trim()).find(Boolean) || '';
  const fileId = profileDriveFileIds(firstUrl)[0];
  const source = fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w80` : firstUrl;
  const initials = String(name || '').trim().split(/\s+/).filter(Boolean).slice(-2).map(word => word[0]).join('').toLocaleUpperCase('vi') || 'HS';
  return <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-blue-100 bg-blue-100 text-[9px] font-semibold text-blue-700">
    {source && failedSource !== source ? <img src={source} alt="" className="h-full w-full object-cover object-top" loading="lazy" decoding="async" onError={() => setFailedSource(source)} /> : initials}
  </span>;
}

export default function StudentConversationsDialog({ role, student, students = [], identityKey, inbox, replyTo, onClose, onBackMailbox, onOpenStudentProfile }) {
  const isAdmin = role === 'admin';
  const profiles = useMemo(() => {
    const byId = new Map(), byCode = new Map();
    for (const profile of students) {
      byId.set(profile.id, profile);
      const previous = byCode.get(profile.accessCode);
      if (!previous || String(profile.schoolYear || '') > String(previous.schoolYear || '')) byCode.set(profile.accessCode, profile);
    }
    return { byId, byCode };
  }, [students]);
  const portraitFor = item => {
    const profile = profiles.byId.get(item?.studentId) || profiles.byCode.get(item?.accessCode);
    return profile?.accessCode === item?.accessCode && profile?.schoolCode === item?.schoolCode ? profile?.portraitUrl || '' : '';
  };
  const [selected, setSelected] = useState(() => isAdmin ? '' : conversationId(student?.accessCode));
  const [search, setSearch] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [count, setCount] = useState(50);
  const [revision, setRevision] = useState(0);
  const [feed, setFeed] = useState({ scope: '', messages: [], status: 'loading', error: '' });
  const [drafts, setDrafts] = useState({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [readError, setReadError] = useState('');
  const [context, setContext] = useState(replyTo || null);
  const [success, setSuccess] = useState('');
  const pending = useRef(new Map());
  const mounted = useRef(true);
  const active = useRef(selected);
  active.current = selected;
  const bottom = useRef(null);
  const close = useRef(null);
  const closeAction = useRef(onClose);
  closeAction.current = onClose;
  const scope = `${identityKey}:${selected}`;
  const thread = inbox.threads.find(item => item.id === selected);
  const messages = feed.scope === scope ? feed.messages : [];
  const ready = feed.scope === scope && feed.status === 'ready';
  const draft = drafts[selected] || '';
  const latestSequence = messages.at(-1)?.sequence || 0;
  const readSequence = Number(thread?.[isAdmin ? 'adminReadSequence' : 'studentReadSequence'] || 0);
  const lastIncoming = Number(thread?.[isAdmin ? 'lastStudentSequence' : 'lastAdminSequence'] || 0);
  const accessCode = student?.accessCode, studentId = student?.id, schoolCode = student?.schoolCode || '';
  useEffect(() => {
    mounted.current = true;
    close.current?.focus();
    const escape = event => { if (event.key === 'Escape') closeAction.current(); };
    document.addEventListener('keydown', escape);
    return () => { mounted.current = false; document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => {
    if (!selected) return;
    let current = true;
    // Keep the current window while fetching older messages, so pagination does not jump to the latest message.
    setFeed(previous => previous.scope === scope && previous.status === 'ready'
      ? { ...previous, loading: true, error: '' } : { scope, messages: [], status: 'loading', error: '' });
    const fail = error => { if (current) setFeed({ scope, messages: [], status: 'error', error: error.message || 'Chưa tải được nội dung.' }); };
    let unsubscribe;
    try { unsubscribe = subscribeConversationMessages(selected, count, rows => {
      if (current) setFeed({ scope, messages: rows, status: 'ready', error: '' });
    }, fail); } catch (error) { fail(error); }
    return () => { current = false; unsubscribe?.(); };
  }, [selected, scope, count, revision]);
  useEffect(() => {
    if (!ready || !selected || latestSequence <= readSequence || lastIncoming <= readSequence) return;
    let current = true;
    setReadError('');
    markConversationRead({ role, student: { id: studentId, accessCode, schoolCode } }, { threadId: selected, throughSequence: latestSequence })
      .catch(error => { if (current) setReadError(`Chưa ghi nhận đã đọc: ${error.message}`); });
    return () => { current = false; };
  }, [ready, selected, latestSequence, readSequence, lastIncoming, role, studentId, accessCode, schoolCode, revision]);
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'end' }); }, [selected, latestSequence]);

  const choose = id => { setSelected(id); setCount(50); setSendError(''); setReadError(''); setSuccess(''); setContext(null); };
  const send = async event => {
    event.preventDefault();
    if (sending || !draft.trim() || !selected) return;
    const recipient = isAdmin ? thread?.studentId : studentId;
    if (!recipient) { setSendError('Chưa xác định được học sinh nhận tin. Tải lại hộp thư.'); return; }
    // Retrying an uncertain network result reuses the same ID, so one message is stored once.
    const signature = JSON.stringify([draft.trim(), context]);
    const previous = pending.current.get(selected);
    const request = previous?.signature === signature ? previous : { signature, messageId: globalThis.crypto.randomUUID() };
    pending.current.set(selected, request);
    const target = selected;
    setSending(true); setSendError(''); setSuccess('');
    try {
      await sendConversationMessage({ role, student }, { studentId: recipient, messageId: request.messageId, body: draft, replyTo: context });
      if (!mounted.current) return;
      pending.current.delete(target);
      setDrafts(values => ({ ...values, [target]: '' }));
      if (active.current === target) { setContext(null); setSuccess(isAdmin ? 'Đã gửi trả lời cho học sinh.' : 'Đã gửi tin cho admin.'); }
    } catch (error) {
      if (mounted.current && active.current === target) setSendError(`Chưa xác nhận gửi: ${error.message} Nội dung được giữ lại; bấm Gửi để thử lại.`);
    } finally { if (mounted.current) setSending(false); }
  };
  const filtered = inbox.threads.filter(item => (!onlyUnread || conversationUnread(item, role))
    && `${item.studentName} ${item.className} ${item.accessCode}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
  const retry = () => { inbox.retry(); setRevision(value => value + 1); };
  const content = (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/55 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="conversation-title">
      <div className="flex h-[min(800px,100%)] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b bg-blue-50 px-3 py-3 sm:px-5">
          <div className="min-w-0"><h2 id="conversation-title" className="flex items-center gap-2 font-semibold text-blue-950"><MessageCircle className="h-5 w-5 shrink-0" />{isAdmin ? 'Tin nhắn học sinh' : 'Nhắn admin'}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{isAdmin ? `${inbox.unreadCount} cuộc trao đổi chưa đọc` : 'Em có thể hỏi hoặc trả lời thông báo tại đây.'}</p></div>
          <button ref={close} type="button" onClick={onClose} aria-label="Đóng tin nhắn" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-white text-slate-600"><X className="h-5 w-5" /></button>
        </header>
        {inbox.error && <div role="alert" className="shrink-0 bg-rose-50 p-3 text-sm text-rose-700">Chưa tải được hộp thư: {inbox.error} <button type="button" onClick={retry} className="underline">Thử lại</button></div>}
        <div className={`grid min-h-0 flex-1 ${isAdmin ? 'sm:grid-cols-[280px_minmax(0,1fr)]' : ''}`}>
          {isAdmin && <aside className={`${selected ? 'hidden sm:flex' : 'flex'} min-h-0 flex-col border-r bg-slate-50`}>
            <div className="shrink-0 space-y-2 border-b p-3"><input aria-label="Tìm cuộc trao đổi" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tên, lớp hoặc mã học sinh" className="w-full rounded-lg border bg-white p-2 text-sm" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyUnread} onChange={event => setOnlyUnread(event.target.checked)} />Chỉ tin chưa đọc</label></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {inbox.status === 'loading' && <p className="p-3 text-sm text-slate-500">Đang tải tin nhắn...</p>}
              {inbox.status === 'ready' && !filtered.length && <p className="p-3 text-sm text-slate-500">Chưa có cuộc trao đổi phù hợp. Khi học sinh nhắn, tin sẽ hiện tại đây.</p>}
              {filtered.map(item => <button key={item.id} type="button" onClick={() => choose(item.id)} onDoubleClick={() => onOpenStudentProfile?.(item)} title={`${item.studentName} · ${item.className || 'Chưa xếp lớp'} · ${item.accessCode}${onOpenStudentProfile ? ' — Nhấn đúp để mở hồ sơ' : ''}`} className={`mb-1.5 flex min-h-10 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left ${selected === item.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                <ConversationAvatar name={item.studentName} portraitUrl={portraitFor(item)} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.studentName}</span>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">{item.className || 'Chưa xếp lớp'} · {item.accessCode}</span>
                {conversationUnread(item, role) && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="Chưa đọc" />}
              </button>)}
            </div>
          </aside>}
          <section className={`${isAdmin && !selected ? 'hidden sm:flex' : 'flex'} min-h-0 min-w-0 flex-col`}>
            {!selected ? <p className="m-auto p-4 text-center text-sm text-slate-500">Chọn học sinh để xem và trả lời.</p> : <>
              <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
                {isAdmin ? <button type="button" onClick={() => choose('')} aria-label="Quay lại danh sách tin nhắn" className="p-2 sm:hidden"><ArrowLeft className="h-5 w-5" /></button>
                  : onBackMailbox && <button type="button" onClick={onBackMailbox} className="flex items-center gap-1 rounded-lg border px-2 py-2 text-xs"><ArrowLeft className="h-4 w-4" />Hộp thư</button>}
                <div onDoubleClick={() => isAdmin && thread && onOpenStudentProfile?.(thread)} title={isAdmin && onOpenStudentProfile ? 'Nhấn đúp để mở hồ sơ học sinh' : undefined} className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-slate-700">{isAdmin ? <><ConversationAvatar name={thread?.studentName} portraitUrl={portraitFor(thread)} /><span className="min-w-0 truncate" title={thread?.studentName}>{thread?.studentName}</span><span className="shrink-0 whitespace-nowrap text-xs font-normal">{thread?.className} · {selected}</span></> : 'Trao đổi riêng với admin'}</div>
                {isAdmin && onOpenStudentProfile && <button type="button" onClick={() => onOpenStudentProfile(thread)} disabled={!thread} title="Mở hồ sơ học sinh" aria-label="Mở hồ sơ học sinh" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700 disabled:opacity-50"><UserRound className="h-4 w-4" /></button>}
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4" aria-label="Nội dung trao đổi">
                {feed.scope === scope && feed.error ? <div role="alert" className="text-sm text-rose-700">{feed.error} <button type="button" onClick={retry} className="underline">Tải lại tin nhắn</button></div>
                  : !ready ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Đang tải nội dung...</p>
                    : !messages.length && <p className="py-4 text-center text-sm text-slate-500">Em nhập nội dung bên dưới để nhắn cho admin.</p>}
                {ready && messages.length >= count && <button type="button" onClick={() => setCount(value => value + 50)} className="block w-full text-center text-sm text-blue-600">Xem tin trước</button>}
                {messages.map(message => <article key={message.id} className={`w-fit max-w-[94%] rounded-2xl px-3 py-2 text-sm ${message.senderRole === role ? 'ml-auto bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  <div className="mb-1 text-xs font-semibold opacity-80">{message.senderLabel}</div>
                  {message.replyTo?.title && <div className="mb-2 border-l-2 border-current pl-2 text-xs opacity-80">Về thư: {message.replyTo.title}</div>}
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</p>
                  <div className="mt-1 text-[11px] opacity-75">{message.createdAt ? new Date(message.createdAt).toLocaleString('vi-VN') : ''}
                    {message.senderRole === role && <span> · {Number(thread?.[isAdmin ? 'studentReadSequence' : 'adminReadSequence'] || 0) >= message.sequence ? 'Đã đọc' : 'Đã gửi'}</span>}</div>
                </article>)}<div ref={bottom} />
              </div>
              <form onSubmit={send} className="max-h-[50%] shrink-0 space-y-2 overflow-y-auto border-t bg-white p-3">
                {readError && <p role="alert" className="text-xs text-amber-700">{readError} <button type="button" onClick={retry} className="underline">Thử lại</button></p>}
                {context && <div className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-700"><span className="min-w-0 break-words">Trả lời thư: {context.title}</span><button type="button" disabled={sending} onClick={() => setContext(null)} aria-label="Bỏ trích dẫn thư" className="shrink-0 p-1"><X className="h-4 w-4" /></button></div>}
                {sendError && <p role="alert" className="text-xs text-rose-700">{sendError}</p>}
                {success && <p role="status" className="text-xs text-emerald-700">{success}</p>}
                <label className="block text-xs font-medium text-slate-600" htmlFor="conversation-draft">{isAdmin ? `Trả lời ${thread?.studentName || 'học sinh'} (${selected})` : 'Nội dung gửi admin'}</label>
                <div className="flex items-end gap-2"><textarea id="conversation-draft" value={draft} disabled={sending} onChange={event => { setDrafts(values => ({ ...values, [selected]: event.target.value })); setSuccess(''); }} maxLength={CONVERSATION_MESSAGE_LIMIT} rows={2} placeholder={isAdmin ? 'Nhập câu trả lời...' : 'Em cần admin hỗ trợ điều gì?'} className="min-w-0 flex-1 resize-none rounded-xl border p-2 text-sm outline-none focus:border-blue-400" />
                  <button type="submit" disabled={sending || !draft.trim() || !ready || inbox.status !== 'ready'} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-50">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? 'Đang gửi' : 'Gửi'}</button></div>
              </form>
            </>}
          </section>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
