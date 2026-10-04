# Kết quả rà soát và tối ưu lượt 2 — 03/10/2026

> Đã có [báo cáo lượt 3](./KET_QUA_RA_SOAT_LAN_3_2026-10-03.md) về các lỗi dữ liệu và đăng nhập phát hiện tiếp. Số liệu bên dưới là kết quả của lượt 2.

Đã sửa tiếp mã nguồn trên workspace hiện tại, giữ các thay đổi có sẵn. Lệnh kiểm tra tổng thể đạt **70/70 kiểm thử, lint, cú pháp hai Apps Script/manifest và build production**. Chưa commit, triển khai web/Apps Script/Firebase hoặc chạy chuyển đổi dữ liệu trên hệ thống thật. Báo cáo này cập nhật kết quả sau [báo cáo nhóm khó](./KET_QUA_SUA_LOI_KHO_2026-10-03.md), không thay thế bằng chứng của các giai đoạn trước.

## Những thay đổi đã thực hiện

| Nhóm | Lỗi/tình trạng trước | Cách sửa trong lượt này |
| --- | --- | --- |
| Điểm danh | Hai người ghi có thể ghi đè cả bản ghi lớp; giao diện báo kết quả trước khi ghi thành công | Giao dịch đọc bản hiện tại và khóa năm học, so sánh riêng ô học sinh, cập nhật đúng trường. Giữ cập nhật học sinh khác, chặn xung đột cùng học sinh/cơ sở và nhấp trùng; giao diện nhận kết quả đã lưu qua listener. |
| Thời khóa biểu | Đổi lịch công bố và bản tin bằng nhiều lần ghi có thể để trạng thái dở dang | Giao dịch công bố lịch, chuyển lịch cũ về nháp, cập nhật bản tin và con trỏ theo năm/cơ sở/học kỳ. Kiểm tra bản đang sửa và dữ liệu liên quan; giữ ghim thủ công. Xóa lịch và bản tin liên quan cũng dùng giao dịch. |
| Đổi tài khoản | Đăng nhập, hộp thư hoặc nộp bài trả về muộn có thể cập nhật màn hình của tài khoản/bài mới | Xóa vai trò, danh tính và kết quả cũ khi đổi tài khoản; hủy hiệu lực request cũ ngay lúc đăng xuất. Cầu Firebase xếp tuần tự thao tác Auth. Các luồng hộp thư, hồ sơ, trắc nghiệm, bài nộp và kế hoạch dạy chỉ cập nhật giao diện nếu còn đúng phạm vi. |
| Nộp bài | Nhấp nộp và tự nộp có thể chạy sát nhau; FileReader lỗi có thể để trạng thái chờ mãi | Khóa request đang chạy theo từng loại bài/phạm vi; gom đọc tệp thành Promise có xử lý lỗi và hủy. Hồ sơ/bài học sinh kiểm tra JPG, PNG, WebP, PDF, tối đa 20 MB, khớp giới hạn máy chủ. |
| Định danh | Một số luồng ghép bài nộp, điểm, thư kết quả và điểm danh bằng họ tên | Dùng mã HS hoặc ID hồ sơ, từ chối mã mâu thuẫn; tên chỉ để hiển thị. Bài cũ chỉ có tên không tự gán cho một học sinh trùng tên. |
| Theo dõi bài nộp | Đề khác cùng tuần hoặc kết quả khác năm có thể được tính vào đề hiện tại; bảng nhiều khối tính cả đề của khối khác | Dùng chung bộ tính theo đúng đề, khối, môn, tuần, năm, cơ sở và học sinh. Ô không áp dụng hiện dấu gạch; tổng bài cần nộp của mỗi học sinh chỉ tính đề thuộc khối/cơ sở đó. Gom hai bộ tính trùng nhau và lập nhóm kết quả theo ID đề. |
| Chấm/tiến độ | Câu chưa trả lời chứa undefined; điểm 0 bị mất; điều kiện qua hỏi đáp nhanh và tiến độ dùng ngưỡng khác nhau | Chuẩn hóa câu chưa trả lời thành chuỗi rỗng, không tính đúng đáp án rỗng, giữ điểm 0. Nộp bài và theo dõi tiến độ dùng cùng ngưỡng đạt; giữ ngưỡng 0, giới hạn 0–100, cấu hình sai dùng mặc định. |
| Chuyển điểm cũ | Xác nhận đối chiếu còn giữ khi đổi sổ; kết quả lưu sổ cũ có thể cập nhật sổ mới | Reset xác nhận khi đổi tài liệu, bỏ qua phản hồi cũ. Đồng bộ điểm vào giao diện qua listener của sổ đang mở; tránh cập nhật trực tiếp sổ khác sau khi chờ mạng. |
| Đọc dữ liệu | Listener settings/bản tin khởi động lại khi đổi phạm vi; nhiều danh sách riêng tải cả collection | Tách listener cấu hình và bản tin; không mở danh sách riêng khi chưa có vai trò. Hồ sơ/kết quả học sinh lọc theo danh tính; một số danh sách giáo viên lọc năm/khối. Chế độ tương thích vẫn còn các truy vấn rộng, cần tiếp tục cùng việc đổi phân quyền. |
| API đăng ký | Đọc hồ sơ quản trị bằng JSONP có phiên trên URL; callback chờ lâu hoặc không được dọn | Đọc danh sách quản trị bằng POST qua máy chủ chính; Apps Script đăng ký xác thực trước khi khóa. JSONP còn dùng cho danh mục địa chỉ công khai, có timeout, xử lý lỗi/hủy và dọn script/callback. |
| Request máy chủ | Request có thể chờ vô hạn hoặc không hủy khi màn hình đổi | Thêm timeout/AbortSignal, giữ timeout trong lúc đọc response body, dọn listener. Không tự thử lại yêu cầu ghi khi chưa biết máy chủ đã xử lý hay chưa. |
| So sánh và ngày tháng | Thứ tự thuộc tính có thể gây báo xung đột giả; ngày backup theo UTC | Gom so sánh dữ liệu với khóa object được sắp ổn định; không thay cách tính checksum mảnh dữ liệu. Ngày backup tính theo Asia/Ho_Chi_Minh. Chuẩn hóa năm học, loại cặp năm sai và hồ sơ tương lai/mơ hồ khi đổi danh tính. |
| Mã thừa | Ba component root không được import, JSX dưới cờ luôn false, tiện ích/test minh họa không dùng | Xóa các bản component và đoạn chết đã xác minh. Thay test minh họa bằng kiểm thử các service/hook/component thực tế. Chuyển 22 tệp vá/khôi phục cũ vào `archive/recovery-2026-10-03/`, giữ nguyên nội dung. |
| Tổ chức/tải mã | Các màn hình quản trị/hồ sơ nằm trong App; mẫu sổ điểm lặp định dạng ô rất nhiều | Tách kết quả học tập, hồ sơ học sinh và quản lý tài khoản giáo viên để tải khi cần. Gom các định dạng ô khi build; giữ mẫu JSON gốc và dựng lại dữ liệu tương đương khi mở sổ. |
| Giao diện | Thông báo bị màn hình chấm bài che; thiếu nhãn đăng nhập/không chặn nhập trống | Đưa thông báo lên lớp cao hơn, thêm thông báo cho trình đọc màn hình; nút đăng nhập có trạng thái đang xử lý, chặn yêu cầu trùng và thông tin rỗng. |

