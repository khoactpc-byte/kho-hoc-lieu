# Triển khai các thay đổi định danh, điểm và an toàn dữ liệu

Cập nhật 04/10/2026. Đây là hướng dẫn cho bản mã nguồn đã kiểm thử tại máy; chưa thay đổi Firebase, Netlify, Apps Script hoặc tệp Drive đang chạy.

## Bộ tệp triển khai

- Apps Script chính: apps-script/code_hoclieu.gs, phiên bản 2026-10-04-teacher-password-v7. Bản này chấp nhận mật khẩu giáo viên từ 6 ký tự; biểu mẫu tạo mới điền sẵn 123456 và có nút ẩn/hiện. Sửa tài khoản để trống mật khẩu vẫn giữ mật khẩu hiện tại. Cần cập nhật deployment Apps Script để máy chủ chấp nhận mật khẩu 6 ký tự.
- Apps Script đăng ký: apps-script/dang-ky-hoc-sinh/code_dangky.gs, phiên bản 2026-10-04-location-cache-v7; cập nhật cả Index.html để dùng tải danh mục theo tỉnh và cache địa chỉ, giữ manifest của đúng dự án.
- Netlify: các function identity, session, quiz, data và system cùng netlify/lib; dùng Node theo .node-version.
- Firebase: firebase.secure-ready.json tham chiếu firestore.rules.secure-ready và firestore.indexes.secure-ready.json. Đây là bộ cấu hình chuẩn bị riêng, tránh ghi nhầm vào cấu hình đang chạy.
- Frontend: dựng lại từ cùng phiên bản mã nguồn; không dùng frontend mới bật cờ với backend cũ.

## Cấu hình và thứ tự

1. Tạo môi trường thử có Firebase/Apps Script/Drive riêng và dữ liệu giả. Không chép mật khẩu, token hoặc hồ sơ cá nhân vào báo cáo hay Git.
2. Cập nhật Apps Script chính trước, đăng ký sau. Triển khai phiên bản mới của cả hai Web App, giữ URL đang cấu hình cho môi trường đó. Xác nhận chuỗi phiên bản và thử đăng nhập, đọc danh sách, tải tệp, đổi mã, đồng bộ lại cùng job.
3. Trong Script Properties của máy chủ chính, đặt APP_IDENTITY_BRIDGE_TOKEN riêng, trùng giá trị với biến IDENTITY_BRIDGE_TOKEN phía Netlify. Giữ APP_CLIENT_TOKEN đồng nhất với APPS_SCRIPT_CLIENT_TOKEN. Client token công khai không thay thế mật khẩu hoặc bridge token bí mật.
4. Phía Netlify cấu hình FIREBASE_SERVICE_ACCOUNT_JSON, KHL_APP_ID, APPS_SCRIPT_URL, APPS_SCRIPT_CLIENT_TOKEN và IDENTITY_BRIDGE_TOKEN. Service account phải thuộc đúng project thử. Các giá trị này không có tiền tố VITE và không được đưa vào bundle.
5. Đối soát hồ sơ thiếu studentKey, grade, schoolCode và schoolYear bằng công cụ An toàn dữ liệu. Mã hiện tại được đóng băng thành khóa điểm cho hồ sơ cũ; mã lịch sử khác nhau cần đối chiếu riêng, không tự gộp. Hồ sơ trùng mã trong cùng năm bị từ chối. Chạy lại các job Sheet còn pending/failed và đối chiếu cột STUDENT_SYNC_STATE.
6. Đối soát sổ điểm còn khóa theo dòng bằng bản danh sách lịch sử đã xác nhận. Công cụ xem trước không ghi điểm. Không tự lấy danh sách học sinh hiện tại để đoán thứ tự của sổ cũ. Lưu bản sao trước khi chuyển.
7. Tài liệu thường: mở từng bản, xác nhận dành cho học sinh rồi dùng công cụ đánh dấu trong An toàn dữ liệu. Tệp thiếu phạm vi hoặc có trường đáp án không tự được công bố. Quiz cũ: giáo viên mở đề và dùng Chuyển đề cũ sang máy chủ; kiểm tra bản học sinh và đáp án riêng. Công cụ không thể suy ra đáp án nằm trong văn bản/tệp chưa được đánh dấu; phải kiểm tra nội dung thực tế.
8. Đăng nhập Admin bằng cấu hình Apps Script mới; xác nhận settings/global không còn adminPass, teacherPass, thdAdminPass. Rules từ chối nhân viên đọc global nếu còn các trường mật khẩu cũ. Mật khẩu giáo viên chỉ là hash trong Sheet tài khoản, không đưa vào Firestore.
9. Trên môi trường thử, triển khai bộ Rules và indexes với project được chỉ định rõ; đợi index sẵn sàng. Bật cùng đợt VITE_SCOPED_AUTH_ENABLED=true, VITE_SERVER_QUIZ_ENABLED=true và KHL_SERVER_QUIZ_ENABLED=true. Không dùng tổ hợp scoped=true nhưng quiz=false để phục vụ học sinh, vì Rules mới chặn đường ghi/chấm cũ.
10. Sau khi đã kiểm chứng khóa ghi bằng SDK trực tiếp và mọi API, bật KHL_MAINTENANCE_RULES_READY=true và VITE_SERVER_SYSTEM_ENABLED=true. Không bật cờ bảo trì chỉ vì kiểm thử giả tại máy đã qua.
11. Chạy các hành trình bên dưới trên môi trường thử. Chỉ phát hành lên hệ thống thật sau khi đối chiếu xong dữ liệu, quyền Drive, indexes và xác nhận bộ triển khai cụ thể. Các cờ trong .env.example vẫn tắt mặc định.

