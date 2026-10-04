# HƯỚNG DẪN CẬP NHẬT GOOGLE APPS SCRIPT

Hệ thống hiện có **2 dự án Google Apps Script đang sử dụng**. Không dán tất cả file vào chung một dự án.

## Bản mã nguồn hoàn thiện ngày 04/10/2026

| Dự án | Phiên bản cần thấy sau triển khai |
| --- | --- |
| Máy chủ chính | `2026-10-04-review-v8` |
| Đăng ký học sinh | `2026-10-04-location-cache-v7` |

Lượt sửa này đã cập nhật **mã nguồn trong máy**, chưa cập nhật hai Web App đang chạy. Cập nhật và triển khai máy chủ chính trước, tiếp theo dự án đăng ký, rồi đưa frontend mới lên hosting. Giữ các URL Web App hiện tại.

Bản review-v8 khóa các thao tác xóa/gửi lại thư theo ID để tránh lệch dòng khi có người khác thao tác đồng thời. Gửi lại thư đọc trạng thái mới nhất và ghi theo lô; xóa hàng loạt báo số mục đã hoàn tất nếu bị gián đoạn. Frontend mới giữ nháp điểm khi đóng/mở trong cùng phiên, chặn ngày không tồn tại, chờ thư viện toán tải xong và đọc thống kê riêng, không tạo bản sao lưu khi chỉ mở màn hình.

Nếu đang dùng xác thực theo vai trò mới (`VITE_SCOPED_AUTH_ENABLED=true`), cần triển khai cả Netlify Functions để có action `system/readSummary`, cùng với frontend. Không tự bật thêm các cờ chấm bài/bảo trì chỉ để lấy thống kê. Quy trình chuyển nhánh có kiểm chứng vẫn theo tài liệu triển khai bên dưới.

Danh sách hồ sơ chờ duyệt và học sinh trên Sheet giờ được frontend đọc bằng **POST có phiên Admin**, qua action `registrationAdminAction` của máy chủ chính. Endpoint đăng ký từ chối GET/JSONP cho `listPending`, `listStudents` và các thao tác quản trị. Không sửa lại thành GET hoặc đưa phiên Admin vào URL để chữa lỗi tương thích. Nếu chỉ cập nhật frontend mà chưa triển khai cả hai Apps Script, các danh sách này có thể không mở được.

Mở URL `/exec` của máy chủ chính để xem chuỗi phiên bản; ở dự án đăng ký, mở `/exec?action=version`. Hai thao tác kiểm tra này không cần gửi mật khẩu hoặc token. Sau triển khai, đăng nhập Admin rồi kiểm tra đọc hồ sơ chờ duyệt, đọc danh sách Sheet, đồng bộ năm học, hộp thư, tải tệp và sao lưu trên dữ liệu thử.

Cấu hình bridge, quyền mới, chuyển dữ liệu cũ, sao lưu/phục hồi và nghiệm thu nằm trong [hướng dẫn triển khai mới](./TRIEN_KHAI_DINH_DANH_DIEM_VA_AN_TOAN_DU_LIEU.md).

## 1. Dự án máy chủ chính

Tên nên đặt trên Google Apps Script:

`KHO HỌC LIỆU - MÁY CHỦ CHÍNH`

Web App hiện tại:

`https://script.google.com/macros/s/AKfycbx1cWQpyyoT2adUZIJja40d5rXtlNwaa1PqYiUJndB79SX0Rq2Mt8CBEs53EiBC8HhhRg/exec`

| Trên Google Apps Script | File lấy trong máy |
| --- | --- |
| `Code.gs` | `apps-script/code_hoclieu.gs` |

File này xử lý:

- Đăng nhập Admin, Giáo viên và Trần Hưng Đạo.
- Gemini, chấm bài và tải file.
- Xuất PDF, Google Sheet.
- Hộp thư học sinh.
- Sao lưu, khôi phục và nhật ký hoạt động.

Script Properties cần có:

