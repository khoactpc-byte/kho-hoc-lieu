import { Clock, X, Image as ImageIcon } from 'lucide-react';

export default function StudentProfileModal({ view }) {
  const {
    STUDENT_PROFILE_IMAGE_FIELDS,
    activeStudentIsReadOnly,
    activeStudentPendingProfileChanges,
    activeStudentPendingProfileFieldKeys,
    activeStudentPendingProfileFieldLabels,
    activeStudentPendingProfileRequests,
    activeStudentProfile,
    activeStudentReadOnlyReason,
    applyStudentProfileImageFiles,
    currentSchoolYear,
    currentWardOptions,
    derivedProvinceOptions,
    getStudentProfileEmbedUrl,
    getStudentProfileImageUrl,
    handleStudentProfileFieldChange,
    handleStudentProfileImageChange,
    householdWardOptions,
    isSubmittingProfileRequest,
    removeStudentProfileExistingDocumentPage,
    removeStudentProfileSelectedImage,
    setShowStudentProfileModal,
    studentProfileDocumentOverrides,
    studentProfileDraft,
    studentProfileEditableFields,
    studentProfileImageAppendModes,
    studentProfileImagePreviews,
    studentProfileImages,
    submitStudentProfileRequest
  } = view;
  return (
<div className="fixed inset-0 z-[115] bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col border border-white/20">
            <div className="px-5 py-4 border-b bg-slate-50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black text-slate-900 uppercase truncate">Hồ sơ học sinh</h3>
                  {activeStudentPendingProfileRequests.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-800">
                      <Clock className="w-3.5 h-3.5" /> Chờ duyệt
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-bold">Em gửi yêu cầu sửa, admin duyệt xong mới cập nhật hồ sơ chính.</p>
              </div>
              <button type="button" onClick={() => setShowStudentProfileModal(false)} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  ['Mã học sinh', activeStudentProfile.accessCode || ''],
                  ['Lớp', activeStudentProfile.className || ''],
                  ['Năm học', activeStudentProfile.schoolYear || currentSchoolYear],
                  ['Tình trạng', activeStudentProfile.status === 'dropped' ? 'Bỏ học' : 'Đang học']
                ].map(([label, value]) => (
                  <label key={label} className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase text-slate-400">{label}</span>
                    <input value={value} readOnly className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-black text-slate-500" />
                  </label>
                ))}
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                {activeStudentPendingProfileRequests.length > 0
                  ? `Các mục đang chờ admin duyệt${activeStudentPendingProfileFieldLabels.length ? `: ${activeStudentPendingProfileFieldLabels.join(', ')}` : ''}. Em vẫn có thể sửa lại hoặc bổ sung mục khác rồi bấm cập nhật.`
                  : 'Học sinh sửa thông tin rồi gửi yêu cầu. Admin duyệt xong hồ sơ chính mới thay đổi.'}
              </div>
              {activeStudentIsReadOnly && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black text-slate-600">
                  {activeStudentReadOnlyReason}
                </div>
              )}

              <datalist id="student-profile-province-options">
                {derivedProvinceOptions.map(item => <option key={item} value={item} />)}
              </datalist>
              <datalist id="student-profile-current-ward-options">
                {currentWardOptions.map(item => <option key={item} value={item} />)}
              </datalist>
              <datalist id="student-profile-household-ward-options">
                {householdWardOptions.map(item => <option key={item} value={item} />)}
              </datalist>
              {studentProfileEditableFields.some(field => field.type === 'select') && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">
                  Học lực, hạnh kiểm lớp cũ chỉ chọn 3 mức: Tốt, Khá, Đạt. Các cách ghi cũ như Giỏi, Trung bình, Yếu, Chưa đạt sẽ tự quy đổi về 3 mức này.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {studentProfileEditableFields.map(field => {
                  const isFieldPending = activeStudentPendingProfileFieldKeys.has(field.key);
                  const listId = field.key === 'province' || field.key === 'householdProvince'
                    ? 'student-profile-province-options'
                    : field.key === 'ward'
                      ? 'student-profile-current-ward-options'
                      : field.key === 'householdWard'
                        ? 'student-profile-household-ward-options'
                        : undefined;
                  const placeholder = field.key === 'birthDate'
                    ? 'dd/mm/yyyy'
                    : field.key === 'identityCode'
                      ? '12 số hoặc bé chưa có'
                      : (field.key === 'ward' || field.key === 'householdWard')
                        ? 'Chọn tỉnh trước, rồi gõ/chọn phường xã'
                        : '';
                  return (
                    <label key={field.key} className="flex flex-col gap-1">
                      <span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400">
                        {field.label}
                        {isFieldPending && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] text-amber-700">Chờ duyệt</span>}
                      </span>
                      {field.type === 'select' ? (
                        <select
                          value={studentProfileDraft[field.key] || ''}
                          disabled={activeStudentIsReadOnly}
                          onChange={(event) => handleStudentProfileFieldChange(field.key, event.target.value)}
                          className={`rounded-2xl border px-3 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-400 ${isFieldPending ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}
                        >
                          <option value="">Chọn</option>
                          {(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input
                          value={studentProfileDraft[field.key] || ''}
                          list={listId}
                          placeholder={placeholder}
                          readOnly={activeStudentIsReadOnly}
                          disabled={activeStudentIsReadOnly}
                          onChange={(event) => handleStudentProfileFieldChange(field.key, event.target.value)}
                          className={`rounded-2xl border px-3 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-400 ${isFieldPending ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-600">
                  <ImageIcon className="w-4 h-4 text-blue-600" /> Ảnh hồ sơ và giấy tờ
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {STUDENT_PROFILE_IMAGE_FIELDS.map(field => {
                    const isFieldPending = activeStudentPendingProfileFieldKeys.has(field.key);
                    const isTranscript = field.key === 'transcriptUrl';
                    const hasDocumentOverride = Object.prototype.hasOwnProperty.call(studentProfileDocumentOverrides, field.key);
                    const currentDocumentUrl = hasDocumentOverride
                      ? studentProfileDocumentOverrides[field.key]
                      : (activeStudentPendingProfileChanges[field.key] || activeStudentProfile[field.key] || '');
                    const currentUrl = currentDocumentUrl;
                    const previewValue = studentProfileImagePreviews[field.key];
                    const previewUrls = Array.isArray(previewValue) ? previewValue : (previewValue ? [previewValue] : []);
                    const previewUrl = previewUrls[0] || getStudentProfileImageUrl(currentUrl);
                    const embedUrl = previewUrls.length ? '' : getStudentProfileEmbedUrl(currentUrl);
                    const originalUrls = String(currentUrl || '')
                      .split(/\s*,\s*|\n+/)
                      .map(item => item.trim())
                      .filter(Boolean);
                    const originalUrl = originalUrls[0] || '';
                    const selectedFiles = Array.isArray(studentProfileImages[field.key])
                      ? studentProfileImages[field.key]
                      : (studentProfileImages[field.key] ? [studentProfileImages[field.key]] : []);
                    const selectedFile = selectedFiles[0];
                    const canAddMoreImages = isTranscript;
                    const hasExistingImage = Boolean(currentUrl);
                    const showAddMoreImages = canAddMoreImages && (hasExistingImage || selectedFiles.length > 0);
                    const transcriptPages = isTranscript
                      ? [
                          ...originalUrls.map((url, index) => ({
                            key: `existing-${index}`,
                            kind: 'existing',
                            index,
                            imageUrl: getStudentProfileImageUrl(url),
                            openUrl: url
                          })),
                          ...previewUrls.map((url, index) => ({
                            key: `selected-${index}`,
                            kind: 'selected',
                            index,
                            imageUrl: url,
                            openUrl: ''
                          }))
                        ]
                      : [];
                    return (
                      <div key={field.key} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="mb-2 flex items-center gap-1 text-[10px] font-black uppercase text-slate-500">
                          {field.label}
                          {isFieldPending && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] text-amber-700">Chờ duyệt</span>}
                        </div>
                        {isTranscript ? (
                          <div className="aspect-[4/3] rounded-xl overflow-x-auto overflow-y-hidden border border-slate-100 bg-slate-50 flex snap-x snap-mandatory scroll-smooth">
                            {transcriptPages.length ? (
                              transcriptPages.map((page, pageIndex) => (
                                <div key={page.key} className="relative min-w-full h-full snap-center flex items-center justify-center bg-slate-100">
                                  <img src={page.imageUrl} alt={`${field.label} trang ${pageIndex + 1}`} className="w-full h-full object-contain" />
                                  <div className="absolute left-2 top-2 rounded-full bg-slate-900/70 px-2 py-1 text-[10px] font-black text-white">
                                    {pageIndex + 1}/{transcriptPages.length}
                                  </div>
                                  {page.openUrl && (
                                    <a href={page.openUrl} target="_blank" rel="noreferrer" className="absolute bottom-2 right-2 rounded-full bg-white/95 px-2.5 py-1.5 text-[10px] font-black uppercase text-slate-700 shadow-sm">
                                      Mở
                                    </a>
                                  )}
                                  {!activeStudentIsReadOnly && (
                                    <button
                                      type="button"
                                      onClick={() => page.kind === 'existing'
                                        ? removeStudentProfileExistingDocumentPage(field.key, page.index)
                                        : removeStudentProfileSelectedImage(field.key, page.index)}
                                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg"
                                      title="Xóa trang này"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="min-w-full h-full flex items-center justify-center text-center px-3 text-[11px] font-bold text-slate-400">
                                Chưa có ảnh
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="aspect-[4/3] rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                            {embedUrl ? (
                              <iframe title={field.label} src={embedUrl} className="w-full h-full border-0 bg-white" loading="lazy" />
                            ) : previewUrl ? (
                              <img src={previewUrl} alt={field.label} className="w-full h-full object-contain" />
                            ) : (
                              <div className="text-center px-3 text-[11px] font-bold text-slate-400">
                                Chưa có ảnh
                              </div>
                            )}
                          </div>
                        )}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <label className={`flex-1 cursor-pointer rounded-xl px-3 py-2 text-center text-[10px] font-black uppercase text-white shadow-sm ${isFieldPending ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {selectedFile || hasExistingImage ? 'Đổi ảnh' : 'Chọn ảnh'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              multiple={canAddMoreImages}
                              disabled={activeStudentIsReadOnly}
                              onChange={(event) => {
                                if (canAddMoreImages) {
                                  applyStudentProfileImageFiles(field.key, event.target.files, false);
                                } else {
                                  handleStudentProfileImageChange(field.key, event.target.files?.[0] || null, field.label);
                                }
                                event.target.value = null;
                              }}
                              className="hidden"
                            />
                          </label>
                          {showAddMoreImages && (
                            <label className={`cursor-pointer rounded-xl border px-3 py-2 text-[10px] font-black uppercase ${isFieldPending ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                              Thêm trang
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                multiple
                                disabled={activeStudentIsReadOnly}
                                onChange={(event) => { applyStudentProfileImageFiles(field.key, event.target.files, true); event.target.value = null; }}
                                className="hidden"
                              />
                            </label>
                          )}
                          {!isTranscript && originalUrls.length === 1 && (
                            <a href={originalUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:text-blue-600">
                              Mở
                            </a>
                          )}
                        </div>
                        {selectedFile && (
                          <div className="mt-2 truncate text-[10px] font-bold text-emerald-700">
                            {selectedFiles.length > 1
                              ? `Đã chọn: ${selectedFiles.length} ảnh, sẽ lưu từng trang khi gửi`
                              : `Đã chọn: ${selectedFile.name}`}
                            {studentProfileImageAppendModes[field.key] && hasExistingImage ? ' (thêm vào học bạ cũ)' : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="p-4 border-t bg-white flex flex-col sm:flex-row justify-end gap-2">
              <button type="button" onClick={() => setShowStudentProfileModal(false)} className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-700 font-black">Hủy</button>
              <button type="button" onClick={submitStudentProfileRequest} disabled={isSubmittingProfileRequest || activeStudentIsReadOnly} className="px-5 py-3 rounded-2xl bg-blue-600 text-white font-black shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">
                {activeStudentIsReadOnly ? 'Chỉ xem hồ sơ' : (isSubmittingProfileRequest ? 'Đang gửi...' : (activeStudentPendingProfileRequests.length > 0 ? 'Cập nhật yêu cầu chờ duyệt' : 'Gửi yêu cầu sửa'))}
              </button>
            </div>
              </div>
            </div>
  );
}
