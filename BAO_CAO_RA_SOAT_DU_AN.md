# Báo cáo rà soát dự án Kho Học Liệu

Ngày rà soát: 01/10/2026

## Kết luận

Các sửa lỗi P0/P1 có thể xử lý an toàn trong mã nguồn đã được hoàn tất và kiểm tra. Không thể xác nhận trạng thái đang chạy của Firebase, Google Sheet hay các Web App Apps Script từ workspace này; những thay đổi Apps Script cần được cấu hình quyền và triển khai thủ công trước khi có hiệu lực thật.

## Đã xử lý trong mã nguồn

- Tách dữ liệu sổ điểm theo năm học, khối và mã cơ sở; hồ sơ không có mã cơ sở không bị đoán từ hậu tố lớp.
- Chuẩn hóa khóa năm học ở các luồng lọc, thống kê và chuyển năm.
- Sửa công thức điểm cả năm lấy nhầm điểm HKII cho HKI.
- Form tuyển sinh dùng lớp theo cấu hình và hiện tiêu đề theo cơ sở đã chọn.
- Tra cứu giáo viên thời khóa biểu chuẩn hóa khóa năm học.
- Bổ sung chức năng bắt đầu đợt phân công giảng dạy mới và nối tab môn chưa có.
- Ghi trạng thái chuyển năm học `pending/success/failed` cùng bước bị lỗi; cho phép chạy lại để đối soát Firebase và Google Sheet.
- Bảo vệ các action Apps Script đăng ký có thể đọc/ghi/xóa dữ liệu học sinh bằng phiên Admin; giữ các action form công khai cần thiết. Callback JSONP được giới hạn định dạng.
- Đưa các file Apps Script đang dùng vào quản lý phiên bản và cập nhật hướng dẫn cấu hình/triển khai.
- Chuyển lint sang quét mã ứng dụng và test thay vì một file đơn lẻ.

## Việc còn cần xác nhận hoặc thao tác bên ngoài

### P0 — Gán lớp theo cơ sở

Cấu hình lớp hiện tại vẫn là danh sách chung theo năm học; thời khóa biểu và tuyển sinh còn phân loại lớp bằng quy ước hậu tố `A/B`. Quy ước này không đủ an toàn vì `6A`, `6B` cũng có thể chỉ là tên lớp. Cần chuyển sang ánh xạ tường minh `năm học → cơ sở → khối → lớp` và đồng bộ quy tắc kiểm tra với Apps Script. Tôi chưa tự gán lớp nào cho cơ sở nào vì dữ liệu đó không thể suy ra chắc chắn. Đang chờ lựa chọn của người dùng về cách quản lý/migration lớp cũ.

### P0 — Triển khai bảo vệ Apps Script

Trong dự án Apps Script đăng ký, thêm Script Properties `APP_MAIN_WEB_APP_URL` và `APP_CLIENT_TOKEN` theo hướng dẫn; cấp quyền `script.external_request`; sau đó cập nhật và deploy phiên bản mới của Apps Script chính lẫn Apps Script đăng ký. Nếu chưa làm bước này, các thao tác quản trị mới sẽ bị từ chối; mã nguồn đã sửa không tự cập nhật Web App đang chạy.

### P0 — Firebase và khóa Google API

- Repo chỉ có `firestore.rules.secure-ready` dạng mẫu, không có cấu hình deploy rules thực tế. Ứng dụng vẫn dùng anonymous authentication; không deploy rules chặt ngay vì có thể khóa nhầm hệ thống. Cần thiết lập tài khoản/role thật, thử trên Firebase test project rồi mới chuyển rules.
- Khóa Google Drive API đang nằm trong mã frontend/Git nên phải thu hồi hoặc thay mới nếu chưa làm; giới hạn theo referrer website và chỉ bật API cần thiết. Không thể thao tác Google Cloud Console từ workspace.

### P1 — Kiểm thử tích hợp thật

Sau khi deploy, thử đăng nhập Admin, tải danh sách chờ, đọc danh sách học sinh, sửa/xóa có kiểm soát, đồng bộ Sheet, tuyển sinh ở cả hai cơ sở và chuyển năm có chủ đích trên dữ liệu kiểm thử. Các kiểm thử này cần tài khoản/quyền Firebase và Apps Script thật.

## Kiểm tra đã chạy

- Test: 15/15 đạt.
- Lint: đạt, không có lỗi/cảnh báo.
- Build production: thành công; còn cảnh báo riêng chunk mẫu sổ điểm khoảng 2.8 MB chưa nén (khoảng 182 KB gzip), hiện đã tải tách khi cần.
- Cú pháp hai Apps Script và manifest JSON: hợp lệ.
- `git diff --check`: không có lỗi khoảng trắng.

