# Kết quả thực hiện các mục đã chọn

Hoàn tất lượt sửa và kiểm chứng mã nguồn ngày **04/10/2026**. Phạm vi: **01, 03, 05, 06, 07–11, 15, 17, 19, 21, 23, 24** trong báo cáo ngày 03/10.

Các thay đổi đang ở workspace. **Chưa triển khai lên Firebase/Netlify/Apps Script, chưa chạy chuyển đổi hoặc thu hồi quyền trên dữ liệu thật.** Hướng dẫn phát hành và nghiệm thu: [Triển khai định danh, điểm và an toàn dữ liệu](./TRIEN_KHAI_DINH_DANH_DIEM_VA_AN_TOAN_DU_LIEU.md).

## Những phần đã sửa

| Mục | Kết quả trong mã nguồn | Kiểm chứng chính |
| --- | --- | --- |
| 01 | Thống nhất thêm/sửa/import/cấp mã/cấp lại/duyệt hồ sơ bằng studentMutations; counter và registry trong giao dịch; studentKey bất biến; giữ mã lịch sử; CAS tránh đè hồ sơ đang sửa. Có đối soát metadata cũ, không tự gộp mã lịch sử chưa rõ. | Cấp đồng thời, đổi mã giữ khóa điểm, xung đột hồ sơ, registry và quan hệ chuyển năm. |
| 03 | Thao tác hàng loạt ghi nhận kết quả từng ID; tách thành công Firebase khỏi lỗi nhật ký/Sheet. Lưu hồ sơ vào archive trước xóa; chỉ retry phần còn lỗi. | Lỗi một mục và lỗi sau ghi không báo nhầm toàn bộ chưa làm. |
| 05 | Tách bản Google Doc giáo viên và bản học sinh; khối đáp án được loại khỏi bản học sinh. Có công cụ xem trước quyền file cũ, chuyển file riêng và thu hồi chia sẻ theo link. | Kiểm thử HTML lồng nhau và kiểm tra nguồn tạo tài liệu; chưa kiểm tra quyền Drive thật. |
| 06 | Quiz nhanh dùng chung engine máy chủ với quiz theo bài. Bank riêng, ID câu/lựa chọn theo lượt, điểm máy chủ, chống nộp lặp; đầu ra học sinh không chứa khóa đáp án. Đề thủ công dùng HTML học sinh riêng. | Giả mạo điểm/lựa chọn/lượt, đổi phiên bản, nộp lại và cách ly loại đề. |
| 07 | Nối API cho tiến độ, yêu cầu hồ sơ, bài tự luận, lớp trưởng, điểm, chuyển điểm cũ, bảo trì; truy vấn theo lease/phạm vi. Bài nộp phải có biên nhận tải đúng học sinh. Chuẩn bị Rules, indexes và ma trận quyền. | API + Rules với request ngoài quyền, chéo cơ sở/khối/môn, trường tùy ý và truy cập SDK trực tiếp. |
| 08 | Ghi điểm qua API kiểm tra từng ô/môn/học sinh, khóa năm và CAS. Giữ cấu hình sổ; bảo vệ điểm sửa tay/xóa tay trước chấm tự động. Nhật ký trước/sau cùng giao dịch, chia trang khi nhiều ô; nối cả chấm tự động, chấm giáo viên, đồng bộ và mở lại bài. | Điểm 0, ô tính toán, sai môn, sai học sinh, người khác vừa sửa, chấm lại/mở lại và nhật ký lớn. |
| 09 | Lease tối đa 2 phút, gia hạn không vượt hạn Apps Script gốc; đăng xuất thu hồi; API kiểm phân công hiện tại. Apps Script kiểm hạn thực tế và phiên bản tài khoản. | Hết hạn, thu hồi, khóa tài khoản/đổi phân công và không thể kéo dài phiên gốc bằng retry. |
| 10 | Bản lưu v3 gồm collection công khai, settings, đề/lượt/slots riêng, audit điểm và generation/chunks. Khóa ghi bắt buộc, checksum từng mảnh, giữ kiểu Firestore; tiếp tục xuất và tái sử dụng file Drive theo job. | Hơn 400 hồ sơ, hơn 7 MB, tài liệu lớn chia mảnh, checksum, Timestamp/GeoPoint/binary/reference; giao dịch SDK thật trên emulator. |
| 11 | Có xem trước thêm/ghi lại/xóa; kiểm chứng quan hệ và lập kế hoạch theo trang có checkpoint; phát hiện subcollection sau khi khóa. Ghi/hoàn tác từng chặng nguyên tử; giữ phiên bản trước; trạng thái hộp thư riêng, retry không phục hồi Firebase lần nữa. Tiến độ chỉ trả tóm tắt. | Mất phản hồi sau commit, tạo instance mới tiếp tục, lỗi giữa chặng, hoàn tác, hồ sơ ngoài bản lưu, generation thêm sau xem trước và lỗi Sheet. |
| 15 | Dùng chung công thức điểm/xếp loại, cấu hình môn/trang/cột và miền học tập; nối App, HocSinhManager, sổ điểm, học bạ và backend. | Ranh giới làm tròn, điểm 0/thiếu, hệ số và trường hợp đạt/chưa đạt. |
| 17 | Listener độc lập, mở dữ liệu theo màn hình, không mở lại roster/tuyển sinh khi đổi môn; chặn callback của phiên cũ. Kết quả học sinh riêng được đọc qua API. | Màn quản trị đầu mở 6 feed thay vì 11; mở review 10; đổi môn giữ feed roster/tuyển sinh; đăng xuất còn 0. Đây là đo bằng kiểm thử listener, không phải đo latency ngoài mạng. |
| 19 | Tách luồng phiên, dữ liệu workspace, kết quả học sinh và phiên quiz thành hooks; tách bảng điểm giáo viên, yêu cầu sửa hồ sơ và công cụ đối soát tài liệu; tải các phần phù hợp khi cần. | Kiểm thử service/hook/client, dựng bản phát hành và kiểm tra giao diện. Đây là refactor theo đợt; chưa thay toàn bộ kiến trúc App và các màn quản trị lớn. |
| 21 | Giữ Tailwind 3 theo yêu cầu trình duyệt cũ; thêm guard dependency lúc cài/dựng, kiểm thử parser sâu/AST vòng lặp; bổ sung API trình duyệt thiếu và mục tiêu biên dịch cũ hơn. | Production audit 0; vẫn còn 5 cảnh báo high thuộc chuỗi build. Guard không xóa cảnh báo hoặc thay thế bản vá chính thức. |
| 23 | Ghi hồ sơ và outbox job cùng giao dịch; worker có lease, phiên bản và worker ID; ACK chỉ áp dụng đúng bản mới nhất. Apps Script giữ checkpoint dưới script lock; đổi mã cập nhật dòng cũ; chặn năm/revision cũ. Có nút thử lại sau tải lại. | Hai lượt cạnh tranh, retry, đổi mã không thêm dòng, job cũ không đè mới. Worker hiện chạy theo thao tác quản trị; chưa có lịch nền độc lập. |
| 24 | Metadata vòng đời staging/published; xem trước/dọn generation qua API quản trị theo từng chặng, giữ bản đang dùng, bản dưới 30 ngày và bản chưa đủ căn cứ. Kiểm tra lại con trỏ và maintenance mỗi chặng. | Dọn trong khi đổi con trỏ hoặc bảo trì bị chặn; bản hoạt động/young/legacy được giữ. |

