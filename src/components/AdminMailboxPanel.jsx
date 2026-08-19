import React from 'react';
import { Folder, Loader2, Mail, Send, Trash2 } from 'lucide-react';

export default function AdminMailboxPanel({
  driveUrl,
  schoolYear,
  students,
  classOptions,
  recipientType,
  recipientValue,
  category,
  title,
  body,
  deleteMode,
  deleteCategory,
  deleteFrom,
  deleteTo,
  isSending,
  isDeleting,
  onRecipientTypeChange,
  onRecipientValueChange,
  onCategoryChange,
  onTitleChange,
  onBodyChange,
  onSend,
  onDeleteModeChange,
  onDeleteCategoryChange,
  onDeleteFromChange,
  onDeleteToChange,
  onDelete
}) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm animate-in fade-in slide-in-from-top-3 duration-200">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-emerald-950"><Mail className="h-5 w-5 text-emerald-600" /> Hộp thư học sinh</h3>
          <p className="mt-1 text-xs font-medium text-slate-500">Gửi riêng cho học sinh, một lớp hoặc toàn trường. Thư được lưu trong Drive hộp thư.</p>
        </div>
        <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><Folder className="h-4 w-4" /> Mở Drive hộp thư</a>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={recipientType} onChange={event => onRecipientTypeChange(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-400">
          <option value="student">Một học sinh</option><option value="class">Một lớp</option><option value="all">Toàn trường</option>
        </select>
        {recipientType === 'student' && <select value={recipientValue} onChange={event => onRecipientValueChange(event.target.value)} className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-400 sm:col-span-2"><option value="">Chọn học sinh nhận thư...</option>{students.map(student => <option key={student.id} value={student.id}>Lớp {student.className || '-'} - {student.fullName || 'Chưa có tên'} - {student.accessCode || 'chưa có mã'}</option>)}</select>}
        {recipientType === 'class' && <select value={recipientValue} onChange={event => onRecipientValueChange(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-400 sm:col-span-2"><option value="">Chọn lớp nhận thư...</option>{classOptions.map(className => <option key={className} value={className}>Lớp {className}</option>)}</select>}
        {recipientType === 'all' && <div className="flex h-10 items-center rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700 sm:col-span-2">Gửi đến tất cả học sinh năm {schoolYear}</div>}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr]">
        <select value={category} onChange={event => onCategoryChange(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-400"><option value="general">Thông báo chung</option><option value="score">Điểm học tập</option><option value="profile">Thiếu thông tin/hồ sơ</option><option value="quiz">Bài kiểm tra/bài làm</option><option value="reminder">Nhắc việc</option></select>
        <input value={title} onChange={event => onTitleChange(event.target.value)} placeholder="Tiêu đề thư..." className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-400" />
      </div>
      <textarea value={body} onChange={event => onBodyChange(event.target.value)} rows={4} placeholder="Nội dung admin gửi cho học sinh..." className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium outline-none focus:border-emerald-400" />
      <button type="button" onClick={onSend} disabled={isSending} className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 sm:w-auto">{isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gửi vào hộp thư</button>
      <div className="mt-4 border-t border-rose-100 pt-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-800"><Trash2 className="h-4 w-4" /> Xóa tin nhắn đã gửi</div>
        <div className="grid gap-2 sm:grid-cols-4">
          <select value={deleteMode} onChange={event => onDeleteModeChange(event.target.value)} className="h-9 rounded-lg border border-rose-100 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-rose-300"><option value="filter">Xóa theo điều kiện</option><option value="all">Xóa toàn bộ tin nhắn</option></select>
          <select value={deleteCategory} onChange={event => onDeleteCategoryChange(event.target.value)} disabled={deleteMode === 'all'} className="h-9 rounded-lg border border-rose-100 bg-white px-2 text-xs font-semibold text-slate-700 outline-none disabled:bg-slate-100 disabled:text-slate-400"><option value="all">Tất cả mục</option><option value="general">Thông báo chung</option><option value="score">Kết quả học tập</option><option value="profile">Hồ sơ học sinh</option><option value="quiz">Bài kiểm tra</option><option value="reminder">Nhắc việc</option></select>
          <label className="flex h-9 items-center gap-1 rounded-lg border border-rose-100 bg-white px-2 text-[10px] font-semibold text-slate-500">Từ<input type="date" value={deleteFrom} onChange={event => onDeleteFromChange(event.target.value)} disabled={deleteMode === 'all'} className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none disabled:text-slate-400" /></label>
          <label className="flex h-9 items-center gap-1 rounded-lg border border-rose-100 bg-white px-2 text-[10px] font-semibold text-slate-500">Đến<input type="date" value={deleteTo} onChange={event => onDeleteToChange(event.target.value)} disabled={deleteMode === 'all'} className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none disabled:text-slate-400" /></label>
        </div>
        <button type="button" onClick={onDelete} disabled={isDeleting} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-black uppercase text-rose-700 hover:bg-rose-100 disabled:opacity-50 sm:w-auto">{isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Xóa tin phù hợp</button>
      </div>
    </div>
  );
}
