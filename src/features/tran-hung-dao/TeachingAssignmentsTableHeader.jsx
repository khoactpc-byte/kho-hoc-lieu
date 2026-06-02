export default function TeachingAssignmentsTableHeader({
  isThdTeachingPanel = false,
  showTeachingFinancialColumns = false,
  showTeachingSchoolColumns = false
}) {
  const columnCount = 12
    + (isThdTeachingPanel ? 1 : 0)
    + (!isThdTeachingPanel ? 1 : 0)
    + (showTeachingFinancialColumns ? 2 : 0)
    + (showTeachingSchoolColumns ? 2 : 0)
    + 1;

  return (
    <thead>
      <tr className="bg-slate-100 text-left text-[11px] font-black uppercase text-slate-600">
        <th className="w-10 border border-slate-200 px-1 py-1 text-center">STT</th>
        <th className="w-52 border border-slate-200 px-1 py-1">Họ và tên</th>
        <th className="w-20 border border-slate-200 px-1 py-1 text-center">Chức vụ</th>
        <th className={`${isThdTeachingPanel ? 'w-28' : 'w-40'} border border-slate-200 px-1 py-1`}>Chuyên môn</th>
        <th className={`${isThdTeachingPanel ? 'w-40' : 'w-28'} border border-slate-200 px-1 py-1`}>Phân công</th>
        <th className="w-14 border border-slate-200 px-1 py-1 text-center">Số tuần</th>
        <th className={`${isThdTeachingPanel ? 'w-56' : 'w-28'} border border-slate-200 px-1 py-1 text-center`}>{isThdTeachingPanel ? 'Lớp' : 'Lớp PC'}</th>
        <th className="w-10 border border-slate-200 px-1 py-1 text-center">Số lớp</th>
        <th className="w-12 min-w-[3.25rem] max-w-[3.25rem] border border-slate-200 px-0.5 py-1 text-center leading-tight">
          Tiết/lớp<br />tuần
        </th>
        <th className="w-12 border border-slate-200 px-1 py-1 text-center">Tiết/tuần</th>
        <th className="w-12 border border-slate-200 px-1 py-1 text-center">Tổng tiết</th>
        <th className={`${isThdTeachingPanel ? 'w-[36rem]' : 'w-96'} border border-slate-200 px-1 py-1`}>Ghi chú</th>
        {isThdTeachingPanel && <th className="w-40 border border-slate-200 px-1 py-1">Kiểm tra</th>}
        {!isThdTeachingPanel && (
          <th className="w-16 border border-slate-200 px-1 py-1 text-center">Ký HB</th>
        )}
        {showTeachingFinancialColumns && (
          <>
            <th className="w-24 border border-slate-200 px-1 py-1 text-center">Số tiền 1 tiết</th>
            <th className="w-24 border border-slate-200 px-1 py-1 text-center">Số tiền</th>
          </>
        )}
        {showTeachingSchoolColumns && (
          <>
            <th className="w-16 border border-slate-200 px-1 py-1 text-center">Tiết ở trường</th>
            <th className="w-16 border border-slate-200 px-1 py-1 text-center">Tổng cộng</th>
          </>
        )}
        <th className="w-28 border border-slate-200 px-1 py-1 text-center">Dòng</th>
      </tr>
      <tr className="bg-slate-50 text-center text-[10px] font-semibold text-slate-400">
        {Array.from({ length: columnCount }, (_, columnIndex) => (
          <th key={`teaching-column-number-${columnIndex}`} className="border border-slate-200 px-1 py-0.5">
            {columnIndex + 1}
          </th>
        ))}
      </tr>
    </thead>
  );
}
