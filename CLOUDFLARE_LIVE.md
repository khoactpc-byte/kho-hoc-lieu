# Web Trung Mỹ Tây trên Cloudflare Pages

Địa chỉ dùng thật: https://tthtcdtrungmytay.pages.dev/

Nhánh: `codex/cloudflare-live`. Checkout: `.worktrees/cloudflare-live`. Giữ bản Netlify `https://phocaptmt.netlify.app/` và bản thử `https://phocaptmt-thu.pages.dev/`.

## Kiến trúc và dữ liệu

Đây là giao diện đầy đủ của ứng dụng đang phát triển, không có dữ liệu mẫu hoặc bộ lưu localStorage giả của sandbox. Tài khoản và dữ liệu vẫn dùng các Firebase, Supabase, Google Drive và Apps Script hiện có; chưa nhân bản hoặc chuyển cơ sở dữ liệu. Dùng cùng dữ liệu nên thay đổi thật trên web mới cũng sẽ được thấy trên web cũ.

Máy chủ chức năng vẫn ở Netlify trong giai đoạn chuyển tiếp. Cloudflare `_worker.js` chỉ chuyển tiếp bảy API công khai mà giao diện đang dùng; giữ nguyên kiểm tra phiên/quyền, trạng thái HTTP và nội dung nghiệp vụ ở máy chủ cũ. Các job chấm AI, đồng bộ nền và cron vẫn chạy ở chỗ cũ, không tạo cron trùng ở Cloudflare.

Do đó các cập nhật giao diện có thể đưa lên Cloudflare mà không cần xuất bản lại Netlify. Hoạt động backend vẫn sử dụng hạn mức Netlify và dịch vụ hiện có; bản này chưa độc lập hoàn toàn với Netlify. Không xóa/tạm dừng dự án Netlify khi còn dùng cầu nối này. Thay đổi mã backend cần được xử lý riêng, không thể chỉ cập nhật giao diện Cloudflare.

## Ranh giới triển khai

- Không lưu service account, khóa Supabase bí mật, mật khẩu hoặc token đăng nhập vào Cloudflare. Chỉ sử dụng cấu hình VITE công khai được cho phép từ môi trường đang dùng.
- Gói `dist` có `_worker.js`, `_routes.json`, `_headers` và tài nguyên giao diện. Chỉ tải gói zip trong `.cloudflare-artifacts` lên Pages, không tải repository, `.env`, `.netlify` hoặc thư mục khóa.
- `_routes.json` chỉ gọi Worker cho `/.netlify/*` và `/.site/*`; đọc giao diện/tài nguyên tĩnh không cần đi qua Worker.
- Gateway cố định máy chủ đích, từ chối endpoint nội bộ, kiểm tra loại/kích thước yêu cầu, không chuyển tiếp cookie hoặc header job nội bộ, không cache API và không tự thử lại thao tác ghi.
- Khi yêu cầu ghi hết thời gian chờ, không suy ra rằng nó chưa được xử lý. Người dùng được nhắc giữ bản nháp và kiểm tra trạng thái trước khi thử lại.
- Không thay đổi Rules, quyền đọc hoặc mật khẩu của hệ thống cũ trong bước chuyển địa chỉ này.

## Build, kiểm tra và dự phòng

`npm run build` dùng `vite.cloudflare.config.js`, đóng gói và kiểm tra không lẫn khóa máy chủ/sandbox. Cấu hình công khai ở `.cloudflare-public-env`, không commit. `npm run preview:cloudflare` mở cổng 5185 và chạy chính gateway với các backend thật. Không dùng dữ liệu thật để kiểm tra ghi khi chưa xác định một hồ sơ dành cho kiểm thử.

`npm run test:cloudflare` kiểm tra đường chuyển tiếp, giới hạn, giữ nguyên quyền, xử lý lỗi và chống ghi lặp. Có thể chạy thêm kiểm tra hồ sơ/điểm/bài kiểm tra sẵn có bằng các backend giả của bộ test.

Trên web mới, mở `/.site/health` để kiểm tra phiên bản và kiến trúc, không đọc dữ liệu học sinh. Đây chỉ là health của giao diện/gateway, không phải bằng chứng tất cả tác vụ nghiệp vụ đã được chạy.

Nếu gặp vấn đề có thể quay về địa chỉ Netlify cũ. Không có bước đổi DNS hay chuyển hướng bắt buộc người dùng cũ sang địa chỉ mới. Tên Pages mới được tạo thành dự án riêng vì tên `pages.dev` của dự án thử không đổi trực tiếp.

Sau xuất bản cần đăng nhập tài khoản hiện có ở web mới, kiểm tra quyền theo vai trò và các tác vụ cần đăng nhập. Không đánh dấu lưu hồ sơ, điểm, gửi thư hoặc chấm AI thật là đã kiểm thử nếu chưa thực hiện bằng tài khoản và dữ liệu được phép.
