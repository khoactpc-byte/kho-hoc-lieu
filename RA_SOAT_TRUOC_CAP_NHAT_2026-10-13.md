# Rà soát trước khi cập nhật web — 13/10/2026

Phạm vi: rà soát mã đang có trên máy và chạy bộ kiểm tra toàn dự án, ưu tiên các luồng bỏ học, đồng bộ Sheet, xét nâng lớp, tốt nghiệp và kết quả học tập. Không đăng nhập để sửa Sheet thật, không ghi dữ liệu Firebase thật, không đẩy Git hoặc triển khai hosting/Apps Script.

## Các lỗi đã sửa

- **Tốt nghiệp:** đồng bộ hồ sơ giữ chữ `TNTHCS` và năm tốt nghiệp; khối hiện tại để trống. Trước đây việc gộp ô trống có thể giữ lại lớp hoặc khối 9 cũ.
- **Bỏ học:** thao tác lưu dữ liệu luôn xóa lớp/khối hiện tại và lớp của năm hồ sơ; giữ khối nhập học, năm bỏ học và lớp trước đó để admin đưa học lại. Lượt đồng bộ thông thường không thể tự đổi hồ sơ bỏ học thành đang học.
- **Nâng lớp:** bản xem trước loại học sinh được đánh dấu bỏ học trên Sheet dù web chưa nhập thay đổi đó. Giao dịch Firebase kiểm tra lại trạng thái. Script kiểm tra toàn bộ nhóm trước khi ghi Sheet; có hồ sơ bỏ học thì dừng nhóm.
- **Nhập Sheet lên web:** sửa cả dữ liệu cũ còn lớp/khối trong database dù màn hình đã ẩn chúng. Lặp lại đồng bộ trên hồ sơ bỏ học đã đúng không tạo thêm công việc ghi thừa. Hồ sơ bỏ học từ năm trước vẫn được trả về khi đồng bộ năm sau để sửa hồ sơ web còn trạng thái đang học.
- **Hạnh kiểm:** khi đủ điểm cả năm và dữ liệu điểm danh của năm tương ứng đã tải xong, không có bản ghi vắng được tính là 0 ngày vắng. Không tự tính hạnh kiểm cho năm chưa tải điểm danh.
- **Kiểm thử:** cập nhật các bản giả lập Firestore theo API đọc mới; bổ sung kiểm tra trực tiếp Apps Script, giữ nguyên lịch sử lớp, đồng bộ lặp, chống tự mở lại bỏ học và chặn toàn bộ nhóm nâng lớp trước khi ghi.

## File thay đổi

Mã ứng dụng:

- `src/components/HocSinhManager.jsx`
- `src/services/studentMutations.js`
- `src/services/studentTransitions.js`
- `src/utils/studentAcademicResults.js`

Apps Script giữ riêng trong máy, không nằm trong lần đẩy Git:

- `apps-script/dang-ky-hoc-sinh/code_dangky.gs`

Kiểm thử:

- `test/appsScriptHardening.test.js`
- `test/profileRequestBatch.integration.test.js`
- `test/registrationReview.integration.test.js`
- `test/registrationStudentSync.test.js` (mới)
- `test/schoolYearPromotion.integration.test.js`
- `test/studentAcademicResults.integration.test.js`
- `test/studentDatabaseCompact.integration.test.js`
- `test/studentMutations.integration.test.js`
- `test/studentSheetImport.integration.test.js`

Tài liệu:

- `HUONG_DAN_CAP_NHAT_APPS_SCRIPT.md`
- `RA_SOAT_TRUOC_CAP_NHAT_2026-10-13.md`

## Áp dụng bản cập nhật

Kết quả kiểm tra cuối bằng `npm run check`: **241 test đạt, 0 lỗi, 2 test bỏ qua** vì chưa bật Firestore Emulator. Lint, kiểm tra cú pháp cả hai Apps Script/biểu mẫu và build production đều đạt. `git diff --check` đạt. Build còn cảnh báo kích thước một số gói JavaScript vượt 500 kB; đây là cảnh báo dung lượng, không làm build thất bại. Chưa nghiệm thu trên dữ liệu thật hoặc bản Web App đã triển khai.

1. Trong dự án Apps Script **Đăng ký học sinh**, thay `Code.gs` bằng `apps-script/dang-ky-hoc-sinh/code_dangky.gs` trong máy.
2. Chọn **Deploy → Manage deployments → Edit → New version → Deploy**, giữ URL hiện tại. Kiểm tra `/exec?action=version` trả về `2026-10-13-student-sync-v9`.
3. Cập nhật website bằng quy trình Git/hosting hiện có. Các thay đổi lượt này không yêu cầu đổi cấu hình Firebase hoặc biến môi trường.
4. Sau khi đăng nhập Admin, kiểm tra danh sách và bảng xem trước trước khi thực hiện các thao tác đồng bộ. Học sinh bỏ học phải vẫn là bỏ học và không được đề xuất nâng lớp; học sinh tốt nghiệp phải là `TNTHCS`.

Chỉ cập nhật website sẽ không cập nhật Apps Script. Nếu chưa triển khai các thay đổi của máy chủ chính/Index.html ở những lượt trước, thực hiện thêm theo `HUONG_DAN_CAP_NHAT_APPS_SCRIPT.md`.