## Ma trận quyền áp dụng

| Nghiệp vụ | Admin | Giáo viên | Học sinh | THĐ |
| --- | --- | --- | --- | --- |
| Hồ sơ/registry/mã/lưu trữ/đồng bộ Sheet | Quản trị, giữ khóa bất biến | Đọc hồ sơ khối/cơ sở được giao | Hồ sơ của mình và lịch sử được gắn định danh; gửi yêu cầu sửa qua API | Không |
| Ghi chú/tài liệu thường | Quản trị | Cơ sở, khối, môn được giao | Nội dung trong phạm vi; tài liệu phải được đánh dấu an toàn | Không |
| Đáp án/private bank | API quản trị | API kiểm tra phân công hiện tại | Đề được rút gọn; không đọc bank/đáp án/SDK kết quả | Không |
| Điểm nhanh/sổ điểm | API kiểm tra ô, khóa năm, xung đột | Đọc sổ theo cơ sở/khối; chỉ ghi ô nhập của môn được giao | Xem kết quả của mình qua API | Không |
| Bài tự luận | Xem/chấm/mở lại | Phạm vi môn được giao; AI chỉ là bản nháp | Tệp có biên nhận của chính mình; nộp trong năm hiện tại | Không |
| Điểm danh | Quản trị | API kiểm tra khối/cơ sở nếu luồng được mở | Chỉ lớp trưởng, danh sách tối thiểu của lớp mình | Không |
| Thiết lập/phân công | Quản trị | Đọc thiết lập đã bỏ mật khẩu cũ | Cấu hình tối thiểu qua API | Chỉ thiết lập phân công THĐ và các trường THĐ được phép |
| Sao lưu/phục hồi/dọn dữ liệu | API quản trị, có khóa và job sở hữu | Không | Không | Không |

Sổ điểm chứa nhiều môn trong cùng tài liệu: quyền đọc của giáo viên theo cơ sở/khối, quyền ghi theo từng môn/ô. Những nhánh đọc nội dung đề/bài làm vẫn giới hạn môn. Không gọi đây là cách ly từng trường của một tài liệu Firestore.

## Hành trình phải nghiệm thu trên môi trường thử

- Hai admin cùng cấp mã: không trùng; đổi mã vẫn giữ điểm, bài làm và lịch sử. Form đang mở không đè hồ sơ vừa sửa ở phiên khác.
- Thao tác hàng loạt có một mục lỗi: danh sách thành công/lỗi khớp dữ liệu; thử lại chỉ phần lỗi. Lỗi nhật ký/Sheet không bị báo thành dữ liệu chưa ghi.
- Giáo viên A không gọi API/SDK sửa môn, khối hoặc cơ sở ngoài phân công. Khóa năm chặn ghi. Hai phiên sửa một ô nhận xung đột; ô khác được giữ.
- Học sinh không đọc được bank hoặc Google Doc giáo viên, kể cả có URL; kiểm tra quyền Drive thật, gồm quyền kế thừa từ thư mục và quyền tổ chức. Thử sửa điểm trong request không làm thay đổi kết quả.
- Nộp lại cùng lượt không tạo thêm kết quả; mở lại bài chỉ xóa điểm tự động có nguồn chứng minh được, giữ điểm sửa tay và điểm đã xóa tay.
- Hết hạn/đăng xuất/khóa tài khoản/đổi phân công: API từ chối; SDK mất quyền sau hạn lease tối đa 2 phút. Gia hạn không vượt phiên Apps Script gốc, thường tối đa 6 giờ.
- Sao lưu khi có ghi đồng thời: ghi bị chặn; bản xuất chứa đồ thị đề, lượt, kết quả, registry, điểm và các mảnh phân công. Kiểm tra checksum, số lượng và kiểu Timestamp/GeoPoint/binary/reference.
- Phục hồi hơn 350 hồ sơ và hơn 7 MB: ngắt trong kiểm chứng/lập kế hoạch/ghi, tải lại rồi tiếp tục; dữ liệu ngoài bản lưu được xử lý; hoàn tác phần đã ghi giữ bản trước đó. Thử lỗi Sheet rồi tiếp tục hộp thư mà không phục hồi Firestore lần nữa.
- Dọn generation: bản đang dùng, bản dưới 30 ngày và bản chưa có metadata thời điểm được giữ. Đổi con trỏ trong lúc dọn phải dừng lượt cũ.
- Thử trên thiết bị thật của trường; mục tiêu JavaScript là Chrome/Edge 80, Firefox 78 và Safari 13. Điều này chưa chứng minh mọi phiên bản/thiết bị cũ đều chạy được, đặc biệt SDK Firebase, CSS, WebView và trình duyệt thiếu Web Crypto.

