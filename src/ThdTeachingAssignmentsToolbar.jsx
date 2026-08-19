import {
  CalendarDays,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Pencil,
  Save,
  Trash2,
  X
} from 'lucide-react';
import TeachingImportDateFields from './TeachingImportDateFields';

export default function ThdTeachingAssignmentsToolbar({
  activeTeachingVersionId = "main",
  setActiveTeachingVersionId,
  teachingVersionsForSelectedYear = [],
  handleCreateNewTeachingVersion,
  activeTeachingBatch,
  canEditTeachingRows = false,
  canUseTeachingImport = false,
  clearTeachingAssignmentsForYear,
  deleteSelectedTeachingBatch,
  exportTeachingAssignments,
  getTeachingBatchLabel,
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
  showTeachingFinancialColumns = false,
  showTeachingMoneyColumns = true,
  teachingBatchesForSelectedYear = [],
  teachingFilter = 'all',
  teachingFilterLabel = 'Tất cả',
  teachingFilterOptions = [],
  teachingImportEndDate = '',
  teachingImportFileRef,
  teachingImportStartDate = '',
  teachingSummaryDirty = false,
  updateTeachingSummaryFromBatches,
}) {
  return (
    <div className="flex-none border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setSelectedTeachingBatchId('summary')}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all ${isTeachingSummaryView ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Tổng hợp
            </button>
            {hasTeachingBatches && (
              <select
                value={selectedTeachingBatchId === 'summary' ? 'summary' : selectedTeachingBatchId}
                onChange={(e) => setSelectedTeachingBatchId(e.target.value)}
                className={`h-7 rounded-md border-0 bg-transparent py-0 pl-3 pr-8 text-xs font-bold transition-all focus:ring-2 focus:ring-indigo-600 ${!isTeachingSummaryView ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <option value="summary" disabled>Chọn đợt...</option>
                {teachingBatchesForSelectedYear.map((batch, index) => (
                  <option key={batch.id} value={batch.id}>
                    {getTeachingBatchLabel(batch, index)}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => {
                const newBatchId = `batch_${Date.now()}`;
                setEditingTeachingBatchId(newBatchId);
              }}
              className="flex h-7 items-center justify-center rounded-md px-2 text-xs font-bold text-indigo-600 hover:bg-indigo-100"
              title="Thêm đợt phân công mới"
            >
              + Đợt mới
            </button>
          </div>

          {teachingVersionsForSelectedYear && teachingVersionsForSelectedYear.length > 0 && (
            <div className="flex items-center gap-1">
              <label className="flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800">
                <span>Bản:</span>
                <select
                  value={activeTeachingVersionId}
                  onChange={(e) => setActiveTeachingVersionId(e.target.value)}
                  className="h-6 rounded border-0 bg-transparent py-0 pl-1 pr-6 text-xs font-bold text-emerald-900 focus:ring-0"
                >
                  <option value="main">Chính thức</option>
                  {teachingVersionsForSelectedYear.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={handleCreateNewTeachingVersion}
                className="flex h-8 items-center rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                title="Lưu thành bản nháp mới"
              >
                + Bản nháp
              </button>
            </div>
          )}

          {isThdTeachingPanel && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-indigo-100 bg-indigo-50/60 px-1.5 py-1">
              <input
                ref={teachingImportFileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleTeachingImportFile}
              />
              {canUseTeachingImport && (
                <button
                  type="button"
                  onClick={openTeachingImportFilePicker}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-2.5 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 hover:text-indigo-800"
                >
                  <FileSpreadsheet className="h-4 w-4 text-indigo-500" /> Nhập Excel
                </button>
              )}
              {isEditingMainTeaching && (
                <TeachingImportDateFields
                  key={`teaching-import-start-${selectedSchoolYear}-${teachingImportStartDate}`}
                  value={teachingImportStartDate}
                  onChange={setTeachingImportStartDate}
                  title="Ngày bắt đầu nhập file"
                  schoolYear={selectedSchoolYear}
                />
              )}
              {isEditingActiveTeachingBatch && (
                <TeachingImportDateFields
                  key={`teaching-import-end-${selectedSchoolYear}-${activeTeachingBatch?.id}-${teachingImportEndDate}`}
                  value={teachingImportEndDate}
                  onChange={setTeachingImportEndDate}
                  title="Ngày kết thúc đợt"
                  schoolYear={selectedSchoolYear}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
              <FileText className="h-4 w-4" /> 
              Cập nhật Tổng hợp
              {teachingSummaryDirty && <span className="flex h-2 w-2 rounded-full bg-amber-500"></span>}
            </button>
          )}

          {!isTeachingSummaryView && (
            <>
              {isThdTeachingPanel && isEditingActiveTeachingBatch && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowNewTeachersModal(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-fuchsia-200 bg-fuchsia-50 px-2.5 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
                  >
                    GV mới: {newTeachersComparedToPreviousBatch.length}
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelectedTeachingBatch}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 className="h-4 w-4" /> Xóa đợt
                  </button>
                </>
              )}

              {isThdTeachingPanel && (
                <button
                  type="button"
                  onClick={() => setShowTeachingCheckModal(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                >
                  <ClipboardCheck className="h-4 w-4" /> Check PCGD
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTeachingExportMenu(prev => !prev)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-4 w-4 text-slate-500" /> Xuất Excel
                </button>
                {showTeachingExportMenu && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        exportTeachingAssignments('thd_pcgd');
                        setShowTeachingExportMenu(false);
                      }}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 text-slate-700"
                    >
                      Bảng PCGD
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        exportTeachingAssignments('thd_detail');
                        setShowTeachingExportMenu(false);
                      }}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50 text-slate-700"
                    >
                      Bảng theo GV (Chi tiết)
                    </button>
                  </div>
                )}
              </div>

              {showTeachingFinancialColumns && (
                <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={showTeachingMoneyColumns}
                    onChange={(e) => setShowTeachingMoneyColumns(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span>Cột TC</span>
                </label>
              )}

              <button
                type="button"
                onClick={openTeachingTimeSettings}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <CalendarDays className="h-4 w-4 text-slate-500" /> Cấu hình Cột
              </button>

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
                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
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
                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
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
            disabled={!hasChanges}
            className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${hasChanges ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
          >
            <Save className="w-4 h-4" /> Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
