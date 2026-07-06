import { useState } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Pencil,
  PlusCircle,
  Save,
  Trash2,
  X
} from 'lucide-react';
import TeachingImportDateFields from './TeachingImportDateFields';

export default function ThdTeachingAssignmentsToolbar({
  activeTeachingVersionId = "main",
  setActiveTeachingVersionId,
  teachingVersionsForSelectedYear = [],
  handleCreateEmptyTeachingVersion,
  handleDuplicateTeachingVersion,
  handleDeleteTeachingVersion,
  updateTeachingVersionName,
  defaultTeachingVersionId,
  onToggleDefaultVersion,
  handleCreateNewTeachingBatch,
  activeTeachingBatch,
  canEditTeachingRows = false,
  canUseTeachingImport = false,
  activeTeachingFilterMenuIndex,
  setActiveTeachingFilterMenuIndex,
  isSaving,
  clearTeachingAssignmentsForYear,
  deleteSelectedTeachingBatch,
  exportTeachingAssignments,
  getTeachingBatchLabel,
  handleImportFullPCSheet,
  handleTeachingImportFile,
  hasChanges = false,
  hasTeachingBatches = false,
  isEditingActiveTeachingBatch = false,
  isEditingMainTeaching = false,
  isEditingTeachingSummary = false,
  isTeachingSummaryView = false,
  isThdTeachingPanel = false,
  newTeachersComparedToPreviousBatch = [],
  openTeachingImportFilePicker,
  openTeachingTimeSettings,
  saveAll,
  selectedSchoolYear = '',
  selectedTeachingBatchId = '',
  setEditingTeachingBatchId,
  setSelectedTeachingBatchId,
  setShowNewTeachersModal,
  setShowTeachingCheckModal,
  setShowTeachingExportMenu,
  setShowTeachingFilterMenu,
  setShowTeachingMoneyColumns,
  setTeachingFilter,
  setTeachingImportEndDate,
  setTeachingImportStartDate,
  showTeachingExportMenu = false,
  showTeachingFilterMenu = false,
  showTeachingMoneyColumns = false,
  teachingBatchesForSelectedYear = [],
  teachingFilter = 'all',
  teachingFilterLabel = 'Tất cả',
  teachingFilterOptions = [],
  teachingImportEndDate = '',
  teachingImportFileRef,
  teachingImportStartDate = '',
  teachingSummaryDirty = false,
  updateTeachingSummaryFromBatches
}) {
  const [isEditingVersion, setIsEditingVersion] = useState(false);
  const [editingVersionName, setEditingVersionName] = useState('');
  const [isBatchImportModalOpen, setIsBatchImportModalOpen] = useState(false);

  const handleEditVersionClick = () => {
    const currentVersion = teachingVersionsForSelectedYear.find(v => v.id === activeTeachingVersionId);
    setEditingVersionName(currentVersion ? currentVersion.name : 'Bản hiện tại');
    setIsEditingVersion(true);
  };

  const handleSaveVersionName = () => {
    if (editingVersionName.trim()) {
      updateTeachingVersionName(activeTeachingVersionId, editingVersionName.trim());
    }
    setIsEditingVersion(false);
  };

  const handleVersionInputKeyDown = (e) => {
    if (e.key === 'Enter') handleSaveVersionName();
    if (e.key === 'Escape') setIsEditingVersion(false);
  };

  return (
    <div className="relative z-[260] flex-none rounded-b-none rounded-t-none border-x border-b border-cyan-100 bg-white/95 px-2 py-1 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="min-w-28">
          <div className="text-[10px] font-semibold uppercase text-cyan-900">Phân công</div>
          <div className="text-base font-semibold leading-tight text-cyan-950">{selectedSchoolYear}</div>
        </div>

        {teachingVersionsForSelectedYear && teachingVersionsForSelectedYear.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCreateEmptyTeachingVersion}
              className="flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              title="Tạo bản phân công trắng"
            >
              <PlusCircle className="h-4 w-4 text-emerald-500" /> Thêm mới
            </button>
            <label className="flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 pl-2 pr-1 text-xs font-semibold text-emerald-800">
              <span>Name:</span>
              <select
                value={activeTeachingVersionId}
                onChange={(e) => setActiveTeachingVersionId(e.target.value)}
                className="h-6 rounded border-0 bg-transparent py-0 pl-1 pr-6 text-xs font-bold text-emerald-900 focus:ring-0"
              >
                {teachingVersionsForSelectedYear.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              {updateTeachingVersionName && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleEditVersionClick}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-emerald-600 hover:bg-emerald-200"
                    title="Tùy chọn bản này"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {isEditingVersion && (
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={() => setIsEditingVersion(false)} />
                      <div className="absolute left-0 top-full mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl z-[70]">
                        <div className="mb-2 text-xs font-bold text-slate-700">Đổi tên bản</div>
                        <div className="flex gap-1.5 mb-3">
                          <input
                            type="text"
                            autoFocus
                            className="h-7 flex-1 rounded border border-slate-300 px-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            value={editingVersionName}
                            onChange={(e) => setEditingVersionName(e.target.value)}
                            onKeyDown={handleVersionInputKeyDown}
                          />
                          <button
                            type="button"
                            onClick={handleSaveVersionName}
                            className="rounded bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Lưu
                          </button>
                        </div>
                        <div className="mb-2 border-t border-slate-100 pt-2"></div>
                        <label className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-50 rounded">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            checked={defaultTeachingVersionId === activeTeachingVersionId}
                            onChange={() => {
                              onToggleDefaultVersion && onToggleDefaultVersion(activeTeachingVersionId);
                            }}
                          />
                          <span className="text-xs font-semibold text-slate-700">Đặt làm bản chính</span>
                        </label>
                        <div className="mb-2 border-t border-slate-100 pt-2"></div>
                        <button
                          type="button"
                          onClick={() => {
                            handleDuplicateTeachingVersion();
                            setIsEditingVersion(false);
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                          Tạo bản sao từ bản này
                        </button>
                        {activeTeachingVersionId !== 'main' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Bạn có chắc chắn muốn xóa bản này không?')) {
                                handleDeleteTeachingVersion(activeTeachingVersionId);
                                setIsEditingVersion(false);
                              }
                            }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Xóa bản này
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </label>
          </div>
        )}

        {isThdTeachingPanel && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-indigo-100 bg-indigo-50/60 px-1.5 py-1">
            <input
              ref={teachingImportFileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              onChange={(e) => {
                setIsBatchImportModalOpen(false);
                handleTeachingImportFile(e);
              }}
              className="hidden"
            />
            
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100">
              <FileSpreadsheet className="h-4 w-4" /> Nhập từ PC (TH)
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.txt"
                onChange={handleImportFullPCSheet}
                className="hidden"
                disabled={!canEditTeachingRows}
              />
            </label>

            {!activeTeachingBatch && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsBatchImportModalOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-2.5 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 hover:text-indigo-800"
                >
                  <CalendarPlus className="h-4 w-4 text-indigo-500" /> Nhập theo đợt
                </button>
                {isBatchImportModalOpen && (
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setIsBatchImportModalOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-xl z-[70] flex flex-col gap-3">
                      <div className="text-xs font-bold text-slate-700 mb-1">Thời gian áp dụng phân công</div>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-600 w-16">Từ ngày:</span>
                          <TeachingImportDateFields
                            key={`teaching-import-start-${selectedSchoolYear}-${teachingImportStartDate}`}
                            value={teachingImportStartDate}
                            onChange={setTeachingImportStartDate}
                            title="Ngày bắt đầu nhập file"
                            schoolYear={selectedSchoolYear}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-600 w-16">Đến ngày:</span>
                          <TeachingImportDateFields
                            key={`teaching-import-end-${selectedSchoolYear}-${teachingImportEndDate}`}
                            value={teachingImportEndDate}
                            onChange={setTeachingImportEndDate}
                            title="Ngày kết thúc nhập file"
                            schoolYear={selectedSchoolYear}
                          />
                        </div>
                      </div>
                      <div className="border-t border-slate-100 pt-3 mt-1">
                        <button
                          type="button"
                          onClick={openTeachingImportFilePicker}
                          disabled={!canUseTeachingImport}
                          className="flex w-full h-8 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <FileSpreadsheet className="h-4 w-4" /> Chọn file Excel tải lên
                        </button>
                        {!canUseTeachingImport && (
                          <div className="text-[10px] text-center text-rose-500 mt-1">Vui lòng nhập ngày bắt đầu và kết thúc</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {hasTeachingBatches && (
          <label className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700">
            <span>Xem</span>
            <select
              value={selectedTeachingBatchId}
              onChange={(event) => {
                setSelectedTeachingBatchId(event.target.value);
                setEditingTeachingBatchId('');
              }}
              className="h-6 min-w-56 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-cyan-400"
            >
              <option value="summary">Tổng hợp ({teachingBatchesForSelectedYear.length} đợt)</option>
              {teachingBatchesForSelectedYear.map((batch, index) => (
                <option key={batch.id} value={batch.id}>
                  {getTeachingBatchLabel(batch, index)}
                </option>
              ))}
            </select>
          </label>
        )}

        {isTeachingSummaryView && (
          <button
            type="button"
            onClick={updateTeachingSummaryFromBatches}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${
              teachingSummaryDirty
                ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                : 'border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100'
            }`}
          >
            <ClipboardCheck className="h-4 w-4" /> Cập nhật{teachingSummaryDirty ? ' *' : ''}
          </button>
        )}
        {isTeachingSummaryView && (
          <button
            type="button"
            onClick={() => setEditingTeachingBatchId(isEditingTeachingSummary ? '' : 'summary')}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${
              isEditingTeachingSummary
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Pencil className="h-4 w-4" /> Chỉnh sửa
          </button>
        )}
        {activeTeachingBatch && (
          <>
            <button
              type="button"
              onClick={() => setEditingTeachingBatchId(isEditingActiveTeachingBatch ? '' : activeTeachingBatch.id)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${
                isEditingActiveTeachingBatch
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Pencil className="h-4 w-4" /> {isEditingActiveTeachingBatch ? 'Đang chỉnh sửa' : 'Chỉnh sửa'}
            </button>
            <button
              type="button"
              onClick={() => setShowNewTeachersModal(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              GV mới: {newTeachersComparedToPreviousBatch.length}
            </button>
            {isEditingActiveTeachingBatch && (
            <button
              type="button"
              onClick={deleteSelectedTeachingBatch}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              <Trash2 className="h-4 w-4" /> Xóa đợt
            </button>
            )}
          </>
        )}
        <div className="ml-auto flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={openTeachingTimeSettings}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
          >
            <CalendarDays className="h-4 w-4" /> Cài đặt
          </button>
          <button
            type="button"
            onClick={() => setShowTeachingCheckModal(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            <ClipboardCheck className="h-4 w-4" /> Kiểm tra
          </button>
          {(!isThdTeachingPanel || !hasTeachingBatches) && (
            <button
              type="button"
              onClick={() => setEditingTeachingBatchId(isEditingMainTeaching ? '' : 'main')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${
                isEditingMainTeaching
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Pencil className="h-4 w-4" /> {isEditingMainTeaching ? 'Đang chỉnh sửa' : 'Chỉnh sửa'}
            </button>
          )}
          {!isThdTeachingPanel && (
            <button
              type="button"
              onClick={() => setShowTeachingMoneyColumns(prev => !prev)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {showTeachingMoneyColumns ? 'Ẩn tiền' : 'Hiện tiền'}
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTeachingExportMenu(prev => !prev)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-200 bg-white px-2.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-50"
            >
              <Download className="h-4 w-4" /> Xuất file
            </button>
            {showTeachingExportMenu && (
              <div className="absolute right-0 top-full z-[300] mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => exportTeachingAssignments('excel')}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Excel
                </button>
                <button
                  type="button"
                  onClick={() => exportTeachingAssignments('pdf')}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                >
                  <FileText className="h-4 w-4" /> PDF
                </button>
              </div>
            )}
          </div>
          {isThdTeachingPanel && (
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTeachingFilterMenu(prev => !prev)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold ${
                    (!teachingFilter || teachingFilter.length === 0 || teachingFilter.includes('all'))
                      ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      : 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'
                  }`}
                >
                  <Filter className="h-4 w-4" /> Lọc: {teachingFilterLabel}
                </button>
                {showTeachingFilterMenu && (
                  <>
                    <div className="fixed inset-0 z-[200]" onClick={() => setShowTeachingFilterMenu(false)}></div>
                    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[300] w-[1000px] max-w-[95vw] rounded-xl border border-slate-200 bg-white p-6 shadow-2xl overflow-y-auto max-h-[80vh]">
                      <button
                        type="button"
                        onClick={() => setShowTeachingFilterMenu(false)}
                        className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>

                      <div className="flex">
                        <div className="w-1/4 flex flex-col gap-8 border-r border-slate-100 pr-6">
                          <div className="space-y-2">
                            <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4 border-b pb-2">Tình trạng</div>
                            {teachingFilterOptions.filter(o => o.value === 'all' || (!o.value.startsWith('team-') && !o.value.startsWith('dynamic-subject-'))).map(option => (
                              <label key={option.value} className="flex items-center gap-2 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={Array.isArray(teachingFilter) && (teachingFilter.includes(option.value) || (option.value === 'all' && (!teachingFilter || !teachingFilter.length)))}
                                  onChange={(e) => {
                                    if (option.value === 'all') {
                                      setTeachingFilter([]);
                                    } else {
                                      setTeachingFilter(prev => {
                                        const next = Array.isArray(prev) ? [...prev].filter(v => v !== 'all') : [];
                                        if (e.target.checked) next.push(option.value);
                                        else next.splice(next.indexOf(option.value), 1);
                                        return next;
                                      });
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                />
                                <span className={`text-sm font-semibold group-hover:text-violet-700 ${option.value === 'check-error' ? 'text-rose-600' : 'text-slate-700'}`}>{option.label}</span>
                              </label>
                            ))}
                          </div>
                          <div className="space-y-2">
                            <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4 border-b pb-2">Tổ chuyên môn</div>
                            {teachingFilterOptions.filter(o => o.value.startsWith('team-')).map(option => (
                              <label key={option.value} className="flex items-center gap-2 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={Array.isArray(teachingFilter) && teachingFilter.includes(option.value)}
                                  onChange={(e) => {
                                    setTeachingFilter(prev => {
                                      const next = Array.isArray(prev) ? [...prev].filter(v => v !== 'all') : [];
                                      if (e.target.checked) next.push(option.value);
                                      else next.splice(next.indexOf(option.value), 1);
                                      return next;
                                    });
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                />
                                <span className="text-sm font-semibold text-slate-700 group-hover:text-violet-700">{option.label.replace('Tổ ', '')}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="flex-1 border-l border-slate-100 pl-6 space-y-6">
                          {(() => {
                            const allDynamicSubjects = teachingFilterOptions.filter(o => o.value.startsWith('dynamic-subject-'));
                            const coreSubjects = allDynamicSubjects.filter(o => o.priority !== undefined && o.priority < 1000);
                            const otherDuties = allDynamicSubjects.filter(o => o.priority === undefined || o.priority >= 1000);

                            return (
                              <>
                                {coreSubjects.length > 0 && (
                                  <div>
                                    <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4 border-b pb-2">Môn học ({coreSubjects.length})</div>
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
                                      {coreSubjects.map(option => (
                                        <label key={option.value} className="flex items-center gap-2 cursor-pointer group">
                                          <input
                                            type="checkbox"
                                            checked={Array.isArray(teachingFilter) && teachingFilter.includes(option.value)}
                                            onChange={(e) => {
                                              setTeachingFilter(prev => {
                                                const next = Array.isArray(prev) ? [...prev].filter(v => v !== 'all') : [];
                                                if (e.target.checked) next.push(option.value);
                                                else next.splice(next.indexOf(option.value), 1);
                                                return next;
                                              });
                                            }}
                                            className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                          />
                                          <span className="text-sm font-semibold text-slate-700 group-hover:text-violet-700">{option.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {otherDuties.length > 0 && (
                                  <div className="mt-8">
                                    <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4 border-b pb-2">Chuyên môn / Hỗ trợ ({otherDuties.length})</div>
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
                                      {otherDuties.map(option => (
                                        <label key={option.value} className="flex items-center gap-2 cursor-pointer group">
                                          <input
                                            type="checkbox"
                                            checked={Array.isArray(teachingFilter) && teachingFilter.includes(option.value)}
                                            onChange={(e) => {
                                              setTeachingFilter(prev => {
                                                const next = Array.isArray(prev) ? [...prev].filter(v => v !== 'all') : [];
                                                if (e.target.checked) next.push(option.value);
                                                else next.splice(next.indexOf(option.value), 1);
                                                return next;
                                              });
                                            }}
                                            className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                          />
                                          <span className="text-sm font-semibold text-slate-700 group-hover:text-violet-700">{option.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button type="button" onClick={clearTeachingAssignmentsForYear} disabled={!canEditTeachingRows} className="h-8 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40">
                Xóa bảng
              </button>
            </>
          )}
          <button
            type="button"
            onClick={saveAll}
            disabled={!hasChanges || isSaving}
            className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${
              isSaving
                ? 'bg-emerald-600 text-white shadow opacity-80 cursor-wait'
                : hasChanges
                  ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <svg className="animate-spin -ml-0.5 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isSaving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}