## Sao lưu và phục hồi: phạm vi, tiến độ, giới hạn

Bản v3 gồm 21 collection công khai, settings và các collection server_quizzes, server_quiz_attempts, server_quiz_slots, server_essay_slots, server_score_audit; bao gồm generation/chunks dưới phân công. Không phục hồi phiên đăng nhập. Nội dung Drive, Sheet tài khoản giáo viên, key Gemini và cấu hình Script Properties cần bản lưu riêng. Hộp thư Sheet được kèm khi lưu lên Drive và có chặng phục hồi riêng; đây không phải snapshot nguyên tử của cả Firebase và Google Sheet.

Sao lưu quét từng chặng, giữ khóa tới khi xuất xong Firestore. Tải các mảnh hoặc ghi Drive bị ngắt có thể tiếp tục cùng job. File Drive xuất theo job được tái sử dụng khi checksum giống nhau. Danh sách job chỉ trả tóm tắt, không đưa toàn manifest hoặc dữ liệu riêng vào màn hình.

Phục hồi lần lượt tải mảnh → kiểm chứng/mối quan hệ → khóa ghi → lập kế hoạch theo trang → ghi từng giao dịch → hộp thư. Từng chặng kiểm chứng và lập kế hoạch đều có checkpoint. Khâu xem trước chỉ ghi vùng staging, không thay dữ liệu chính; hiển thị số thêm/ghi lại/xóa để quản trị xác nhận. Danh sách collection/generation được lấy lại sau khi khóa ghi, tránh bỏ sót generation xuất hiện sau xem trước. Lượt khác cùng job phải khớp revision trước khi tiến tiếp. Hồ sơ lớn được chia mảnh truyền tải, nhưng ghi/hoàn tác toàn hồ sơ trong một giao dịch.

Giới hạn hiện có: tối đa 10.000 mảnh manifest, 70 dòng/mảnh, mảnh truyền tối đa 450 KB; hộp thư tổng tối đa 7 MB và 1.000 mảnh; phân công đang dùng tối đa 64 mảnh khi kiểm chứng phục hồi. Danh sách target generation giới hạn 100 KB để job còn nằm trong giới hạn tài liệu. Firestore vẫn áp dụng giới hạn riêng cho tài liệu/giao dịch. Dữ liệu vượt giới hạn bị dừng, không tự bỏ bớt. File JSON lên Drive còn phụ thuộc giới hạn request Apps Script và bộ nhớ trình duyệt. Chưa đo tải rất lớn trên Netlify thật.

Đóng trình duyệt khi mới tải một phần: job uploading có thể hủy, chọn lại tệp rồi bắt đầu; các chặng kiểm chứng/lập kế hoạch/ghi đã bắt đầu thì có thể tiếp tục. Sau khi đã ghi dữ liệu không dùng Hủy để mở khóa; phải tiếp tục hoặc hoàn tác. Công cụ sao lưu chưa có lịch chạy tự động; hàng đợi Sheet được thử lại từ màn hình quản trị, chưa có worker lịch chạy nền riêng.

## Quay lại khi có lỗi phát hành

Giữ nguyên bản lưu trước phát hành, phiên bản frontend/functions/Apps Script và Rules/indexes đi cùng. Nếu lỗi trước khi bật quyền mới, giữ các cờ tắt. Nếu đã bật quyền mới, không chỉ tắt cờ frontend trong khi Rules mới đang chặn đường cũ; chọn bộ phiên bản đã kiểm chứng. Khi có job phục hồi đang khóa, xử lý job trước, không xóa maintenance bằng SDK để bỏ qua khóa. Không mở lại Rules rộng để chữa lỗi đọc dữ liệu.