- `APP_CLIENT_TOKEN`: phải giống `APPS_SCRIPT_CLIENT_TOKEN` trong `src/utils/helpers.js`.
- `APP_ADMIN_PASSWORD`: mật khẩu Admin.
- `APP_THD_PASSWORD`: mật khẩu Trần Hưng Đạo.
- `APP_GEMINI_API_KEY`: không bắt buộc nếu đang dùng danh sách key trong sheet `key gemini`.
- `APP_IDENTITY_BRIDGE_TOKEN`: bí mật riêng, khớp giá trị `IDENTITY_BRIDGE_TOKEN` phía Netlify cho API mới.
- `APP_TEACHER_PASSWORD_PEPPER`: hệ thống tự tạo khi khởi tạo tài khoản giáo viên; không nhập tay, không xóa.

Tài khoản giáo viên được quản lý trong tab `TEACHER_ACCOUNTS` của spreadsheet dữ liệu chính; tab tự tạo khi Admin mở danh sách tài khoản lần đầu. Mật khẩu được băm trước khi lưu. Hãy giới hạn người có quyền chỉnh sửa spreadsheet này ở nhóm quản trị cần thiết.

Sau khi triển khai phiên bản mới của máy chủ chính, vào Admin → Quản lý mật khẩu → Tạo tài khoản giáo viên để nhập họ tên, mật khẩu, cơ sở, khối và môn. Tên đăng nhập được tự lấy từ tên cuối không dấu (ví dụ “Phạm Anh Khoa” → `khoa`); có thể sửa nếu tên đó đã được dùng. Hệ thống hỗ trợ khối 1–9 và môn “Chủ nhiệm”. Giáo viên đăng nhập bằng tên đăng nhập/mật khẩu riêng; mật khẩu dùng chung cũ không còn dùng để vào vai trò giáo viên.

Sau khi xác nhận đăng nhập giáo viên mới hoạt động, có thể xóa hai Script Properties cũ `APP_TEACHER_PASSWORD` và `APP_TEACHER_PASSWORD_ENABLED`; phiên bản mới không còn đọc chúng.

Các tệp/bài mới được gắn mã cơ sở. Nội dung cũ không có mã cơ sở được giữ ở cơ sở Nguyễn An Ninh để tương thích; nội dung của Trần Quang Khải cần được gắn mã `TQK` trước khi hiển thị cho học sinh cơ sở đó.

Không nhập mật khẩu trực tiếp vào `Code.gs`.

## 2. Dự án đăng ký và dữ liệu học sinh

Tên nên đặt trên Google Apps Script:

`ĐĂNG KÝ HỌC SINH - DỮ LIỆU SHEET`

Web App hiện tại:

`https://script.google.com/macros/s/AKfycby6e5ya2k105Oe7i65k9viysIZbHKOF-9CosueiNy1GvnHJbVw1lHB_0eezSxO91ls/exec`

| Trên Google Apps Script | File lấy trong máy |
| --- | --- |
| `Code.gs` | `apps-script/dang-ky-hoc-sinh/code_dangky.gs` |
| `Index.html` | `apps-script/dang-ky-hoc-sinh/Index.html` |

File này xử lý:

- Form đăng ký học sinh.
- Danh sách đăng ký chờ duyệt.
- Đồng bộ Firebase với sheet `Data`.
- Danh mục tỉnh, huyện, xã.
- Hồ sơ và ảnh học sinh.
- Cơ sở đăng ký học và hậu tố lớp (`Nguyễn An Ninh` = `A`, `Trần Quang Khải` = `B`).
- Chặn năm đăng ký nhỏ hơn năm học hiện tại.
- Các cột `Lớp hiện tại`, `Năm học hiện tại` và `Khối hiện tại`.

Khi cập nhật form đăng ký, cần thay cả `Code.gs` bằng `code_dangky.gs` và `Index.html` bằng file cùng tên trong máy, sau đó triển khai phiên bản mới.

Danh mục địa chỉ được tối ưu trong bản location-cache-v7: đọc Sheet và lập chỉ mục khi chưa có cache, giữ cache máy chủ tối đa 6 giờ, chia dữ liệu thành mảnh nhỏ; mỗi tỉnh tải huyện và xã cùng một lượt. Đổi huyện sau đó chỉ lọc trên trình duyệt. Nơi sinh, nơi đăng ký khai sinh và quê quán dùng chung dữ liệu của tỉnh; địa chỉ hiện tại/hộ khẩu cũng dùng chung cache. Trình duyệt lưu danh mục công khai đã dùng trong 1 giờ, vẫn hỏi lại phiên bản danh mục khi mở form. Lỗi tải có nút thử lại, phản hồi cũ không đổi lựa chọn mới.

