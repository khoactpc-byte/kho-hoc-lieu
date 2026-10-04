# Sửa tiếp luồng chấm điểm — 03/10/2026

Tiếp tục từ [lượt rà soát 3](./KET_QUA_RA_SOAT_LAN_3_2026-10-03.md), kiểm tra tại máy bằng dữ liệu giả vì chưa có môi trường Firebase/Apps Script thử riêng. Thay đổi nằm trong mã nguồn, chưa triển khai hoặc chuyển dữ liệu thật.

## Các thay đổi

| Độ khó | Vấn đề | Cách xử lý trong nguồn |
| --- | --- | --- |
| Rất khó | Học sinh nhận đáp án và trình duyệt tự tính điểm | Thêm API cho đề trắc nghiệm tự chấm theo tuần. Đáp án/nội dung giáo viên nằm ngoài namespace public. Tài liệu public chỉ chứa metadata được chọn rõ từng trường. Khi chuyển một đề cũ, thay toàn bộ tài liệu public để bỏ cả trường đáp án và URL bản giáo viên. |
| Rất khó | Tự chọn bộ câu, đổi trọng số hoặc gửi điểm giả | Máy chủ chọn câu và xáo lựa chọn, cấp ID riêng cho câu/lựa chọn của từng lượt. Nộp chỉ gửi attemptId và câu trả lời; điểm, danh tính và cột điểm được lấy từ dữ liệu đã kiểm tra trên máy chủ. |
| Rất khó | Nộp hai lần hoặc mất phản hồi tạo kết quả/điểm khác nhau | Một lượt đang mở cho mỗi học sinh/đề/phiên bản. Giao dịch lưu bài và điểm cùng lúc. Gửi lại lượt đã nộp trả kết quả đã lưu, không chấm lại câu trả lời mới. |
| Khó | Đề sửa hoặc thu hồi giữa lúc học sinh làm | Lượt gắn phiên bản đề. Máy chủ từ chối nộp nếu đề đổi phiên bản hoặc bị thu hồi; mở lại bài nhận lượt mới. Đây là chính sách chủ động, không âm thầm chấm theo đề khác. |
| Khó | Cờ ẩn điểm chỉ ẩn giao diện | Phản hồi học sinh lược cả score/total/percent khi giáo viên chọn ẩn điểm; luôn bỏ đáp án và đúng/sai từng câu. Kết quả đầy đủ chỉ dành cho giáo viên, qua rules dự thảo. |
| Rất khó | Điểm tự động ghi đè sửa tay, kể cả 0 hoặc ô đã xóa có chủ ý | Điểm máy chủ chỉ thay ô trống chưa có nguồn hoặc điểm tự động cùng đề. Giữ nguồn manual/manualCleared/random và điểm chưa rõ nguồn. Ghi FieldPath để giữ nguyên khóa học sinh có dấu câu. |
| Rất khó | Mở lại bài xóa nhầm điểm, tạo lại lượt cũ hoặc xóa bài vừa nộp | API mở lại tối đa 100 lượt trong một giao dịch; kiểm tra thời điểm nộp, phạm vi và nguồn điểm. Chỉ dọn ô do chính lượt đang xóa tạo ra; dọn slot/lượt/kết quả cùng lúc. Lượt bị xóa không thể nộp lại. |
| Khó | Phiên Firebase thuộc app khác, phân công giáo viên đã thay đổi | API xác minh ID token có kiểm tra thu hồi, đối chiếu appId. Mỗi thao tác giáo viên kiểm tra lại phiên Apps Script, teacherId, sessionVersion và phân công hiện tại. Học sinh được đối chiếu hồ sơ đang tồn tại, mã, khối, cơ sở, năm học và khóa nhập liệu. |
| Khó | Năm trong claims dùng dạng 2026/27 khiến truy vấn không khớp | Chuẩn hóa năm học trong cầu xác thực trước khi cấp claims. Truy vấn học sinh chỉ nhận header của đề đã chuyển sang máy chủ, đúng năm/cơ sở/khối. |
| Khó | Hủy/timeout hoặc đổi tài khoản vẫn nhận phản hồi cũ | Client kiểm tra tài khoản trước/sau lấy token, chờ HTTP và đọc JSON. Hủy/timeout bao phủ cả các bước này. App bỏ phản hồi của màn hình cũ và bản nháp riêng theo attemptId. |
| Khó | Xóa nội dung đang soạn trước khi biết lưu thành công | Áp dụng ngay trong luồng hiện tại: lưu trước, chỉ dọn trình soạn khi thành công và vẫn ở cùng màn hình. Luồng máy chủ xóa đáp án bằng giao dịch có kiểm tra phiên bản. |
| Khó | Hai lần lưu đề chạy song song hoặc kết quả lưu/Drive muộn cập nhật bài khác | Dùng chung khóa lưu, kiểm tra màn hình khi hoàn tất và trước khi gắn Google Doc; thông báo muộn không sửa màn hình mới. Áp dụng cả luồng hiện tại. |
| Vừa | Lặp cấu hình Firebase Admin; chấm thập phân sai tại ngưỡng đạt | Dùng chung khởi tạo Firebase Admin cho cầu đăng nhập/API chấm bài. Tính điểm bằng đơn vị nguyên 1/10.000 và so mức đạt bằng điểm thực, không dùng phần trăm đã làm tròn. |

