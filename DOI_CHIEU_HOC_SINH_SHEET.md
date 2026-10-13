# Đối chiếu học sinh Sheet và web

## Vì sao số lượng có thể khác nhau

Nút cập nhật trước đây chỉ sửa các hồ sơ đã khớp trên web và bỏ qua hồ sơ chưa có. Khi lọc cột năm `2026-2027` trên Sheet, số dòng có thể khác danh sách web nếu phần tóm tắt `Lớp hiện tại` / `Năm học hiện tại` chưa đồng nhất. Dòng Sheet trùng cũng có thể làm tổng tăng. Không thể xác định tên bốn học sinh chỉ từ ảnh thống kê.

## Cách sử dụng

1. Chọn đúng năm học và cấp học trên web.
2. Vào **Tiện ích → Nhập và đồng bộ Sheet → Đối chiếu Sheet / thêm học sinh thiếu**, hoặc bấm **Đối chiếu với Sheet** ngay trong bảng thống kê.
3. Bấm tên lớp trong bảng số lượng để xem các dòng của lớp đó. Bảng ghi rõ dòng Sheet, tên, ngày sinh, mã học sinh, lớp Sheet, lớp web và lý do chênh lệch.
4. Tích các dòng **Thiếu trên web** để thêm hồ sơ. Tích **Khác lớp** nếu đã kiểm tra và muốn áp dụng lớp ghi trong cột năm trên Sheet. Bấm **Áp dụng các hồ sơ đã chọn**.
5. Hồ sơ nghi trùng/thiếu định danh không được tự tạo hoặc ghi đè. Hồ sơ có năm trước được nối bằng định danh ổn định; không tạo bản sao độc lập làm mất liên kết điểm.

Nút **Cập nhật hồ sơ từ Sheet** vẫn cập nhật thông tin các hồ sơ khớp; nếu còn người thiếu/khác lớp/nghi trùng thì mở bảng đối chiếu để xử lý. Các ô lớp theo năm không tự được suy ra bằng cách cộng/trừ khối.

Nguồn lớp ưu tiên ô của cột năm đang xem. Nếu ô đó chưa có nhưng phần tóm tắt thuộc đúng năm đang xem thì dùng lớp của phần tóm tắt; không dùng phần tóm tắt của năm khác để tự tính lớp. Do đó bảng đối chiếu còn giúp thấy các hồ sơ chưa được điền vào cột năm trên Sheet.

## Kiểm tra nghi trùng

Vào **Tiện ích → Kiểm tra học sinh nghi trùng**. Danh sách phân biệt nguồn Web và Sheet, nêu lý do nghi trùng, mã, ngày sinh, lớp, cơ sở và trạng thái. Hồ sơ cùng một học sinh ở các năm khác nhau không bị tính là trùng. Một dòng Sheet khớp một hồ sơ web cũng không bị tính là trùng.

Với hồ sơ web: bấm **Xem hồ sơ** để đối chiếu hoặc **Chọn trên danh sách** để chọn đúng một hồ sơ, sau đó tự quyết định xóa bằng thao tác hiện có. Việc mở danh sách nghi trùng không xóa dữ liệu. Với dòng Sheet: dùng số dòng để kiểm tra tại Sheet trước khi tự xử lý.

## Cập nhật mã

- Website: các thay đổi trong `src/components/HocSinhManager.jsx`, `src/components/StudentSheetReconciliation.jsx`, `src/utils/studentSheetReconciliation.js`.
- Apps Script đăng ký: thay `Code.gs` bằng `apps-script/dang-ky-hoc-sinh/code_dangky.gs`, sau đó **Deploy → Manage deployments → Edit → New version → Deploy**; giữ URL hiện tại. Phiên bản mới: `2026-10-13-sheet-roster-v10`.
- Các thao tác thêm/sửa chỉ chạy khi admin chọn áp dụng trên web. Lượt chỉnh mã không sửa dữ liệu Sheet/Firebase đang sử dụng.

## Kiểm tra mã

`npm run check` hoàn tất: 247 test đạt, 0 lỗi, 2 test cần Firestore Emulator được bỏ qua; lint, kiểm tra cú pháp Apps Script và build production đều đạt. Đã kiểm thử bằng dữ liệu giả lập tình huống 35 dòng Sheet so với 31 hồ sơ web, thêm hồ sơ thiếu giữ liên kết năm trước, cập nhật lớp được chọn, xử lý nghi trùng và giữ trạng thái bỏ học. Chưa xác định danh tính bốn trường hợp trong Sheet thật từ ảnh chụp.
