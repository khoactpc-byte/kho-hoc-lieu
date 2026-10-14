import { Clock, X, Image as ImageIcon } from 'lucide-react';
import StudentProfileSections from './StudentProfileSections';
import StudentProfileHistory from './StudentProfileHistory';
import { buildStudentProfileHistory } from '../utils/studentProfileHistory';
import { STUDENT_PROFILE_SECTIONS, studentProfileSection } from '../utils/studentProfileLayout';
import { PROFILE_REQUEST_PENDING_MESSAGE } from '../utils/profileRequestPolicy';
import { buildStudentProfileProvinceOptions, STUDENT_PROFILE_PROVINCE_FIELDS } from '../utils/studentProfileProvinces';

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
    derivedProvinceOptions = [],
    studentProfileProvinceOptions,
    studentProfileProvinceDirectoryStatus = 'ready',
    retryStudentProfileProvinceDirectory,
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
    studentHistoryRecords = [],
    studentAttendance = [],
    submitStudentProfileRequest
  } = view;
  const hasPendingRequest = activeStudentPendingProfileRequests.length > 0;
  const editingBlocked = activeStudentIsReadOnly || hasPendingRequest;
  const provinceOptions = studentProfileProvinceOptions || buildStudentProfileProvinceOptions({ provinces: derivedProvinceOptions, birthProvinces: derivedProvinceOptions });
  const renderProfileField = field => {
    const isFieldPending = activeStudentPendingProfileFieldKeys.has(field.key);
    const isProvince = Object.hasOwn(STUDENT_PROFILE_PROVINCE_FIELDS, field.key);
    const choices = provinceOptions[field.key] || [];
    const provinceValue = String(studentProfileDraft[field.key] || '');
    const listId = field.key === 'ward'
        ? 'student-profile-current-ward-options'
        : field.key === 'householdWard'
          ? 'student-profile-household-ward-options'
          : undefined;
    const placeholder = field.key === 'birthDate'
      ? 'dd/mm/yyyy'
      : field.key === 'identityCode'
        ? '12 số hoặc học sinh chưa có'
        : (field.key === 'ward' || field.key === 'householdWard')
          ? 'Chọn tỉnh trước, rồi gõ/chọn phường xã'
          : '';
    return (
      <label key={field.key} className="flex flex-col gap-1">
        <span className="flex items-center gap-1 text-[10px] font-normal text-slate-400">
          {field.label}
          {isFieldPending && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] text-amber-700">Chờ duyệt</span>}
        </span>
        {isProvince ? (
          <select
            value={provinceValue}
            disabled={editingBlocked || !choices.length}
            onChange={event => handleStudentProfileFieldChange(field.key, event.target.value)}
            className={`rounded-2xl border px-3 py-3 text-sm font-normal text-slate-800 focus:outline-none focus:border-blue-400 ${isFieldPending ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}
          >
            <option value="">{choices.length ? 'Chọn tỉnh / thành phố' : studentProfileProvinceDirectoryStatus === 'error' ? 'Chưa tải được danh mục' : 'Đang tải danh mục…'}</option>
            {provinceValue && !choices.some(option => option.value === provinceValue) && (
              <option value={provinceValue} disabled>Hiện tại: {provinceValue}</option>
            )}
            {choices.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : field.type === 'select' ? (
          <select
            value={studentProfileDraft[field.key] || ''}
            disabled={editingBlocked}
            onChange={(event) => handleStudentProfileFieldChange(field.key, event.target.value)}
            className={`rounded-2xl border px-3 py-3 text-sm font-normal text-slate-800 focus:outline-none focus:border-blue-400 ${isFieldPending ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}
          >
            <option value="">Chọn</option>
            {(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : (
          <input
            value={studentProfileDraft[field.key] || ''}
            list={listId}
            placeholder={placeholder}
            readOnly={editingBlocked}
            disabled={editingBlocked}
            onChange={(event) => handleStudentProfileFieldChange(field.key, event.target.value)}
            className={`rounded-2xl border px-3 py-3 text-sm font-normal text-slate-800 focus:outline-none focus:border-blue-400 ${isFieldPending ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}
          />
        )}
      </label>
    );
  };
  return (
<div role="dialog" aria-modal="true" aria-labelledby="student-profile-title" className="fixed inset-0 z-[115] bg-slate-900/60 backdrop-blur-sm p-2 sm:p-3 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-2xl w-full min-w-0 min-h-0 max-w-[1280px] max-h-[min(94dvh,100%)] overflow-hidden flex flex-col font-normal">
            <div className="shrink-0 px-3 py-2 border-b bg-slate-50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id="student-profile-title" className="font-normal text-slate-900 truncate">Hồ sơ học sinh</h3>
                  {activeStudentPendingProfileRequests.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[10px] font-normal text-amber-800">
                      <Clock className="w-3.5 h-3.5" /> Chờ duyệt
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-normal">Em gửi yêu cầu sửa, admin duyệt xong mới cập nhật hồ sơ chính.</p>
              </div>
              <button type="button" onClick={() => setShowStudentProfileModal(false)} aria-label="Đóng hồ sơ" className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {(activeStudentPendingProfileRequests.length > 0 || activeStudentIsReadOnly) && (
            <div className="shrink-0 space-y-1.5 px-3 py-2 text-xs">
              {activeStudentPendingProfileRequests.length > 0 && (
                <details className="rounded border border-amber-100 bg-amber-50 px-3 py-1.5 text-xs font-normal text-amber-800">
                  <summary className="cursor-pointer">{PROFILE_REQUEST_PENDING_MESSAGE}</summary>
                  <p className="mt-1">{activeStudentPendingProfileFieldLabels.join(', ')}</p>
                </details>
              )}
              {activeStudentIsReadOnly && (
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-normal text-slate-600">
                  {activeStudentReadOnlyReason}
                </div>
              )}
            </div>
            )}
              {studentProfileProvinceDirectoryStatus === 'loading' && <p role="status" className="shrink-0 px-3 py-2 text-xs text-slate-500">Đang tải danh mục tỉnh/thành phố…</p>}
              {studentProfileProvinceDirectoryStatus === 'error' && (
                <div role="alert" className="shrink-0 px-3 py-2 text-xs text-amber-800">
                  Chưa tải được danh mục tỉnh/thành phố. {retryStudentProfileProvinceDirectory && <button type="button" onClick={retryStudentProfileProvinceDirectory} className="text-blue-700 underline">Tải lại danh mục</button>}
                </div>
              )}
              <datalist id="student-profile-current-ward-options">
                {currentWardOptions.map(item => <option key={item} value={item} />)}
              </datalist>
              <datalist id="student-profile-household-ward-options">
                {householdWardOptions.map(item => <option key={item} value={item} />)}
              </datalist>

            <StudentProfileSections sections={[
              ...STUDENT_PROFILE_SECTIONS.filter(section => ['identity', 'learning'].includes(section.key) || studentProfileEditableFields.some(field => studentProfileSection(field.key) === section.key)).map(section => ({
                ...section,
                content: <div className="space-y-3">
                  {section.key === 'identity' && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-2">
                {[
                  ['Mã học sinh', activeStudentProfile.accessCode || ''],
                  ['Lớp', activeStudentProfile.className || ''],
                  ['Năm học', activeStudentProfile.schoolYear || currentSchoolYear],
                  ['Tình trạng', activeStudentProfile.status === 'dropped' ? 'Bỏ học' : 'Đang học']
                ].map(([label, value]) => (
                  <label key={label} className="flex flex-col gap-1">
                    <span className="text-[10px] font-normal text-slate-400">{label}</span>
                    <input value={value} readOnly className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-normal text-slate-500" />
                  </label>
                ))}
              </div>
                  )}
                  {section.key === 'learning' && (<>
              {studentProfileEditableFields.some(field => field.type === 'select') && (
                <div className="rounded border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-normal text-blue-800">
                  Học lực, hạnh kiểm lớp cũ chỉ chọn 3 mức: Tốt, Khá, Đạt. Các cách ghi cũ như Giỏi, Trung bình, Yếu, Chưa đạt sẽ tự quy đổi về 3 mức này.
                </div>
              )}

                  </>)}
                  <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                    {studentProfileEditableFields.filter(field => studentProfileSection(field.key) === section.key).map(renderProfileField)}
                  </div>
                  {section.key === 'identity' && (
                    <section aria-label="Quá trình học" className="border-t border-slate-200 pt-3">
                      <StudentProfileHistory rows={buildStudentProfileHistory({ student: activeStudentProfile, records: studentHistoryRecords, currentSchoolYear, attendance: studentAttendance })} />
                    </section>
                  )}
                  {section.key === 'learning' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-normal tracking-widest text-slate-600">
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
                        <div className="mb-2 flex items-center gap-1 text-[10px] font-normal text-slate-500">
                          {field.label}
                          {isFieldPending && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] text-amber-700">Chờ duyệt</span>}
                        </div>
                        {isTranscript ? (
                          <div className="aspect-[4/3] rounded-xl overflow-x-auto overflow-y-hidden border border-slate-100 bg-slate-50 flex snap-x snap-mandatory scroll-smooth">
                            {transcriptPages.length ? (
                              transcriptPages.map((page, pageIndex) => (
                                <div key={page.key} className="relative min-w-full h-full snap-center flex items-center justify-center bg-slate-100">
                                  <img src={page.imageUrl} alt={`${field.label} trang ${pageIndex + 1}`} className="w-full h-full object-contain" />
                                  <div className="absolute left-2 top-2 rounded-full bg-slate-900/70 px-2 py-1 text-[10px] font-normal text-white">
                                    {pageIndex + 1}/{transcriptPages.length}
                                  </div>
                                  {page.openUrl && (
                                    <a href={page.openUrl} target="_blank" rel="noreferrer" className="absolute bottom-2 right-2 rounded-full bg-white/95 px-2.5 py-1.5 text-[10px] font-normal text-slate-700 shadow-sm">
                                      Mở
                                    </a>
                                  )}
                                  {!editingBlocked && (
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
                              <div className="min-w-full h-full flex items-center justify-center text-center px-3 text-[11px] font-normal text-slate-400">
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
                              <div className="text-center px-3 text-[11px] font-normal text-slate-400">
                                Chưa có ảnh
                              </div>
                            )}
                          </div>
                        )}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <label className={`flex-1 cursor-pointer rounded-xl px-3 py-2 text-center text-[10px] font-normal text-white shadow-sm ${isFieldPending ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                            {selectedFile || hasExistingImage ? 'Đổi ảnh' : 'Chọn ảnh'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              multiple={canAddMoreImages}
                              disabled={editingBlocked}
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
                            <label className={`cursor-pointer rounded-xl border px-3 py-2 text-[10px] font-normal ${isFieldPending ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                              Thêm trang
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                multiple
                                disabled={editingBlocked}
                                onChange={(event) => { applyStudentProfileImageFiles(field.key, event.target.files, true); event.target.value = null; }}
                                className="hidden"
                              />
                            </label>
                          )}
                          {!isTranscript && originalUrls.length === 1 && (
                            <a href={originalUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-normal text-slate-600 hover:text-blue-600">
                              Mở
                            </a>
                          )}
                        </div>
                        {selectedFile && (
                          <div className="mt-2 truncate text-[10px] font-normal text-emerald-700">
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

                  )}
                </div>
              }))
            ]} />
            <div className="shrink-0 px-3 py-2 border-t bg-slate-50 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setShowStudentProfileModal(false)} className="h-8 px-4 rounded border border-slate-200 bg-white text-sm text-slate-700 font-normal">Hủy</button>
              <button type="button" onClick={submitStudentProfileRequest} disabled={isSubmittingProfileRequest || editingBlocked} className="min-h-8 px-4 py-1 rounded bg-blue-600 text-sm text-white font-normal shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">
                {activeStudentIsReadOnly ? 'Chỉ xem hồ sơ' : (hasPendingRequest ? 'Đang chờ duyệt' : (isSubmittingProfileRequest ? 'Đang gửi...' : 'Gửi yêu cầu sửa'))}
              </button>
            </div>
              </div>
            </div>
  );
}
