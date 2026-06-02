import {
  CalendarDays,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Pencil,
  Save,
  Trash2
} from 'lucide-react';
import TeachingImportDateFields from './TeachingImportDateFields';

export default function ThdTeachingAssignmentsToolbar({
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
  return (
    <div className="relative z-[260] flex-none rounded-b-none rounded-t-none border-x border-b border-cyan-100 bg-white/95 px-2 py-1 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="min-w-28">
          <div className="text-[10px] font-semibold uppercase text-cyan-900">Phân công</div>
          <div className="text-base font-semibold leading-tight text-cyan-950">{selectedSchoolYear}</div>
        </div>
        {isThdTeachingPanel && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-indigo-100 bg-indigo-50/60 px-1.5 py-1">
            <input
              ref={teachingImportFileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              onChange={handleTeachingImportFile}
              className="hidden"
            />
            {!activeTeachingBatch && (
              <>
                <TeachingImportDateFields
                  key={`teaching-import-start-${selectedSchoolYear}-${teachingImportStartDate}`}
                  value={teachingImportStartDate}
                  onChange={setTeachingImportStartDate}
                  title="Ngày bắt đầu nhập file"
                  schoolYear={selectedSchoolYear}
                />
                <span className="text-xs font-semibold text-indigo-700">đến</span>
                <TeachingImportDateFields
                  key={`teaching-import-end-${selectedSchoolYear}-${teachingImportEndDate}`}
                  value={teachingImportEndDate}
                  onChange={setTeachingImportEndDate}
                  title="Ngày kết thúc nhập file"
                  schoolYear={selectedSchoolYear}
                />
              </>
            )}
            <button type="button" onClick={openTeachingImportFilePicker} disabled={!canUseTeachingImport} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-2.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40">
              <FileSpreadsheet className="h-4 w-4" /> Thêm dữ liệu
            </button>
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
            <button
              type="button"
              onClick={deleteSelectedTeachingBatch}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              <Trash2 className="h-4 w-4" /> Xóa đợt
            </button>
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
          {!isThdTeachingPanel && (
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
                    teachingFilter === 'all'
                      ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      : 'border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'
                  }`}
                >
                  <Filter className="h-4 w-4" /> Lọc: {teachingFilterLabel}
                </button>
                {showTeachingFilterMenu && (
                  <div className="absolute right-0 top-full z-[300] mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                    {teachingFilterOptions.map(option => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => {
                          setTeachingFilter(option.value);
                          setShowTeachingFilterMenu(false);
                        }}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${
                          teachingFilter === option.value
                            ? 'bg-violet-50 text-violet-800'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
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
