import React from 'react';
import { Calendar, ClipboardCheck, Pencil, Sparkles, X } from 'lucide-react';

export default function NewsViewerModal({
  news,
  isAdmin,
  isAdmissionNews,
  admissionSchoolYear,
  onEdit,
  onClose,
  onOpenAdmission,
  onContentError
}) {
  if (!news) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-2 animate-in zoom-in-95 duration-200 sm:p-5">
      <div className="flex max-h-[94vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-[1.75rem] border border-white/20 bg-white shadow-2xl sm:rounded-[3rem]">
        <div className="flex items-center justify-between border-b bg-slate-50/50 px-5 py-4 sm:px-8 sm:py-6">
          <div className="min-w-0 pr-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {news.isHot && <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-rose-600"><Sparkles className="h-3.5 w-3.5" fill="currentColor" /> Tin nóng</span>}
              <h3 className="text-xl font-black leading-tight text-slate-800 sm:text-2xl">{news.title}</h3>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <Calendar className="h-3.5 w-3.5" /> {new Date(news.createdAt).toLocaleString('vi-VN')}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isAdmin && <button onClick={event => onEdit(event, news)} className="rounded-full border bg-white p-3 text-blue-600 shadow-md transition-all hover:bg-blue-600 hover:text-white" title="Sửa bản tin"><Pencil className="h-5 w-5" /></button>}
            <button onClick={onClose} className="rounded-full border bg-white p-3 shadow-md transition-all hover:bg-rose-500 hover:text-white" aria-label="Đóng bản tin"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-white p-4 student-content sm:p-8 md:p-10" onErrorCapture={onContentError}>
          <div dangerouslySetInnerHTML={{ __html: news.content }} />
          {isAdmissionNews && (
            <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-center">
              <div className="mb-3 text-xs font-black uppercase text-sky-800">Đăng ký tuyển sinh năm học {admissionSchoolYear}</div>
              <button type="button" onClick={onOpenAdmission} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-black uppercase text-white shadow-lg hover:bg-sky-700"><ClipboardCheck className="h-5 w-5" /> Đăng ký tuyển sinh</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
