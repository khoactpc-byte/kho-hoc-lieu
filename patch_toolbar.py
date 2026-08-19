import re

with open('src/features/tran-hung-dao/ThdTeachingAssignmentsToolbar.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add props
content = content.replace(
    '  activeTeachingBatch,',
    '  activeTeachingVersionId = "main",\n  setActiveTeachingVersionId,\n  teachingVersionsForSelectedYear = [],\n  handleCreateNewTeachingVersion,\n  activeTeachingBatch,'
)

# Replace the "hasTeachingBatches" label block to include the Version selector
new_block = """        {teachingVersionsForSelectedYear && teachingVersionsForSelectedYear.length > 0 && (
          <div className="flex items-center gap-1">
            <label className="flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800">
              <span>Bản:</span>
              <select
                value={activeTeachingVersionId}
                onChange={(e) => setActiveTeachingVersionId(e.target.value)}
                className="h-6 min-w-40 max-w-64 rounded-md border border-emerald-200 bg-white px-2 text-xs font-semibold text-emerald-900 outline-none focus:border-emerald-400"
              >
                {teachingVersionsForSelectedYear.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleCreateNewTeachingVersion}
              disabled={!canEditTeachingRows}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
              title="Tạo bản phân công mới trống"
            >
              <FileSpreadsheet className="h-4 w-4" /> Bản mới
            </button>
          </div>
        )}
        {hasTeachingBatches && ("""

content = content.replace(
    '        {hasTeachingBatches && (',
    new_block
)

with open('src/features/tran-hung-dao/ThdTeachingAssignmentsToolbar.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched ThdTeachingAssignmentsToolbar")
