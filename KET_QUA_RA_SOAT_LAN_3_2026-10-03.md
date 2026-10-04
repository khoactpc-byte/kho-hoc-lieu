# Rà soát và sửa tiếp lần 3 — 03/10/2026

Đã tiếp tục tự xử lý cả lỗi lớn và nhỏ, không giao Luna. Các thay đổi được lưu trong mã nguồn tại máy. Báo cáo này bổ sung [lượt 2](./KET_QUA_TOI_UU_LAN_2_2026-10-03.md); kết quả những lượt trước vẫn giữ để đối chiếu.

## Lỗi phát hiện và cách đã sửa

| Độ khó | Lỗi và ảnh hưởng | Cách sửa trong nguồn |
| --- | --- | --- |
| Rất khó | “Điền điểm còn thiếu” ghi đè điểm đã có | Chỉ chọn ô trống, bỏ qua điểm 0, bản nháp, điểm tự động và ô đã xóa có chủ ý. Giao dịch kiểm tra lại trên máy chủ trước khi điền. |
| Rất khó | Lưu thất bại khôi phục cả bảng cũ, mất thay đổi khác hoặc cập nhật nhầm sổ sau khi chuyển khối | Bỏ cập nhật lạc quan cả bảng. Lưu từng ô bằng FieldPath, so sánh giá trị/nguồn cũ; nhận dữ liệu đã xác nhận từ listener. Bản nháp riêng theo sổ và tài khoản. |
| Khó | Xóa điểm bỏ sót số 0, xóa cột tính toán hoặc mất nháp trước khi lưu thành công | Chỉ xóa cột cho phép sửa; coi 0 là điểm. Dọn nháp sau commit và chỉ khi người dùng chưa nhập giá trị mới. |
| Khó | Khóa năm học và phạm vi sổ chỉ kiểm tra trên giao diện cũ | Giao dịch điểm nhanh, sổ chính, đồng bộ, chấm/xóa bài đọc lại khóa và phạm vi tài liệu. Các kiểm tra service chưa thay thế Firestore Rules. |
| Rất khó | Xóa lượt nộp và điểm riêng lẻ; lỗi dọn điểm bị nuốt nhưng vẫn báo thành công | Đọc/đối chiếu toàn bộ lượt nộp và sổ trước khi xóa chúng trong một giao dịch. Lỗi hoặc bài vừa chấm lại làm toàn bộ thao tác bị từ chối. Giới hạn 350 tài liệu mỗi lần. |
| Khó | Điểm tự động thiếu nguồn; cho làm lại có thể xóa điểm sửa tay | Nguồn mới lưu quizId, attemptId và loại bài. Chỉ xóa điểm của lượt đang xóa; giữ điểm manual/manualCleared/random hoặc điểm cũ thiếu nguồn, báo số ô cần đối chiếu. |
| Khó | Học sinh trùng tên bị ghép bài/điểm | Bỏ ghép theo tên ở bảng điểm và bảng lượt làm bài; dùng mã HS hoặc studentId. Nút cho từng học sinh làm lại và mở bài tự luận dùng cùng khóa danh tính. |
| Rất khó | Bài chấm và điểm lưu riêng, có thể tạo lại bài bị xóa | Lưu bài giáo viên chấm, trạng thái đồng bộ và ô điểm trong cùng giao dịch; kiểm tra bản bài đã xem. Giữ điểm sửa tay trong sổ để đối chiếu. |
| Rất khó | Kết quả AI muộn tạo lại bài đã xóa, ghi vào tệp thay thế hoặc hạ trạng thái giáo viên đã duyệt | Mỗi lượt AI có mã riêng; kiểm tra bài còn tồn tại, fileId, lượt đang hiệu lực và khóa năm. Chặn chấm trùng đang chạy; AI không hạ trạng thái teacher_reviewed. |
| Khó | Nộp lại cùng lượt trắc nghiệm ghi đè kết quả | Tạo lượt trong giao dịch, đọc lại khóa năm và từ chối ID đã tồn tại. Cập nhật trạng thái đồng bộ bằng update để không tạo lại bài bị xóa. |
| Rất khó | Sổ chính lưu song song; xác nhận cũ ghi đè dữ liệu mới nhận | Chặn hai lần lưu đang chạy; gắn mã xác nhận riêng. Giữ nội dung nhập trong lúc chờ và snapshot mới đến sau xác nhận. Điểm sửa ở sổ chính có nguồn manual. |
| Rất khó | Hủy/timeout đăng nhập trong lúc Firebase đổi token vẫn để quyền tồn tại | Tín hiệu hủy đi xuyên suốt; thao tác token xếp hàng. Nếu sign-in hoàn tất muộn sau hủy, sign-out trước khi giải phóng hàng đợi. Kiểm thử cả hủy mà không logout. |
| Khó | Nút hủy chỉ ẩn hộp đăng nhập; phản hồi cũ vẫn mở tài khoản | Hủy request, tăng phiên kiểm tra, dọn trạng thái và mật khẩu. Phản hồi cũ không cập nhật giao diện. Áp dụng học sinh và nhân viên. |
| Khó | Phục hồi merge giữ trường phát sinh sau backup | Thay đúng thiết lập đã sao lưu, chỉ giữ trường xác thực hiện có; không lấy mật khẩu từ backup. Tính cả thiết lập trong giới hạn dung lượng trước khi tạo mảnh phục hồi. |
| Khó | Sao lưu lấy thiết lập/con trỏ phân công thay đổi giữa lúc đọc | Đối chiếu lại bằng giao dịch chỉ đọc trước khi trả backup. Ghi rõ phân công rỗng để phục hồi được trạng thái rỗng. |
| Khó | Chọn năm học bằng chuỗi không chuẩn; claims chứa hồ sơ tương lai | Chuẩn hóa gạch/slash/năm rút gọn; phát hiện hồ sơ trùng cùng năm. Từ chối nếu chưa cấu hình năm hiện tại. Claims chỉ chứa hồ sơ đủ điều kiện. |
| Khó | Cầu chuẩn bị dùng chung UID giữa appId; rules chưa ràng buộc appId | Băm appId cùng danh tính vào UID, dùng Admin app có tên riêng. Bản rules chuẩn bị yêu cầu claims.appId khớp namespace. Chưa bật cầu hoặc triển khai rules. |