Bản Index.html đã sửa lỗi hai bảng gợi ý chồng nhau ở ba ô tỉnh nơi sinh, đăng ký khai sinh và quê quán: mỗi ô chỉ dùng bảng gợi ý riêng, tìm không dấu được, chọn bằng chuột/chạm hoặc phím ↑ ↓ và Enter; Escape đóng danh sách. Chuyển ô sẽ đóng danh sách cũ. Cần cập nhật và triển khai Index.html mới để áp dụng sửa giao diện này; phiên bản endpoint máy chủ vẫn là location-cache-v7.

### Khi chọn tỉnh báo thiếu quyền `SpreadsheetApp.openById`

Đây là quyền của **bản Web App đăng ký đang chạy**, không phải lỗi danh sách tỉnh/huyện hay tốc độ tải. Nút “Thử lại” chỉ có tác dụng sau khi sửa quyền. Làm trên đúng dự án **ĐĂNG KÝ HỌC SINH - DỮ LIỆU SHEET** bằng tài khoản sở hữu bản triển khai:

1. Mở spreadsheet có ID trong hằng `SPREADSHEET_ID` ở `code_dangky.gs`; xác nhận tài khoản này xem được các tab `Data`, `Provinces`, `Communes` và `tinhhuyenxa`.
2. Trong Apps Script, vào **Project Settings**, bật **Show "appsscript.json" manifest file in editor**. Nếu manifest của dự án đã có `oauthScopes`, bảo đảm có `https://www.googleapis.com/auth/spreadsheets`. File [`appsscript.json`](./apps-script/dang-ky-hoc-sinh/appsscript.json) trong máy là mẫu đầy đủ cho mã đăng ký hiện tại. Giữ lại các cấu hình riêng khác của dự án khi chỉnh manifest.
3. Lưu dự án, chọn hàm **`capQuyenMotLan`** trong thanh chọn hàm của trình sửa Apps Script, nhấn **Run** và chấp thuận các quyền Google được hỏi, gồm Google Sheets. **Execution log** phải hiển thị “Đã cấp đủ quyền: Sheet, Drive, Google Docs.” Nếu vẫn báo thiếu quyền, kiểm tra tài khoản Google đang dùng, quyền truy cập spreadsheet và `oauthScopes` trong dự án thực tế.
4. Vào **Deploy → Manage deployments → Edit** bản triển khai Web App đăng ký hiện tại. Chọn **Execute as: Me** (tài khoản đã cấp quyền ở bước 3), giữ phạm vi người được truy cập phù hợp với biểu mẫu, chọn **New version** rồi **Deploy**. Nếu để **User accessing the web app**, mỗi người mở form sẽ cần cấp quyền và có quyền đọc spreadsheet; cách đó không phù hợp với form học sinh này.
5. Mở lại URL `/exec` của **bản triển khai vừa cập nhật** và thử chọn tỉnh → huyện → xã. Nếu vừa thay mã nguồn hoặc manifest, không dùng URL `/dev` để kết luận bản `/exec` đã sửa.

Không đưa spreadsheet sang chế độ công khai, không chia sẻ quyền chỉnh sửa Sheet cho học sinh để né lỗi cấp quyền.