Các công việc dễ E01–E05 trong [bản phân công](./RA_SOAT_VA_PHAN_CONG_2026-10-03.md) đã được xử lý trong lượt này. M05 có giao dịch thật ở service; M04 và K10 tiếp tục được cải thiện nhưng chưa hoàn tất mọi truy vấn và việc tách toàn bộ App.

## Dung lượng và thư viện

Số đo dưới đây lấy từ bản build Vite 7.3.6 ở cùng lượt sửa, trước và sau bước gom định dạng mẫu:

| Phần | Trước gom mẫu | Sau gom mẫu |
| --- | --- | --- |
| Mã mẫu sổ điểm | 3.447,40 KB / 189,29 KB gzip | **898,63 KB / 141,79 KB gzip** |
| App chính, sau các bản sửa tiếp | — | 512,99 KB / 139,54 KB gzip |
| Firebase | — | 349,26 KB / 107,87 KB gzip |
| Kết quả học tập tải riêng | — | 17,11 KB / 4,79 KB gzip |
| Hồ sơ học sinh tải riêng | — | 10,60 KB / 3,54 KB gzip |

Mã mẫu giảm khoảng **74% trước nén, 25% sau gzip**. Kiểm thử dựng lại và đối chiếu cả 16 sheet, 44.467 ô và thông số in, đồng thời kiểm tra các ô không dùng chung object định dạng có thể sửa. Đây là số đo dung lượng, chưa phải đo thời gian tải trên thiết bị học sinh.

App hiện khoảng 10.550 dòng, 728 KB nguồn. App và mẫu vẫn vượt ngưỡng cảnh báo chunk 500 KB của build; chưa đổi ngưỡng để che cảnh báo. Mẫu được tải khi mở các chức năng cần sổ điểm.