Đã tách nghiệp vụ vào `src/services/scorebookCells.js`, `quizScorebook.js`, `src/hooks/useQuickScorebook.js` và `useQuickScoreActions.js`. App giảm từ khoảng 10.550 xuống 10.200 dòng. Tổng mã thực thi tăng nhẹ do bổ sung kiểm tra và giao dịch; không che cảnh báo dung lượng build.

## Kiểm chứng

- Kiểm tra đầy đủ: **78/78 test đạt**, lint không lỗi/cảnh báo, cú pháp hai Apps Script và manifest hợp lệ, build thành công. Mock giao diện thiếu hai export Firebase trong lần chạy đầu đã được sửa trước lần kiểm tra đạt.
- Service/hook/component thật chạy với SDK/backend giả, không ghi Firebase hoặc gọi AI thật. Đã kiểm tra commit thất bại, xung đột cùng ô, giữ ô khác, điểm 0, cột tính toán, nhập trong lúc lưu, chuyển sổ/tài khoản, bài bị xóa, AI hết hiệu lực và nộp trùng.
- Cầu Netlify được kiểm thử với SDK giả: đúng Admin app, UID riêng từng appId, loại hồ sơ tương lai, giữ đủ chữ số khối. **Chưa kiểm thử rules bằng emulator hoặc tài khoản thật.**
- Trình duyệt `127.0.0.1:5174`: trang đầu, mở đăng nhập giáo viên, thông báo nhập thiếu và nút hủy. Log lỗi JavaScript ở lần quan sát rỗng. Không nhập thông tin xác thực hoặc sửa dữ liệu thật.
- App build **520,27 KB / 142,14 KB gzip**; mẫu sổ điểm **898,63 KB / 141,79 KB gzip**. App và mẫu còn vượt cảnh báo chunk 500 KB. Không đổi thư viện trong lượt này; npm audit của lượt 2 là số đo gần nhất.
- `git diff --check` đạt.

Ảnh: `C:/Users/khoac/.codex/visualizations/2026/10/02/01a0fe24-790a-73f3-a3cf-a2d905be75cd/kiem-tra-web-lan-3.png`.

## Phần chưa hoàn tất

Không thể khẳng định toàn bộ dự án hết lỗi từ các kiểm thử trên. Những phần dưới đây còn công việc trong mã/kiến trúc và cần môi trường thử để hoàn thiện:

1. **K03 — phân quyền/chấm bài máy chủ:** cờ VITE_SCOPED_AUTH_ENABLED vẫn false. Còn tách đáp án, chấm/lưu kết quả đáng tin cậy trên máy chủ, quyền cho mọi luồng, thu hồi quyền khi khóa tài khoản, metadata/index và kiểm thử các vai trò. Rules chưa được biên dịch bằng emulator hoặc triển khai.
2. **K02 — phục hồi lớn:** chưa có job máy chủ tiếp tục được sau lỗi và maintenance lock bắt buộc. Backup chưa có mọi subcollection, nội dung Drive và Sheet tài khoản; collection không chụp cùng thời điểm. Phục hồi trình duyệt từ chối quá 350 thao tác hoặc 7 MiB; chưa ngăn tài liệu mới phát sinh sau khi đọc danh mục. Firebase và Sheet không cùng giao dịch.
3. **K01/K08 — dữ liệu cũ:** điểm theo dòng cần roster đúng thời điểm nhập; bài thiếu mã và điểm thiếu nguồn cần đối soát. Không tự đoán/chuyển dữ liệu thật. Chuyển năm/registry còn cần backfill và thử đồng thời.
4. **K07/K10 — bảo trì:** chưa có công cụ dọn generation an toàn; App và màn hình quản trị còn lớn. Cần tách tiếp theo nghiệp vụ và đo tải/in trên thiết bị học sinh. Năm cảnh báo dev dependency của lượt 2 chưa xử lý bằng nâng Tailwind major.
5. **Triển khai và thử nhiều tài khoản:** chưa có môi trường Firebase/Apps Script thử được cung cấp. Cần thử giáo viên–học sinh–quản trị, thao tác đồng thời và nội dung/in thật, rồi triển khai theo [hướng dẫn](./HUONG_DAN_CAP_NHAT_APPS_SCRIPT.md).

Thay đổi nằm tại máy; chưa commit/push/deploy. Chưa tắt PC vì điều kiện “sửa xong” của yêu cầu trước chưa đạt khi các phần trên vẫn còn.
