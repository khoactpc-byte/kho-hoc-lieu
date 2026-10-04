> Báo cáo giai đoạn trước. Kết quả mới nhất, thay đổi tiếp theo và các phần còn chờ nằm trong [báo cáo lượt 2](./KET_QUA_TOI_UU_LAN_2_2026-10-03.md).

# Kết quả sửa nhóm khó — 03/10/2026

## Phạm vi thực tế

Đã sửa các luồng dữ liệu quan trọng trên workspace hiện tại, giữ các thay đổi có sẵn. Chưa commit, chưa deploy web/Firebase/Apps Script, chưa chạy migration điểm và chưa ghi dữ liệu thử vào hệ thống thật. Không coi toàn bộ K01–K10 đã hoàn tất.

| Mã | Đã làm trong mã nguồn | Trạng thái và phần còn lại |
| --- | --- | --- |
| K01 | Ô điểm/nhận xét theo mã học sinh; cập nhật bảng nhanh, sổ điểm, học bạ và hành trình học sinh; phân trang nhóm 40 thay cho bỏ học sinh phía sau; chuyển điểm cũ bằng giao dịch có danh sách đối chiếu | Đã sửa luồng mới, chưa chuyển dữ liệu thật. Cần roster đúng thời điểm nhập điểm. Sổ quá lớn để chứa cả bản đối chiếu sẽ dừng thay vì vượt giới hạn tài liệu. |
| K02 | Sao lưu 17 collection, gồm nhật ký chuyển năm, settings và nội dung phân công đã ghép đủ mảnh; lấy mới từ máy chủ; kiểm tra ID/trùng/count; phục hồi dữ liệu và con trỏ phân công trong cùng giao dịch; hộp thư thiếu không bị hiểu thành rỗng; sao lưu an toàn thất bại thì dừng | Hoàn tất phần phục hồi giới hạn tại trình duyệt. Chưa có job máy chủ để phục hồi lớn, tiếp tục giữa chừng và khóa toàn bộ người ghi. Dữ liệu chính và hộp thư Google Sheet vẫn là hai hệ thống riêng. |
| K03 | Thêm bản nháp cầu xác thực Netlify ↔ Apps Script ↔ Firebase custom token; danh tính học sinh được máy chủ tra cứu; truy vấn theo vai trò có cờ tắt mặc định; bỏ mẫu rules cho phép mọi người đã đăng nhập đọc toàn bộ dữ liệu riêng | **Chưa hoàn tất. Không bật cờ hoặc deploy rules này.** Còn phải chuyển phát đề/chấm trắc nghiệm sang máy chủ, thu hồi quyền Firestore khi khóa tài khoản, cập nhật mọi listener và metadata cũ, kiểm thử rules với emulator/test project. |
| K04 | DOMPurify ở bản tin, bài học, đề, AI, nội dung dán và mở lại trình soạn thảo; chặn script/event handler/URL nguy hiểm; giới hạn iframe Drive/YouTube, giữ bảng và MathML | Đã kiểm thử tại máy. Cần kiểm tra thêm các mẫu nội dung thật sau triển khai. |
| K05 | Đọc đủ các trang Drive; chặn kết quả lỗi/thiếu/lặp; bỏ việc tự xóa ghim từ danh sách trả về; bỏ qua kết quả cũ khi đổi phạm vi | Đã sửa và kiểm thử tại máy. |
| K06 | Hook giữ bản nháp sổ điểm theo tài liệu; gộp cập nhật ở ô khác; phát hiện xung đột cùng ô; giữ thay đổi gõ trong khi đang lưu; chấm bài ghi đúng ô bằng giao dịch | Đã sửa và kiểm thử hook thật với backend giả. Chưa kiểm tra hai tài khoản thật đồng thời. |
| K07 | Ghi các mảnh theo generation mới, kiểm tra SHA-256/số lượng/thứ tự; chỉ đổi con trỏ khi ghi đủ; đối chiếu cả bản gốc lúc bắt đầu sửa và bản máy chủ lúc công bố, kể cả định dạng cũ; giữ bản nháp khi nhận cập nhật và khi gõ tiếp trong lúc lưu | Đã sửa và kiểm thử hook/service thật bằng backend giả. Giữ generation cũ để đối chiếu; chưa có công cụ dọn generation cũ/mảnh bỏ dở. |
| K08 | ID đích ổn định; nhật ký job và từng lượt chạy; khóa lượt có thời hạn; checkpoint cùng giao dịch ghi học sinh; kiểm tra dữ liệu xem trước/điểm bị thay đổi; kiểm tra trùng danh tính và hồ sơ đích; POST Sheet có khóa, số lượt chống request cũ; đồng bộ năm Firebase/Script Properties, gồm đổi năm trong cài đặt; khóa append và metadata của đăng ký công khai | Đã hoàn thiện thêm mã nguồn và kiểm thử giả lập. Chưa triển khai/kiểm tra trên dữ liệu thật. Các mã HS đã có trước registry mới cần đối soát/backfill trước khi nhiều admin cấp mã đồng thời. Chưa có maintenance lock áp dụng cho mọi writer; không coi nhiều nhóm ghi hoặc Firebase + Sheet là một giao dịch nguyên tử. |
| K09 | Phiên giáo viên kiểm tra lại trạng thái/version tài khoản trên máy chủ; hộp thư xác định người nhận từ phiên học sinh; upload học sinh có quyền một lần gắn với folder/MIME/tên/kích thước và giới hạn 20 MB; giới hạn lần đăng nhập | Đã sửa nguồn Apps Script và frontend, kiểm thử mock. Chỉ có hiệu lực sau deploy Apps Script mới. Chưa thay mô hình chia sẻ tệp Drive đang public qua link. |
| K10 | Tách đọc Drive, sao lưu/phục hồi, phân công chia mảnh, chuyển học sinh, lưu bài học, danh tính và bản nháp sổ điểm thành service/hook; gom hàm khóa điểm, kiểm tra sao lưu, HTML và so sánh bản nháp | Đợt tách đầu đã làm. App và các màn hình lớn vẫn cần tách tiếp theo tính năng; chưa coi việc giảm kích thước/tổ chức toàn bộ App đã hoàn tất. |