Đã cập nhật Vite/plugin React/esbuild và các bản thư viện tương thích, cấu hình Node 22 cho máy/Netlify. Kết quả audit mới nhất: **phụ thuộc production: 0 cảnh báo; toàn bộ phụ thuộc: còn 5 cảnh báo high**, thuộc chuỗi công cụ Tailwind 3/braces/chokidar/fast-glob/micromatch. Npm đề xuất Tailwind 4 cho phần còn lại. Chưa dùng `audit fix --force` vì nâng major thay đổi CSS và yêu cầu trình duyệt; cần kiểm tra thiết bị cũ và các màn hình/in trước khi chuyển. Xem [hướng dẫn Tailwind](https://tailwindcss.com/docs/upgrade-guide) và [yêu cầu Node của Vite 7](https://v7.vite.dev/guide/migration).

## Đã kiểm tra những gì

- `npm run check`: **70/70 đạt**, không bỏ qua kiểm thử; lint không lỗi/cảnh báo; cú pháp hai Apps Script và manifest hợp lệ; build thành công.
- Kiểm thử giao dịch: lỗi commit không công bố lịch dở; xung đột cùng ô điểm danh bị từ chối; ô học sinh khác được giữ; khóa năm học/cơ sở được kiểm tra.
- Kiểm thử Auth/request: đăng xuất trong lúc đổi token; phản hồi đảo thứ tự; timeout response body; dọn JSONP; hủy hiệu lực kết quả cũ khi quay lại cùng màn hình; chặn nộp trùng.
- Kiểm thử giao diện/component thật tại máy: điểm số 0 trong màn hình đã tách, hồ sơ học sinh và thao tác đối chiếu/chuyển điểm khi đổi sổ. Các service Firestore được chạy với backend giả lập, chưa phải emulator hoặc Firebase thật.
- Kiểm tra trình duyệt tại `http://127.0.0.1:5174/`: trang đầu và cửa sổ đăng nhập học sinh/giáo viên; thông báo nhập thiếu; không thấy lỗi JavaScript trong log ở lượt quan sát cuối. Không nhập mật khẩu, đăng nhập thật hoặc ghi dữ liệu production.
- Kiểm tra phụ thuộc production và toàn bộ phụ thuộc bằng npm audit như số liệu trên.

Ảnh kiểm tra giao diện: `C:/Users/khoac/.codex/visualizations/2026/10/02/01a0fe24-790a-73f3-a3cf-a2d905be75cd/kiem-tra-web-lan-2.png`.

## Những phần còn cần hoàn tất

**Chưa thể khẳng định toàn dự án đã hết lỗi hoặc tất cả gói rất khó đã hoàn tất.** Các giới hạn dưới đây vẫn còn trong kiến trúc/mã và cần làm tiếp, không chỉ là việc bật một cấu hình:

1. **K03 — phân quyền/chấm bài phía máy chủ:** cờ `VITE_SCOPED_AUTH_ENABLED` vẫn false. Còn phải tách đáp án khỏi nội dung học sinh đọc, chấm/lưu điểm bằng quyền máy chủ, hoàn thiện quyền hồ sơ/bài nộp/điểm danh, thu hồi phiên khi khóa tài khoản, metadata/index và mọi listener. Rules hiện là bản chuẩn bị; chưa bật hoặc triển khai. Cần Firebase project thử, môi trường Netlify/Apps Script thử và tài khoản thử để kiểm chứng rồi triển khai.
2. **K02 — phục hồi lớn và khóa mọi người ghi:** backup hiện gồm **18 collection**, settings và phân công đã ghép đủ mảnh; không bao gồm nội dung tệp Drive, Sheet tài khoản giáo viên và mọi subcollection. Phục hồi trình duyệt từ chối hơn 350 thao tác hoặc payload lớn hơn 7 MiB. Chưa có job máy chủ tiếp tục phục hồi lớn, maintenance lock chung và cơ chế ngăn tài liệu mới xuất hiện sau lúc đọc danh mục. Firebase và Sheet không cùng một giao dịch.
3. **K01/K08 — chuyển dữ liệu thật:** điểm cũ theo dòng cần danh sách học sinh đúng lúc nhập điểm; bài/kết quả cũ chỉ có họ tên cần đối soát danh tính. Không tự đoán rồi ghi. Chuyển năm và registry mã HS cần backfill/kiểm chứng trên dữ liệu thử trước khi nhiều quản trị dùng đồng thời.
4. **K07/K10 — bảo trì:** generation/mảnh phân công cũ vẫn được giữ; chưa có công cụ dọn an toàn. App và các màn hình quản trị còn lớn; đã tách thêm phần dùng riêng nhưng chưa thay toàn bộ cấu trúc.
5. **Kiểm tra hai người dùng và triển khai:** cần thử đồng thời trên môi trường thử, kiểm tra mẫu nội dung/in thật, rồi triển khai cả hai Apps Script và frontend theo [hướng dẫn](./HUONG_DAN_CAP_NHAT_APPS_SCRIPT.md). Giao thức con trỏ lịch mới cần các phiên frontend đang dùng được cập nhật; phiên cũ không tham gia khóa giao dịch mới.

Không tắt PC trong lượt này: yêu cầu trước là tắt **sau khi sửa xong**, trong khi các hạng mục rất khó ở trên chưa hoàn tất. Các thay đổi đã được lưu trên đĩa để tiếp tục từ đây.
