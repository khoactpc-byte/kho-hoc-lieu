import React from 'react';
import { Calendar, CheckCircle2, ChevronDown, FileText, GraduationCap, Loader2, MapPin, Phone, Pin, Send, User, X } from 'lucide-react';

const fieldClass = 'w-full pl-10 pr-4 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100 transition-all placeholder:text-slate-400';

function FieldIcon({ children }) {
  return <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">{children}</span>;
}

export default function AdmissionFormModal({
  schoolYear,
  form,
  grades,
  documents,
  uniqueProvinces,
  filteredCommunes,
  isLoadingCommunes,
  isSubmitting,
  onClose,
  onFieldChange,
  onDocumentChange,
  onProvinceChange,
  onCommuneChange,
  onDetailedAddressChange,
  onReset,
  onSubmit
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-2 sm:p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] bg-slate-50 shadow-2xl border border-white/20">
        <div className="bg-gradient-to-r from-sky-800 via-indigo-900 to-slate-950 text-white px-5 py-5 sm:px-7 sm:py-6 relative overflow-hidden shrink-0 shadow-md">
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] tracking-[0.2em] font-black uppercase text-sky-300/90 mb-0.5">THCS Nguyễn An Ninh</div>
              <h3 className="text-base font-black uppercase tracking-tight text-white sm:text-xl">Đăng ký tuyển sinh {schoolYear}</h3>
              <p className="text-[11px] font-bold text-slate-300/80 mt-0.5">Hệ thống nộp hồ sơ nhập học trực tuyến</p>
            </div>
            <button type="button" onClick={onClose} className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all flex items-center justify-center border border-white/10" aria-label="Đóng form tuyển sinh"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          <section className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100"><div className="w-1.5 h-4 rounded-full bg-sky-600" /><span className="text-xs font-black uppercase tracking-wider text-slate-700">1. Thông tin cá nhân học sinh</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Họ và tên học sinh *</span>
                <div className="relative"><FieldIcon><User className="h-4.5 w-4.5" /></FieldIcon><input id="admission-fullName" value={form.fullName} onChange={event => onFieldChange('fullName', event.target.value)} placeholder="Nhập đầy đủ họ và tên tiếng Việt..." className={fieldClass} /></div>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Ngày tháng năm sinh *</span>
                <div className="relative"><FieldIcon><Calendar className="h-4.5 w-4.5" /></FieldIcon><input id="admission-birthDate" type="date" value={form.birthDate} onChange={event => onFieldChange('birthDate', event.target.value)} className={fieldClass} /></div>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Nơi sinh (Tỉnh/Thành phố) *</span>
                <div className="relative">
                  <FieldIcon><MapPin className="h-4.5 w-4.5" /></FieldIcon>
                  {uniqueProvinces.length === 0 && !isLoadingCommunes ? <input id="admission-birthPlace" value={form.birthPlace} onChange={event => onFieldChange('birthPlace', event.target.value)} placeholder="Nhập tỉnh/thành phố nơi sinh..." className={fieldClass} /> : <select id="admission-birthPlace" value={form.birthPlace} onChange={event => onFieldChange('birthPlace', event.target.value)} disabled={isLoadingCommunes} className={`${fieldClass} appearance-none cursor-pointer disabled:opacity-50`}><option value="">Chọn Tỉnh/Thành phố</option>{uniqueProvinces.map(province => <option key={`birthplace-${province}`} value={province}>{province}</option>)}</select>}
                  <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400"><ChevronDown className="h-4 w-4" /></span>
                </div>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Số điện thoại liên hệ *</span>
                <div className="relative"><FieldIcon><Phone className="h-4.5 w-4.5" /></FieldIcon><input id="admission-phone" type="tel" inputMode="tel" value={form.phone} onChange={event => onFieldChange('phone', event.target.value)} placeholder="Số điện thoại phụ huynh..." className={fieldClass} /></div>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Đăng ký học lớp *</span>
                <div className="relative"><FieldIcon><GraduationCap className="h-4.5 w-4.5" /></FieldIcon><select id="admission-targetClass" value={form.targetClass} onChange={event => onFieldChange('targetClass', event.target.value)} className={`${fieldClass} appearance-none cursor-pointer`}><option value="">Chọn lớp học đăng ký</option>{grades.map(grade => <option key={grade} value={`Lớp ${grade}`}>Lớp {grade}</option>)}</select><span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400"><ChevronDown className="h-4 w-4" /></span></div>
              </label>
            </div>
          </section>

          <section className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
            <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100"><div className="w-1.5 h-4 rounded-full bg-sky-600" /><span className="text-xs font-black uppercase tracking-wider text-slate-700">2. Nơi cư trú / Địa chỉ đang ở</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {uniqueProvinces.length === 0 && !isLoadingCommunes ? (
                <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Địa chỉ đang ở *</span><div className="relative"><FieldIcon><MapPin className="h-4.5 w-4.5" /></FieldIcon><input value={form.address} onChange={event => onFieldChange('address', event.target.value)} placeholder="Nhập địa chỉ đầy đủ..." className={fieldClass} /></div></label>
              ) : (
                <>
                  <label className="flex flex-col gap-1.5"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Tỉnh / Thành phố *</span><div className="relative"><FieldIcon><MapPin className="h-4.5 w-4.5" /></FieldIcon><select value={form.province || ''} onChange={event => onProvinceChange(event.target.value)} disabled={isLoadingCommunes} className={`${fieldClass} appearance-none cursor-pointer disabled:opacity-50`}><option value="">{isLoadingCommunes ? 'Đang tải dữ liệu...' : 'Chọn Tỉnh / Thành phố'}</option>{uniqueProvinces.map(province => <option key={province} value={province}>{province}</option>)}</select><span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400"><ChevronDown className="h-4 w-4" /></span></div></label>
                  <label className="flex flex-col gap-1.5"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Xã / Phường / Thị trấn *</span><div className="relative"><FieldIcon><MapPin className="h-4.5 w-4.5" /></FieldIcon><select value={form.commune || ''} onChange={event => onCommuneChange(event.target.value)} disabled={isLoadingCommunes || !form.province} className={`${fieldClass} appearance-none cursor-pointer disabled:opacity-50`}><option value="">Chọn Xã / Phường / Thị trấn</option>{filteredCommunes.map(commune => <option key={commune} value={commune}>{commune}</option>)}</select><span className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400"><ChevronDown className="h-4 w-4" /></span></div></label>
                  <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Số nhà, tên đường, thôn/xóm</span><div className="relative"><FieldIcon><Pin className="h-4.5 w-4.5" /></FieldIcon><input value={form.detailedAddress || ''} onChange={event => onDetailedAddressChange(event.target.value)} placeholder="Ví dụ: Số 12, Đường Nguyễn An Ninh..." className={fieldClass} /></div></label>
                </>
              )}
            </div>
          </section>

          <section className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-4">
            <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-100"><div className="w-1.5 h-4 rounded-full bg-sky-600" /><span className="text-xs font-black uppercase tracking-wider text-slate-700">3. Hồ sơ đính kèm (Hiện có)</span></div>
            <p className="text-[11px] font-medium text-slate-400">Vui lòng tích chọn những hồ sơ phụ huynh đang có sẵn để nộp cho nhà trường.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map(documentItem => {
                const checked = Boolean(form.documents?.[documentItem.key]);
                return <button key={documentItem.key} type="button" onClick={() => onDocumentChange(documentItem.key, !checked)} className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left ${checked ? 'bg-emerald-50/80 border-emerald-300' : 'bg-slate-50/50 border-slate-200/80'}`}><div className="flex items-center gap-3"><div className={`w-9 h-9 rounded-xl flex items-center justify-center ${checked ? 'bg-emerald-600 text-white' : 'bg-slate-200/80 text-slate-500'}`}><FileText className="w-5 h-5" /></div><div><div className="text-xs font-black uppercase text-slate-700">{documentItem.label}</div><div className={`text-[10px] font-bold mt-0.5 ${checked ? 'text-emerald-600' : 'text-slate-400'}`}>{checked ? 'Đã đính kèm' : 'Chưa chuẩn bị'}</div></div></div><CheckCircle2 className={`w-5 h-5 ${checked ? 'text-emerald-500' : 'text-slate-300'}`} /></button>;
              })}
            </div>
          </section>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between items-center gap-3 border-t border-slate-200/60 bg-white px-5 py-4 sm:px-7 sm:py-5 shrink-0">
          <button type="button" onClick={onReset} disabled={isSubmitting} className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-200 text-slate-500 text-xs font-black uppercase hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40">Xóa toàn bộ form</button>
          <button type="button" onClick={onSubmit} disabled={isSubmitting} className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white text-xs font-black uppercase shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{isSubmitting ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Send className="h-4.5 w-4.5" />} Xác nhận &amp; Gửi đăng ký</button>
        </div>
      </div>
    </div>
  );
}
