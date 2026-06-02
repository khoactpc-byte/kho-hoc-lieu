export function TeachingAssignmentsEmptyRow() {
  return (
    <tr>
      <td colSpan={24} className="border border-slate-200 px-3 py-6 text-center text-sm font-semibold text-slate-500">
        Không có giáo viên phù hợp với bộ lọc này.
      </td>
    </tr>
  );
}

export function TeachingAssignmentsLoadMoreRow({
  renderedCount = 0,
  visibleCount = 0,
  onLoadMore
}) {
  return (
    <tr>
      <td colSpan={24} className="border border-slate-200 px-3 py-3 text-center text-xs font-semibold text-slate-500">
        <button
          type="button"
          onClick={onLoadMore}
          className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 font-black text-sky-700 hover:bg-sky-100"
        >
          Tải thêm dòng {renderedCount}/{visibleCount}
        </button>
      </td>
    </tr>
  );
}
