# Cấu hình bảo mật

Cập nhật 04/10/2026. Mã nguồn cho định danh, API điểm, quiz nhanh/thủ công, lease phiên và sao lưu/phục hồi đã được nối và kiểm thử tại máy. **Chưa triển khai các thay đổi lên hệ thống thật.** Các cờ trong .env.example vẫn tắt.

Hướng dẫn đầy đủ, ma trận quyền và thứ tự chuyển dữ liệu nằm trong [Triển khai định danh, điểm và an toàn dữ liệu](./TRIEN_KHAI_DINH_DANH_DIEM_VA_AN_TOAN_DU_LIEU.md). Kết quả thực hiện nằm trong [báo cáo](./THUC_HIEN_CAC_MUC_2026-10-03.md).

## Bí mật chỉ lưu phía máy chủ

- Script Properties: APP_ADMIN_PASSWORD, APP_THD_PASSWORD, APP_IDENTITY_BRIDGE_TOKEN; APP_GEMINI_API_KEY nếu dùng key riêng.
- APP_TEACHER_PASSWORD_PEPPER do máy chủ tạo; không xóa hoặc thay tùy ý. Tài khoản giáo viên được băm trong Sheet TEACHER_ACCOUNTS; giới hạn người được sửa Sheet đó.
- Netlify: FIREBASE_SERVICE_ACCOUNT_JSON, IDENTITY_BRIDGE_TOKEN cùng các biến server được liệt kê trong .env.example. Không đặt service account/bridge token/mật khẩu vào biến VITE.
- APP_CLIENT_TOKEN là mã nhận diện công khai của ứng dụng; phải khớp APPS_SCRIPT_CLIENT_TOKEN, nhưng không được dùng thay quyền đăng nhập.
- Không commit .env, mat_khau.txt, src/mat_khau.txt hoặc cauhinh.json. Key đã từng lộ trong mã/Git cần được thu hồi ở nhà cung cấp; chỉ xóa khỏi mã không đủ.

## Quyền và phiên

Firebase dùng phiên có appId và lease máy chủ. Lease tối đa 2 phút, gia hạn bằng kiểm tra phiên gốc; không vượt hạn gốc Apps Script. Đăng xuất thu hồi lease. API nhân viên kiểm tra tài khoản/phân công hiện tại; Rules mất quyền khi lease hết hạn hoặc bị thu hồi.

Mọi ghi điểm qua API kiểm tra môn, ô, học sinh trong sổ, khóa năm và xung đột. Đáp án/private bank không được đọc trực tiếp bằng SDK, kể cả từ browser Admin. Học sinh lấy kết quả rút gọn của mình qua API; không gửi điểm tự tính để máy chủ tin.

Rules dự thảo chặn ghi khi maintenance hoạt động. Cờ KHL_MAINTENANCE_RULES_READY chỉ được bật sau khi kiểm chứng khóa trên môi trường triển khai. Không sửa Rules thành rộng quyền để chữa lỗi màn hình.

Settings/global phải bỏ các trường mật khẩu cũ trước khi cho nhân viên đọc. Rules đã chặn nhân viên đọc global còn adminPass, teacherPass hoặc thdAdminPass. Giáo viên và THĐ không được đọc credential từ vùng này.

## Google Drive và dữ liệu cũ

Bản Google Doc giáo viên được tạo riêng; bản học sinh dùng nội dung đã loại các khối đáp án. Công cụ kiểm kê tài liệu cũ có xem trước và thu hồi chia sẻ theo link sau xác nhận các mã tệp cụ thể. Cần kiểm tra quyền thực tế, quyền kế thừa và quyền tổ chức trước phát hành; sửa metadata Firebase không thu hồi quyền file Drive cũ.

Biên nhận tải bài ràng buộc tệp với học sinh trước khi lưu bài tự luận. Nội dung Drive, Sheet tài khoản, Script Properties và key Gemini không nằm trong bản lưu Firestore; sao lưu riêng các phần này. Hộp thư Sheet có trạng thái phục hồi riêng, không phải giao dịch nguyên tử với Firestore.

## Thư viện và trình duyệt cũ

Giữ Tailwind 3 theo yêu cầu hỗ trợ thiết bị cũ. Chuỗi braces/chokidar/fast-glob/micromatch/Tailwind vẫn có 5 cảnh báo mức cao trong công cụ phát triển của npm; không nâng lên Tailwind 4 và không che cảnh báo. Guard khi cài/dựng giới hạn độ sâu parser và từ chối AST vòng lặp; có kiểm thử tái hiện. Audit production không có cảnh báo tại thời điểm kiểm tra. Guard giảm rủi ro tình huống đã kiểm chứng, không thay thế bản vá chính thức. Xem [advisory braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

Firebase API key trên trình duyệt không phải cơ chế bảo vệ dữ liệu; quyền nằm ở Auth/Rules/API. Google Drive key trên frontend cần giới hạn API, referrer và hạn mức. Việc thu hồi key, bật App Check hoặc thay quyền Google Cloud cần thực hiện trên môi trường thật theo cấu hình của trường; lượt sửa mã này không xác nhận những thiết lập đó đã được áp dụng.