Sheet `Provinces`, `Communes` và `tinhhuyenxa` vẫn là nguồn danh mục; không tự thay đổi địa giới hoặc tên địa phương. Khi sửa danh mục và cần áp dụng ngay, đổi Script Property `LOCATION_DIRECTORY_VERSION` sang giá trị mới (ví dụ từ `1` sang `2`), rồi tải lại biểu mẫu. Không cần triển khai lại chỉ để đổi property này. Nếu không đổi property, cache sẽ được đọc lại khi hết hạn hoặc bị Google thu hồi. Cách chia mảnh tuân theo [giới hạn CacheService của Google](https://developers.google.com/apps-script/reference/cache/cache); cache lỗi hoặc thiếu mảnh sẽ đọc lại Sheet.

Trong dự án đăng ký, tạo Script Property:

- `CURRENT_SCHOOL_YEAR`: năm học hiện tại, ví dụ `2025-2026`.
- `APP_MAIN_WEB_APP_URL`: URL Web App của **máy chủ chính** nêu ở mục 1.
- `APP_CLIENT_TOKEN`: cùng giá trị `APP_CLIENT_TOKEN` đang cấu hình ở máy chủ chính và frontend.

Mã đăng ký dùng hai property này để hỏi máy chủ chính xác thực phiên Admin trước khi đọc danh sách học sinh hoặc ghi/xóa dữ liệu. Manifest dự án đăng ký cũng cần scope `script.external_request`; sau khi cập nhật mã/manifest, hãy cấp quyền UrlFetchApp nếu Google yêu cầu rồi mới triển khai bản mới. Form đăng ký công khai và danh mục địa chỉ vẫn hoạt động không cần phiên Admin.

Nếu chưa tạo property, form dùng giá trị dự phòng `2025-2026`. Máy chủ vẫn kiểm tra lại năm học khi nhận hồ sơ, nên không thể lách bằng cách sửa dữ liệu trên trình duyệt.

Cấu trúc cố định mà mã đang đọc trong sheet `Data` là:

- `AN:AW`: thông tin nơi sinh, đăng ký khai sinh và quê quán.
- `AX`: `Ma hoc sinh`.
- `AY:BD`: khối/lớp/năm hiện tại, cơ sở, mã cơ sở và hậu tố lớp.
- `BE` trở đi: các cột lịch sử năm học, ví dụ `2025-2026`, `2026-2027`.

Khi chuyển năm học trên website, mã sẽ ghi lớp cũ vào cột năm cũ và lớp mới vào cột năm mới. Không cần tự di chuyển các cột lịch sử; nếu thêm năm mới, mã sẽ tự tạo cột ở cuối.

## 3. Các file không cần dán

| File | Trạng thái |
| --- | --- |
| `apps-script/code_chambai.gs` | Bản máy chủ cũ; chức năng đã nằm trong `code_hoclieu.gs`. |
| `scripts/gemini-key-router.gs` | Đã được gộp vào `code_hoclieu.gs`. |
| `apps-script/dang-ky-hoc-sinh/Javascript.html` | Bản tách cũ; JavaScript hiện đã nằm trong `Index.html`. |
| `apps-script/dang-ky-hoc-sinh/Stylesheet.html` | Bản tách cũ; CSS hiện đã nằm trong `Index.html`. |
| `apps-script/dang-ky-hoc-sinh/appsscript.json` | Chỉ dùng khi sửa manifest bằng công cụ nâng cao; bình thường không cần dán. |

Không dán các file này vào `Code.gs`, vì có thể trùng tên hàm và làm Web App lỗi.

## 4. Cách nhận biết đúng dự án nếu tên cũ khác

1. Mở dự án Google Apps Script.
2. Chọn **Triển khai → Quản lý việc triển khai**.
3. So sánh URL Web App với hai URL ở trên.
4. URL có đoạn `AKfycbx1...` là **máy chủ chính**.
5. URL có đoạn `AKfycby6...` là **đăng ký và dữ liệu học sinh**.

## 5. Cách cập nhật và triển khai

1. Mở đúng dự án Apps Script.
2. Mở đúng file `Code.gs` hoặc `Index.html`.
3. Xóa nội dung cũ của file đó rồi dán toàn bộ nội dung file tương ứng trong máy.
4. Nhấn **Lưu**.
5. Chọn **Triển khai → Quản lý việc triển khai**.
6. Nhấn biểu tượng cây bút của bản Web App đang dùng.
7. Ở mục phiên bản, chọn **Phiên bản mới**.
8. Nhấn **Triển khai**. Không tạo Web App mới để URL hiện tại không thay đổi.

## 6. Sau khi cập nhật cột Khối

1. Triển khai lại dự án **ĐĂNG KÝ HỌC SINH - DỮ LIỆU SHEET**.
2. Vào Admin → Hồ sơ học sinh → Database học sinh.
3. Chọn đúng năm học.
4. Chọn **Tiện ích → Bổ sung cột Khối**.
5. Lặp lại cho từng năm học cần chuyển đổi.

Hệ thống sẽ tự suy ra `Khối 9` từ các lớp như `9`, `9A`, `9B`. Cột mới trên Google Sheet được thêm ở cuối bảng để không làm lệch dữ liệu cũ.