## Kết quả kiểm tra

- Bộ kiểm tra chung: **125 kiểm thử, 123 đạt, 2 bỏ qua theo thiết kế** vì cần bật emulator; không có kiểm thử thất bại. Lint không cảnh báo; cú pháp Apps Script/manifest/cấu hình triển khai hợp lệ; dựng production thành công.
- Bộ emulator chạy riêng: **8/8 đạt**, gồm Rules/lease/ma trận quyền và backup/restore bằng SDK Firestore thật. Chỉ dùng project demo-khl-review tại 127.0.0.1:8185 và dữ liệu giả. Không dùng credential thật.
- Sau thay đổi cuối về tóm tắt tiến độ phục hồi và giới hạn metadata của job, đã chạy lại 8 kiểm thử backend, 2 kiểm thử client/backup, toàn bộ 8 kiểm thử emulator, lint và kiểm tra cú pháp; tất cả đạt.
- npm audit production: **0 cảnh báo**. Audit tất cả dependency: **5 high** ở braces, chokidar, fast-glob, micromatch và Tailwind 3. Đã xử lý đường tái hiện bằng guard, vẫn giữ cảnh báo npm để theo dõi bản vá.
- Kiểm tra browser cục bộ: trang đầu và biểu mẫu đăng nhập giáo viên mở được; viewport 375 px không tràn ngang. Không đăng nhập tài khoản thật hoặc ghi dữ liệu thật qua browser. Chưa thử trên phần cứng/trình duyệt cũ thật.

Tệp kiểm tra có thể chạy lại: npm run check; khởi động Firestore emulator rồi npm run test:rules. Bộ emulator chỉ chạy khi FIRESTORE_EMULATOR_HOST đúng 127.0.0.1:8185. Hướng dẫn triển khai mô tả các hành trình cần chạy thêm trên môi trường thử có Apps Script/Drive thật.

## Số đo và giới hạn

| Phần | Trước trong báo cáo | Sau lượt sửa | Gzip sau |
| --- | ---: | ---: | ---: |
| Chunk chính | 523,27 kB | 531,54 kB | 146,06 kB |
| Firebase | 349,26 kB | 350,21 kB | 108,09 kB |
| React | 134,07 kB | 134,12 kB | 43,06 kB |
| CSS | 120,74 kB | 120,77 kB | 19,91 kB |
| Bảng điểm giáo viên tách riêng | Trong App | 10,99 kB | 3,64 kB |
| Gửi yêu cầu hồ sơ tách riêng | Trong App | 3,79 kB | 1,76 kB |

Các tính năng an toàn và biên dịch cho trình duyệt cũ làm bundle tăng nhẹ. Lượt này giảm listener không cần thiết và tách một số phần tải sau, **không có bằng chứng tổng bundle hoặc thời gian render đã giảm**. Vite vẫn cảnh báo chunk chính và template lớn hơn 500 kB; không nâng ngưỡng để che cảnh báo. App và một số màn vẫn lớn, cần tiếp tục refactor theo feature khi có số đo thực tế.

Chuyển định danh/điểm cũ và thu hồi sharing chỉ có công cụ xem trước/áp dụng; chưa chạy trên hồ sơ/file thật. Không tự suy ra mã lịch sử, cơ sở còn thiếu hoặc đáp án không được đánh dấu. Backend mới cần triển khai cùng Rules/indexes và các cờ đúng thứ tự. Hộp thư là chặng riêng; nội dung Drive, Sheet tài khoản và bí mật máy chủ cần lưu riêng.

Bản phục hồi giữ giới hạn an toàn thay vì bỏ bớt dữ liệu: 10.000 mảnh manifest, mảnh truyền 450 KB, hộp thư 7 MB; phân công đang dùng tối đa 64 mảnh. Danh sách target generation còn giới hạn 100 KB để job không vượt kích thước tài liệu Firestore. Chưa đo quy mô rất lớn trên Netlify/Apps Script thật. Xem hướng dẫn triển khai để xử lý job bị ngắt và phạm vi không nằm trong bản lưu.