Sửa kèm M01/M02/M03 vì liên quan trực tiếp: giữ điểm số 0, từ chối nhập ngoài 0–10; thông báo riêng khi bài đã nộp nhưng điểm chưa đồng bộ; autosave chụp đúng tài liệu, thử lưu trước khi chuyển màn hình, giữ bản nháp thất bại và phát hiện bài học có người khác vừa sửa. Bản nháp bài học được giữ trong phiên đang mở; chưa bảo đảm sống qua đóng tab hoặc tải lại.

## Cách đối chiếu điểm cũ

1. Tạo bản sao lưu mới và dừng sửa điểm trong lúc chuyển.
2. Mở đúng năm, cơ sở và khối. Điểm dạng số dòng sẽ có khung yêu cầu đối chiếu.
3. Danh sách phải đúng **thứ tự lúc điểm được nhập**, không chỉ đúng tên hiện tại. Nếu đã thêm/xóa/đổi tên/sắp xếp học sinh, không xác nhận danh sách hiện tại khi chưa có bằng chứng.
4. Có thể dán mảng JSON theo thứ tự cũ, với `id`, `accessCode` hoặc `studentKey` của hồ sơ đúng. Không dùng thông tin nhạy cảm khác làm khóa.
5. Sau khi xác nhận, giao dịch kiểm tra lại dữ liệu trên máy chủ, chuyển các khóa ô và giữ dữ liệu cũ trong trường `migration`. Thiếu mã, trùng mã, hai giá trị vào cùng ô hoặc quá kích thước sẽ dừng.
6. Kiểm tra tối thiểu một học sinh đầu/cuối nhóm, học sinh từng đổi tên/chuyển lớp, các điểm 0 và số liệu học bạ trước khi tiếp tục nhập liệu.