Mã chính: `netlify/lib/serverQuiz.mjs`, `netlify/lib/firebaseServer.mjs`, `netlify/functions/quiz.mjs`, `src/services/serverQuizClient.js` và các điểm nối trong `src/App.jsx`.

## Kiểm chứng tại máy

- Bộ kiểm tra được mở rộng lên **91 test**. Service thật chạy với mô hình giao dịch giả có commit nguyên tử, kiểm tra đọc trước ghi và tuần tự hóa giao dịch. Đây không phải emulator hoặc cơ sở dữ liệu thật.
- Kiểm tra chống gửi điểm/danh tính giả, câu/lựa chọn ngoài lượt đã cấp, nộp trùng, hai lần mở cùng lúc, lỗi commit, thay/thu hồi đề, khóa năm, đổi mã học sinh, ẩn điểm, giữ điểm 0/sửa tay và mở lại bài.
- Client thật chạy với Auth/HTTP giả: hủy, đổi tài khoản, timeout khi chờ token và JSON, lỗi HTTP. Handler nộp/xóa lấy từ App thật được chạy với các dependency giả để xác nhận không tự chấm/ghi Firebase ở nhánh máy chủ, không mất trình soạn khi lưu lỗi hoặc đã chuyển màn hình.
- Có bản dựng riêng với hai cờ frontend bật để kiểm tra nhánh mã chuẩn bị. Cờ trong cấu hình mẫu vẫn **false**; bản này chỉ được tạo trong `node_modules/.server-quiz-build-check`, không triển khai.
- Không gọi Firebase, Apps Script, Drive, AI hoặc thay dữ liệu thật trong các kiểm thử.

Kết quả cuối: **91/91 test đạt**, lint không lỗi/cảnh báo, cú pháp hai Apps Script và manifest hợp lệ, build thành công, `git diff --check` đạt với cấu hình Git của dự án. Bản mặc định: App **523,27 KB / 143,03 KB gzip**, mẫu sổ **898,63 KB / 141,79 KB gzip**; cảnh báo chunk 500 KB vẫn còn. Không đổi dependency trong lượt này. Lần kiểm tra đầu phát hiện lỗi lint thiếu `cause` khi bọc lỗi JSON; đã sửa trước lần kiểm tra đạt cuối cùng.

## Giới hạn và việc còn lại

**K03 mới tiến thêm một luồng, chưa hoàn tất phân quyền toàn dự án.** Luồng mới chỉ dành cho đề trắc nghiệm tự chấm theo tuần. Quiz nhanh trong tài liệu, đề thủ công/phần tự luận, theo dõi tiến độ, lịch sử/tổng hợp kết quả học sinh, yêu cầu hồ sơ và một số thao tác giáo viên vẫn cần API/quyền hoàn chỉnh. API hiện trả kết quả của đề đang mở; chưa thay toàn bộ các màn hình tổng hợp kết quả cho học sinh. Không bật đồng loạt các cờ hoặc triển khai rules dự thảo trên hệ thống đang chạy.

API giới hạn 30 lượt chưa đạt mỗi học sinh/phiên bản; giáo viên mở lại khi cần. Lượt nộp tự động khi rời trang được ghi là kết thúc. Luồng mở lại máy chủ hiện từ chối gộp lượt mới với bài cũ hoặc tự luận, tránh xóa một phần nhưng báo thành công.

Đề cũ chưa tự chuyển hàng loạt. Chuyển từng đề cần phiên giáo viên, phiên bản/thời điểm đã đọc và metadata hợp lệ; phải kiểm chứng với dữ liệu thử trước. Các phiên bản đã thay đổi khiến lượt đang mở phải làm lại. Học sinh có hồ sơ hoặc mã thay đổi cần đăng nhập lại.

Rules dự thảo đã chặn học sinh đọc trực tiếp kết quả chứa đáp án của luồng mới và chặn giáo viên ghi đề trực tiếp. **Chưa biên dịch/kiểm thử rules bằng emulator, chưa thử nhiều tài khoản thật.** Kiểm tra hồi quy mô phỏng không chứng minh quyền trên dự án đang triển khai. Chu kỳ hết hạn phiên học sinh, quyền sửa điểm theo môn và quyền các luồng còn lại cần hoàn thiện khi xử lý toàn bộ K03.

Backup trình duyệt hiện chưa bao phủ ba collection riêng `server_quizzes`, `server_quiz_attempts`, `server_quiz_slots`; cần backup/restore máy chủ và dọn dữ liệu an toàn trước khi dùng luồng mới trên dữ liệu thật. Các việc K02/K01/K07/K08/K10 còn lại trong báo cáo lượt 3 vẫn chưa được coi là xong.

Chưa commit, push, deploy hoặc tắt PC. Điều kiện “sửa xong” của yêu cầu tắt máy trước đó chưa đạt khi phần quyền và dữ liệu thật còn cần kiểm chứng.
