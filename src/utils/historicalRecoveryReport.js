const text = value => String(value ?? '');
const escapeHtml = value => text(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const statusLabel = row => ({ ready: 'Đủ căn cứ, chưa bổ sung', blocked: 'Cần đối chiếu', save_failed: 'Chưa lưu được trên Web', sync_failed: 'Đã lưu trên Web; đồng bộ chưa hoàn tất' }[row.status] || 'Cần kiểm tra');

export function historicalRecoveryReportHtml(rows, schoolYear) {
  const count = rows.filter(row => row.status !== 'ready').length;
  return `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Báo cáo đối chiếu hồ sơ ${escapeHtml(schoolYear)}</title>
<style>body{max-width:850px;margin:24px auto;padding:0 16px;font:16px/1.6 Arial,sans-serif;color:#172033}h1{font-size:23px}h2{font-size:18px;margin:0 0 8px}article{border:1px solid #cbd5e1;border-radius:8px;padding:14px;margin:14px 0;break-inside:avoid}p{margin:6px 0}ul{padding-left:22px}.muted{color:#475569}@media print{body{margin:0;max-width:none}article{border-radius:0}}</style>
<h1>Báo cáo đối chiếu hồ sơ năm ${escapeHtml(schoolYear)}</h1>
<p>${rows.length} học sinh trong báo cáo; ${count} trường hợp cần xử lý.</p>
<p class="muted">“Cần đối chiếu” là thiếu căn cứ bổ sung hồ sơ năm cũ, chưa phải kết luận lưu ban/học vượt hay lỗi đồng bộ. Hồ sơ năm cũ được lưu riêng trên Web.</p>
${rows.map((row, index) => `<article><h2>${index + 1}. ${escapeHtml(row.source.fullName)} · ${escapeHtml(row.source.accessCode || 'Chưa có mã')}</h2>
<p><strong>Tình trạng:</strong> ${escapeHtml(statusLabel(row))}</p>
<p>Hồ sơ nguồn: ${escapeHtml(row.source.schoolYear || 'Chưa rõ năm')} · lớp ${escapeHtml(row.source.className || row.source.dropoutPreviousClassName || 'Chưa có')} · nhập học ${escapeHtml(row.source.enrollmentYear || 'Chưa có')} · khối nhập học ${escapeHtml(row.source.entryGrade || row.source.enrollmentGrade || row.source.admissionGrade || 'Chưa có')}.</p>
${row.className ? `<p>Lớp đề xuất ${escapeHtml(schoolYear)}: ${escapeHtml(row.className)}.</p>` : ''}
<p><strong>Lý do:</strong> ${escapeHtml(row.reason || row.basis)}</p>
${row.details?.length ? `<ul>${row.details.map(detail => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>` : ''}
<p><strong>Hướng xử lý:</strong> ${escapeHtml(row.nextStep || 'Kiểm tra lớp đề xuất trước khi lưu hồ sơ.')}</p></article>`).join('\n')}
</html>`;
}

export function downloadHistoricalRecoveryReport(rows, schoolYear) {
  const url = URL.createObjectURL(new Blob([historicalRecoveryReportHtml(rows, schoolYear)], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `bao-cao-ho-so-nam-cu-${schoolYear}.html`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