Không có roster lịch sử thì phần đó phải giữ ở trạng thái cần đối chiếu; không suy đoán tự động.

## Sao lưu và phục hồi

- Các collection: students, scorebooks, class_attendance, class_timetables, class_schedules, news, student_profile_requests, admission_applications, materials, lesson_notes, lesson_quizzes, quiz_results, quick_quiz_results, lesson_progress, handwritten_submissions, student_code_registry, school_year_jobs.
- Phân công Trần Hưng Đạo được sao lưu bằng nội dung ghép từ generation đang công bố. Thiếu mảnh hoặc sai hash sẽ không tạo snapshot thành công.
- Chỉ phục hồi/prune các collection có trong bản sao lưu; bản cũ thiếu collection khác không làm trống chúng.
- Giới hạn giao dịch trình duyệt: tối đa 350 thao tác tài liệu và phần payload thao tác dưới 7 MiB; Firestore vẫn có thể từ chối giới hạn kích thước/index khác. Từ chối trước khi sửa dữ liệu chính khi biết vượt giới hạn. Mảnh phân công có thể đã được staging, nhưng con trỏ cũ vẫn giữ nguyên nếu giao dịch cuối thất bại.
- Không đổi/xóa generation cũ trong đợt này. Điều này bảo toàn đối chiếu nhưng tốn thêm lưu trữ.
- Snapshot đọc từng collection từ máy chủ, **không phải ảnh chụp nguyên tử toàn hệ thống**. Manifest ghi rõ `consistency: server-reads-per-collection`. Cần dừng nhập liệu khi tạo bản dùng để phục hồi.
- Chưa chứa file Drive thực tế, tài khoản giáo viên trên Sheet, audit log, hoặc mọi subcollection lịch sử. Bản sao lưu không thay thế việc sao lưu Google Drive/Sheet.
- Nếu dữ liệu chính phục hồi xong nhưng hộp thư lỗi, thông báo nói rõ phần đã hoàn tất. Không coi hai hệ thống được rollback cùng nhau.

## Triển khai phần đã hoàn tất

**Không deploy riêng frontend mới trước khi cập nhật cả hai Apps Script.** Các action xác thực học sinh và ghi Sheet mới chưa có trên bản server cũ.

1. Giữ backup nguồn Apps Script hiện tại và một bản sao dữ liệu. Thử trên bản sao/test project trước.
2. Script chính: cập nhật `apps-script/code_hoclieu.gs`, giữ các Script Properties đang dùng. Thêm `APP_REGISTRATION_WEB_APP_URL` bằng URL `/exec` của script đăng ký. Deploy phiên bản mới trên cùng deployment/URL. Endpoint GET phải hiển thị version `2026-10-03-data-hardening-v4`.
3. Script đăng ký: cập nhật `apps-script/dang-ky-hoc-sinh/code_dangky.gs`, giữ `Index.html`/manifest đang dùng. Kiểm tra `APP_MAIN_WEB_APP_URL` trỏ script chính và `APP_CLIENT_TOKEN` khớp. Deploy phiên bản mới trên cùng URL.
4. Kiểm tra HS có mã trong cột 50 của Sheet; cột 52/53/55 lần lượt là lớp hiện tại/năm học/mã cơ sở. Đăng nhập học sinh giờ yêu cầu phiên máy chủ; hồ sơ có trong Firebase nhưng chưa có mã trên Sheet sẽ cần đồng bộ trước.
5. Kiểm thử trên dữ liệu thử: đăng nhập học sinh, hộp thư đúng người/lớp/năm, upload ảnh/PDF, khóa giáo viên rồi thử action AI, đồng bộ/duyệt lại một đăng ký, chuyển lại cùng năm, chỉnh cùng ô từ hai phiên.
6. Chạy `npm run check`, sau đó mới triển khai frontend. Giữ `VITE_SCOPED_AUTH_ENABLED=false` trong đợt này. Chưa deploy `firestore.rules.secure-ready`.
7. Trước lần chuyển năm đầu, kiểm tra `CURRENT_SCHOOL_YEAR` của script đăng ký khớp năm hệ thống Firebase. Các trường `schoolYearChangeSequence` ở Firebase và `CURRENT_SCHOOL_YEAR_SEQUENCE`/`CURRENT_SCHOOL_YEAR_ATTEMPT` ở Script Properties được quản lý bởi luồng mới; không xóa/đặt lại khi deploy. Sau phục hồi dữ liệu cũ cần đối soát các số lượt này trước khi chuyển năm tiếp.

