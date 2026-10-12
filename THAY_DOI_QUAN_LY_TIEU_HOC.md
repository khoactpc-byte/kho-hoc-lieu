# Tách Quản lý Tiểu học — 11/10/2026

Trong bộ chọn quản lý, chọn **Quản lý giáo dục Tiểu học** để thao tác với khối 1–5. **Quản lý giáo dục THCS** dùng khối 6–9. Phân cấp theo lớp hiện tại của hồ sơ trong năm đang xem, không theo khối lúc nhập học. Khi chuyển cấp sau lớp 5, hồ sơ năm mới thuộc THCS; hồ sơ các năm tiểu học vẫn được giữ.

Các mục đã nối vào phạm vi Tiểu học: danh sách học sinh, đăng ký mới và duyệt hàng loạt, yêu cầu sửa hồ sơ, quá trình học, tuyển sinh, lớp học, giáo viên và phân công theo lớp, điểm danh, thời khóa biểu, kiểm tra học tập, kho bài và SGK, sổ điểm và học bạ. Số hồ sơ chờ duyệt cũng đếm theo cấp đang chọn. Các bộ lọc tích nhiều lựa chọn và cấu hình cột thẳng hàng vẫn được giữ.

Sổ Tiểu học có môn học theo khối, bốn thời điểm đánh giá, điểm kiểm tra, mức hoàn thành và nhận xét, phẩm chất/năng lực và kết luận cuối năm. Học bạ dùng chung dữ liệu đã lưu trong sổ, kèm các năm trước ghép bằng mã hoặc liên kết hồ sơ. Điểm kiểm tra là số nguyên 0–10; kết quả chưa có được để trống, giáo viên xác nhận đánh giá và kết luận. Có tìm kiếm, lọc lớp/cơ sở, xuất CSV mở bằng Excel và in/lưu PDF. Giáo viên chỉ sửa môn/khối/cơ sở được phân công; khóa năm học được áp dụng.

Sổ đã nhập bằng mẫu trước đây có nút **Sổ đã nhập trước đây** để đối chiếu. Bản mới dùng mã lưu riêng, giữ nguyên các bản cũ. Điểm bài kiểm tra trực tuyến vẫn lưu ở bài kiểm tra; không tự coi điểm bài tập là đánh giá định kỳ Tiểu học.

Trong **Cài đặt thời khóa biểu**, khai báo số tiết môn học cho từng khối theo kế hoạch của trung tâm trước khi xếp tự động. Lưu bản lịch cũ dùng chung sẽ tạo bản Tiểu học riêng; lịch THCS được giữ. Trong **Kho sách giáo khoa**, dán liên kết thư mục Drive cho lớp 1–5 rồi bấm **Lưu thư mục SGK**. Mã thư mục SGK Tiểu học chưa có trong cấu hình cũ nên cần gán tại đây.

## Tệp thêm và chỉnh sửa trong lượt này

| Nhóm | Tệp |
| --- | --- |
| Điều hướng và phạm vi cấp học | `src/App.jsx`, `src/utils/educationLevels.js` |
| Học sinh, hồ sơ và nhắc duyệt | `src/components/HocSinhManager.jsx`, `src/hooks/usePendingRegistrationCount.js` |
| Sổ điểm và học bạ | `src/components/PrimaryAcademicWorkspace.jsx`, `src/utils/primaryAcademic.js`, `src/components/ScorebookWorkspace.jsx`, `src/components/LearningResultsWorkspace.jsx` |
| Cấu hình lớp và giáo viên | `src/components/AdminSettingsWorkspace.jsx`, `src/components/SchoolClassesPanel.jsx`, `src/components/TeacherAccountManager.jsx` |
| Lịch học | `src/components/SimpleScheduleTable.jsx`, `src/components/ScheduleSettingsDialog.jsx` |
| Kho SGK | `src/components/TextbookFoldersPanel.jsx` |
| Kiểm tra quyền và lưu dữ liệu máy chủ | `netlify/lib/dataPolicy.mjs`, `netlify/lib/serverData.mjs` |
| Môn học tài khoản giáo viên | `apps-script/code_hoclieu.gs` (nguồn cục bộ, theo quy định dự án không đưa lên Git) |
| Kiểm thử | `test/primaryEducation.test.js`, `test/primaryWorkspace.integration.test.js`, `test/studentDatabaseCompact.integration.test.js`, `test/pendingRegistrationCount.integration.test.js`, `test/scheduleTeacherIndependent.integration.test.js` |

## Kiểm tra và đưa lên web đang dùng

Đã kiểm thử lưu điểm và học bạ, giữ bản nháp khi chuyển cơ sở, phân quyền giáo viên, khóa năm, bảo toàn lớp và thời khóa biểu THCS, chuyển cấp và hàng đợi đăng ký. Bộ kiểm thử toàn dự án đạt 202 bài, 2 bài phụ thuộc môi trường được bỏ qua; kiểm tra mở ứng dụng bổ sung đạt. Lint, kiểm tra cú pháp và build thành công. Build có cảnh báo kích thước gói sẵn có.

Chưa triển khai lên website/Apps Script đang dùng và chưa thay đổi dữ liệu Google Sheet. Khi phát hành, cập nhật website cùng các hàm Netlify; đồng bộ `apps-script/code_hoclieu.gs` vào đúng dự án Kho học liệu rồi tạo phiên bản triển khai mới theo `HUONG_DAN_CAP_NHAT_APPS_SCRIPT.md`. Phần Apps Script bổ sung danh sách môn để tài khoản giáo viên Tiểu học lưu được đầy đủ phân công.