Không bật luồng cũ bằng cách hạ kiểm tra quyền nếu deploy lỗi; kiểm tra phiên bản server và Script Properties trước.

## Cấu hình cho bản nháp K03

File `netlify/functions/identity.mjs` cần Node phù hợp firebase-admin đang dùng và các biến **chỉ đặt ở máy chủ Netlify**, không dùng tiền tố `VITE_` cho bí mật:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: service account của đúng Firebase project.
- `APPS_SCRIPT_URL`, `APPS_SCRIPT_CLIENT_TOKEN`: cấu hình kết nối script chính.
- `IDENTITY_BRIDGE_TOKEN`: bí mật máy chủ, phải khớp `APP_IDENTITY_BRIDGE_TOKEN` trong Script Properties của script chính.
- `KHL_APP_ID`: mặc định `kho-hoc-lieu-chinh`.

Chưa có cấu hình hoặc quyền deploy/test trong lượt này. Có endpoint và rules nháp không có nghĩa đã khép kín phân quyền. Trước khi bật: hoàn thiện server chấm/phát đề, thu hồi quyền, query và metadata cũ; kiểm thử admin/teacher/student/anonymous theo cơ sở/khối/môn và người sở hữu dữ liệu.

## Bổ sung ở lượt tiếp tục

- Bản nháp phân công cho cả hai cơ sở và Trần Hưng Đạo giữ bản gốc lúc sửa. Nhận dữ liệu mới không xóa phần đang gõ. Ghi thêm trong lúc đang lưu vẫn được giữ là thay đổi chưa lưu. Lưu thất bại được trả về màn hình; không báo thành công hoặc xóa trạng thái chưa lưu.
- Mỗi hướng chuyển năm có một job, và mỗi lần thử có một hồ sơ riêng trong `school_year_jobs`. Checkpoint và nhóm ghi học sinh commit cùng nhau. Lượt chạy giữ quyền ghi 10 phút và gia hạn sau các bước/nhóm ghi. Lượt cũ hoặc hết hạn không được chốt năm hay ghi đè trạng thái lỗi của lượt mới.
- Chạy lại lấy danh sách mới từ máy chủ, giữ hồ sơ đích đã có và đối soát lớp/kết quả trước khi tiếp tục. Dữ liệu nguồn bị thêm/xóa/sửa sau bản xem trước, điểm dùng để lên lớp bị sửa, trùng danh tính hoặc hồ sơ đích khác lớp sẽ dừng để đối soát.
- Các chunk Sheet được chạy lại và kiểm tra số dòng thành công; tiến độ được lưu sau khi Sheet phản hồi. Mất mạng ở ranh giới Sheet/Firebase vẫn có thể đã ghi ở Sheet. Lần chạy lại đối chiếu và ghi lại cùng nội dung; không khẳng định checkpoint có thể rollback Sheet.
- Chỉ đổi năm Firebase sau khi máy chủ đăng ký xác nhận năm mới. Nếu Firebase chốt thất bại sau khi Script Properties đổi, trạng thái lỗi yêu cầu chạy lại đúng hướng cũ. Số lượt tăng dần ngăn request cũ quay lại sửa năm/lớp sau lượt mới.
- Đăng ký công khai recheck mã định danh và năm sau upload; append, lấy số dòng và ghi metadata cùng giữ ScriptLock. File đã upload có thể còn lại nếu kiểm tra cuối hoặc ghi Sheet thất bại; chưa có job dọn file mồ côi.
- Cần dừng sửa dữ liệu và khóa nhập liệu năm nguồn khi vận hành chuyển năm. Lease mới chỉ khóa các luồng đổi/chuyển năm mới, chưa phải khóa mọi client, script hoặc người sửa Sheet bằng tay. Trạng thái sau sự cố cần được admin đối chiếu trước khi tiếp tục.

## Kiểm chứng

- 58/58 test đạt ở lần chạy toàn bộ cuối; gồm 30 test mới cho logic đang dùng, hook/service thật với backend giả, render sổ điểm 45 học sinh, Apps Script qua VM/mock.
- Lint quét thêm hooks/services và đạt.
- Build production đạt; còn cảnh báo chunk App/mẫu sổ điểm lớn. Chưa giải quyết toàn bộ mục tiêu kích thước bundle.
- Cú pháp hai Apps Script được parse trong test; Netlify identity parse bằng Node.
- `git diff --check` đạt.
- Mở trang đầu và hộp đăng nhập giáo viên trên bản local: không có lỗi JavaScript ở lần quan sát đó. Chưa đăng nhập/ghi dữ liệu thật hoặc kiểm tra đầy đủ mọi màn hình.
- `npm audit --omit=dev`: 0 cảnh báo. Còn 9 cảnh báo ở phụ thuộc dùng để phát triển theo lần cài gần nhất; không dùng `audit fix --force`.
- Đã khóa `@grpc/grpc-js` bản có vá và `uuid` dưới gaxios vào nhánh đã vá. Cần theo dõi override khi nâng Firebase/firebase-admin; đây không phải lời khẳng định mọi phụ thuộc đều an toàn tuyệt đối.

## Việc tiếp theo cần giữ cho model chính

1. K03: khép kín phát đề/chấm điểm trên server và quyền Firebase, test emulator rồi rollout có kế hoạch trở về bản cũ.
2. K02: job phục hồi lớn có maintenance lock được mọi writer tôn trọng, checkpoint, backup trước và kiểm tra sau; không nối nhiều batch trình duyệt rồi gọi là nguyên tử.
3. K01: đối soát roster và chạy migration dữ liệu thật; xử lý sổ quá lớn bằng bản lưu đối chiếu riêng trên máy chủ.
4. K08: kiểm thử triển khai job chuyển năm và đồng bộ cấu hình trên bản sao dữ liệu; đối chiếu registry mã cũ; kết hợp maintenance lock với K02/K03. Mã nguồn nhật ký/checkpoint và đồng bộ năm đã được bổ sung trong lượt tiếp tục.
5. K10: tách tiếp các tính năng lớn sau khi các hợp đồng dữ liệu trên đã ổn định.

Các việc dễ E01–E05 vẫn có thể giao Luna theo báo cáo rà soát, nhưng không để Luna xóa các service/test mới chỉ vì chưa hiểu nhánh migration hoặc cờ tính năng.

## Yêu cầu tắt máy

Người dùng yêu cầu tắt PC sau khi sửa xong. Chưa gửi lệnh tắt: toàn bộ nhóm khó chưa hoàn tất, đặc biệt K03/K02 và đối chiếu điểm thật K01. Cần quyền truy cập dự án thử Firebase/Apps Script và roster lịch sử để tiếp tục phần kiểm chứng/đối soát phụ thuộc dữ liệu ngoài workspace. Không coi 58 test local đạt là bằng chứng đã hoàn tất hệ thống thật. Các thay đổi và bản build đã được lưu trên máy.
