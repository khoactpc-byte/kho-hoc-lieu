# Rà soát web và phân công sửa — 03/10/2026

## Kết luận và phạm vi

Dự án còn nhiều cơ hội tối ưu, nhưng cần ưu tiên tính đúng của điểm, an toàn phục hồi và phân quyền trước khi dọn hoặc tách code. Có lỗi đã tái hiện bằng logic thực tế trong mã nguồn; có rủi ro được xác định qua luồng đọc/ghi nhưng chưa thử với dữ liệu thật.

Rà soát trên **workspace hiện tại, gồm các thay đổi chưa commit**, không chỉ trên HEAD. Không sửa mã ứng dụng, không xóa dữ liệu, không triển khai Firebase/Apps Script và không ghi đè báo cáo cũ `BAO_CAO_RA_SOAT_DU_AN.md`. File này là kế hoạch sửa để giao việc ở các lượt tiếp theo. Số dòng tham chiếu tương ứng thời điểm rà soát, có thể thay đổi khi sửa.

Đã đọc luồng chính trong App, các màn hình quản trị/học sinh/sổ điểm/điểm danh/thời khóa biểu, tiện ích và hai Apps Script đang được README xác định là dùng cho hệ thống. Đã kiểm tra quan hệ import để phân biệt file đang dùng với bản cũ. Chưa kiểm tra giao diện bằng trình duyệt, cấu hình rules trên Firebase thật, quyền chia sẻ Drive thật, hay phiên bản Web App đã deploy. Không coi mọi rủi ro trong code là một sự cố đã xảy ra trên production.

## Kết quả kiểm tra

| Kiểm tra | Kết quả | Giới hạn |
| --- | --- | --- |
| Kiểm thử hiện có | 28/28 đạt | Chỉ là unit test; 8 test đang kiểm tra `operations.js`, không được frontend import |
| Lint hiện có | Đạt | Chưa quét toàn bộ cấu hình và Apps Script |
| Production build | Thành công | Lần đầu bị sandbox chặn đọc thư mục cha; chạy lại với quyền phù hợp thành công |
| Cú pháp Apps Script chính và đăng ký | Đạt | Chỉ parse cú pháp, không thực thi dịch vụ Google |
| Manifest Apps Script đăng ký | JSON hợp lệ | Không xác nhận quyền đã được cấp khi deploy |
| `git diff --check` | Đạt | Có thông báo quy đổi LF/CRLF, không có lỗi khoảng trắng |
| Mô phỏng khóa điểm theo dòng | Tái hiện sai người khi chèn học sinh | Chạy cục bộ, không ghi Firebase |
| Hàm chuẩn hóa điểm thực tế trong App | `0 → ""`, `"0" → "0.0"`, `11 → "10.0"`, `"abc" → "abc"` | Được trích đúng hàm của App và chạy cục bộ |

Quy mô mã hiện tại:

- `App.jsx`: khoảng 11.475 dòng, 240 lần gọi `useState`, 54 lần gọi `useEffect`; file khoảng 802 KB.
- `AdminSettingsWorkspace.jsx` đang dùng: khoảng 6.108 dòng.
- `HocSinhManager.jsx`: khoảng 5.232 dòng.
- `ScorebookWorkspace.jsx`: khoảng 4.368 dòng.
- Bundle App chính: 483,61 KB / 126,26 KB gzip; Firebase: 465,85 KB / 109,92 KB gzip; React: 133,93 KB / 43,12 KB gzip.
- Chunk mẫu sổ điểm: 2.831,43 KB / 182,24 KB gzip. Mẫu đã được tải tách khi cần; không phải toàn bộ 2,8 MB đều tải ở trang đầu. Build vẫn cảnh báo chunk lớn.

## Cách phân loại và giao việc

**Độ khó và độ ưu tiên là hai trục riêng.** P0: có khả năng sai/mất dữ liệu hoặc thiếu kiểm soát quyền; P1: lỗi nghiệp vụ, đồng bộ hoặc tải dữ liệu cần sửa sớm; P2: tối ưu/bảo trì; P3: vệ sinh repository.

- **Rất khó:** thay mô hình dữ liệu, xác thực hoặc quy trình nhiều hệ thống; cần migration và kiểm thử tích hợp.
- **Khó:** nhiều luồng đọc/ghi phụ thuộc nhau, cần kiểm thử đồng thời hoặc bảo toàn dữ liệu cũ.
- **Vừa:** một tính năng hoặc một hợp đồng dùng chung; vẫn phải hiểu nghiệp vụ và kiểm thử lỗi.
- **Dễ:** phạm vi nhỏ, ít ảnh hưởng dữ liệu; phù hợp để giao Luna với mô tả rõ.

| Mã | Công việc | Ưu tiên | Độ khó | Giao việc |
| --- | --- | --- | --- | --- |
| K01 | Điểm gắn với học sinh thay vì thứ tự dòng; xử lý giới hạn 40 | P0 | Rất khó | Model chính |
| K02 | Sao lưu đủ dữ liệu, phục hồi an toàn và có thể tiếp tục | P0 | Rất khó | Model chính |
| K03 | Đồng nhất xác thực và phân quyền Firebase/Apps Script | P0 | Rất khó | Model chính + cấu hình dịch vụ |
| K04 | Lọc HTML khi hiển thị bản tin, bài học và AI | P0 | Khó | Model chính |
| K05 | Chặn tự gỡ ghim khi danh sách Drive chưa đầy đủ | P0 | Khó | Model chính |
| K06 | Sổ điểm không mất bản nháp/ghi đè cập nhật người khác | P1 | Khó | Model chính |
| K07 | Phân công giảng dạy chia mảnh có phiên bản nhất quán | P1 | Khó | Model chính |
| K08 | Chuyển năm, duyệt đăng ký và đồng bộ Sheet chạy lại an toàn | P1 | Rất khó | Model chính |
| K09 | Kiểm tra quyền Apps Script cho upload, hộp thư và mọi action giáo viên | P0 | Khó | Model chính |
| K10 | Tách App và các màn hình lớn theo tính năng | P2 | Khó | Model chính, chia nhiều đợt |
| M01 | Chuẩn hóa điểm: giữ 0, xử lý nhập sai rõ ràng | P1 | Vừa | Model chính hoặc Luna sau khi chốt hợp đồng |
| M02 | Nộp bài không báo đã lưu điểm khi đồng bộ thất bại | P1 | Vừa | Model chính hoặc Luna với test cụ thể |
| M03 | Autosave bài học không lưu nhầm khi đổi bài | P1 | Vừa | Model chính |
| M04 | Giảm listener và truy vấn toàn bộ collection | P1 | Vừa | Model chính, phối hợp K03 |
| M05 | Công bố thời khóa biểu và bản tin nhất quán | P1 | Vừa | Model chính |
| M06 | Kiểm thử đúng logic đang dùng; hợp nhất tiện ích trùng | P1 | Vừa | Model chính hoặc giao từng phần nhỏ |
| E01 | Xóa ba bản component cũ không được import | P2 | Dễ | Luna |
| E02 | Mở rộng kiểm tra mã và cú pháp Apps Script | P2 | Dễ | Luna, sau E01 |
| E03 | Hồ sơ chờ duyệt có timeout và dọn callback | P2 | Dễ | Luna |
| E04 | Mốc sao lưu hàng ngày theo ngày Việt Nam | P2 | Dễ | Luna |
| E05 | Phân loại file vá/khôi phục cũ và cập nhật tài liệu | P3 | Dễ | Luna; lập danh sách trước khi xóa |

Tổng cộng **21 đầu việc: 10 khó/rất khó, 6 vừa, 5 dễ**. Đây là các gói việc, không phải 21 lỗi đã xuất hiện trên hệ thống thật.

## Chi tiết các việc khó

### K01 — Điểm đang bám dòng, không bám học sinh

**Bằng chứng:** `src/App.jsx:1953` sắp học sinh theo lớp/tên và cắt 40 người; `src/App.jsx:2048` tạo khóa dạng `custom:hkiScore:0:r0:s0`. `src/components/ScorebookWorkspace.jsx:1400`, `:1452`, `:1525`, `:2914` và `:2933` cũng dùng roster đã sắp xếp để đọc điểm theo `rowIndex`. `HocSinhManager.jsx:1678` dùng cùng cách cho đối chiếu kết quả.

**Tái hiện cục bộ:** Bình ở dòng 0 có 9, Cường ở dòng 1 có 7. Thêm An vào danh sách khiến thứ tự thành An/Bình/Cường. Khóa điểm không đổi, nên An hiện 9, Bình hiện 7, Cường trống. Đổi tên, đổi lớp, xóa hoặc đánh dấu nghỉ học cũng có thể dịch thứ tự. Đây là lỗi logic đã tái hiện, không phải chỉ nhận xét về cấu trúc code.

**Cách sửa:**

1. Chọn mã học sinh ổn định dùng xuyên năm học, phân biệt với ID hồ sơ của từng năm. Không dùng tên hoặc số dòng làm khóa chính.
2. Lưu điểm theo học sinh + năm học + cơ sở + môn + học kỳ + loại/cột điểm. Thứ tự dòng chỉ phục vụ trình bày/in.
3. Thêm phiên bản schema. Xây công cụ xem trước chuyển đổi điểm cũ theo roster thực tế tại thời điểm lưu. Nếu bản cũ không có roster/mapping, đánh dấu cần đối soát; không đoán theo danh sách hiện tại rồi ghi hàng loạt.
4. Cập nhật đồng bộ điểm nhanh, bài quiz, sổ điểm, học bạ và đối chiếu hồ sơ.
5. Tách phân trang/in 40 dòng khỏi dữ liệu nghiệp vụ. Hiện `slice(0, 40)` áp dụng theo khối/cơ sở, có thể bỏ những học sinh từ người thứ 41 trở đi. Chọn lớp hoặc thêm trang thay vì cắt mất khỏi luồng tính điểm.

**Nghiệm thu:** thêm một học sinh đứng đầu danh sách; đổi tên/lớp; cho học sinh nghỉ học; roster trên 40 người; học sinh trùng tên; xem học bạ nhiều năm. Điểm của mỗi mã học sinh phải giữ nguyên. Dữ liệu migration không đủ căn cứ phải được báo rõ.

### K02 — Phục hồi xóa trước, sao lưu thiếu phần phân công và có thể cũ

**Bằng chứng:** `src/App.jsx:3261` đọc collection, xóa toàn bộ document hiện tại rồi ghi bản sao lưu; mất mạng sau bước xóa để lại trạng thái thiếu dữ liệu. `:3239` chỉ lấy `settings/global`, trong khi `:3210` đã chuyển phân công THĐ sang `settings/thdTeachingAssignments/chunks`. Phần này không nằm trong snapshot. `AdminDataSafetyWorkspace.jsx:85` dùng prop `snapshot` đã tải lúc mở màn hình làm bản trước phục hồi; không tự lấy bản mới ngay lúc bấm. `:91` mặc định mailboxRows thiếu thành `[]`, có thể phục hồi rỗng hộp thư từ backup không có phần này. Apps Script `code_hoclieu.gs:1604` nuốt lỗi tạo bản sao lưu an toàn hộp thư.

**Cách sửa:**

1. Định nghĩa manifest backup có schemaVersion, danh mục collection/document/subcollection, số lượng và kết quả xác thực. Nêu rõ nội dung nào thuộc phạm vi sao lưu; không quảng bá backup toàn hệ thống nếu chưa bao gồm học liệu, bài nộp hoặc hồ sơ Drive.
2. Bổ sung document/chunks phân công THĐ. Phân biệt backup toàn hệ thống và backup chỉ hộp thư.
3. Tạo snapshot mới ngay trước thao tác, dùng dữ liệu đã xác nhận từ server; thất bại sao lưu phải dừng phục hồi/xóa liên quan.
4. Validate toàn bộ IDs, cấu trúc, phiên bản và mailbox rows trước ghi. Thiếu phần nào thì bỏ qua có chủ đích hoặc từ chối; không tự suy ra phải xóa phần đó.
5. Với dữ liệu nhỏ, dùng batch phù hợp để ghi/thay thế có kiểm soát. Với dữ liệu lớn, dùng vùng staging/generation, nhật ký tiến độ và bước chuyển sang bản mới sau đối soát. Nhiều batch liên tiếp không trở thành một giao dịch toàn bộ.
6. Chặn ghi đồng thời hoặc phát hiện xung đột trong quá trình restore. Có cách tiếp tục hoặc quay lại khi một bước Firebase/Sheet thất bại.

**Nghiệm thu:** phục hồi backup thiếu field, sai ID, chỉ chứa mailbox; cắt mạng giữa chừng; lỗi tạo safety backup; có chỉnh sửa sau khi mở màn hình; dữ liệu trên nhiều batch. Không báo thành công khi chưa hoàn tất; bản cũ vẫn phục hồi được.

### K03 — Vai trò UI chưa trở thành quyền Firebase

**Bằng chứng:** `src/App.jsx:1766` mặc định đăng nhập Firebase anonymous; listener `:1780` tải cả students, hồ sơ chờ chỉnh, admissions, bài nộp và kết quả. Đăng nhập Admin/GV gọi Apps Script rồi đổi state trình duyệt (`:4050` trở đi), không đổi sang danh tính Firebase gắn role. `:1471` đăng nhập học sinh bằng tra cứu `allStudents` trên client. File `firestore.rules.secure-ready` chỉ là mẫu; nhánh tổng quát còn cho mọi người signed-in đọc các collection ngoài settings/students và cho mọi giáo viên ghi các collection đó. Mẫu chưa hạn chế theo cơ sở, khối, môn hay quyền tự sửa điểm.

**Giới hạn kết luận:** chưa lấy rules đang deploy, nên không kết luận Firebase production đang mở cho mọi người. Tuy nhiên, kiến trúc client hiện tại không tự chứng minh được quyền server.

**Cách sửa:**

1. Chốt một hệ thống danh tính tin cậy: Firebase Auth/claims hoặc backend xác thực và cấp quyền tương đương. Kết nối danh tính này với tài khoản Apps Script; không dùng `role` trong state/sessionStorage làm nguồn quyền.
2. Lập ma trận đọc/ghi riêng cho Admin, giáo viên từng cơ sở/khối/môn, học sinh chính mình, và khu THĐ. Chốt học sinh được nộp yêu cầu nào, không được tự ghi điểm hoặc duyệt hồ sơ.
3. Tách dữ liệu công khai/riêng, đặc biệt đáp án quiz và câu hỏi chưa đến giờ công bố. Không gửi đáp án xuống trình duyệt học sinh rồi chỉ ẩn bằng giao diện/CSS.
4. Đưa đăng nhập/tra cứu học sinh và chấm bài cần độ tin cậy lên server. Khi tra cứu không tải toàn bộ hồ sơ về client; thêm kiểm soát thử mã.
5. Viết rules cho từng collection và các field nhạy cảm; truy vấn phải tương ứng phạm vi quyền. Cả giao diện và rules cần được chuyển đổi cùng đợt.
6. Thử trên Emulator/test project rồi migration tài khoản và rollout. Trước rollout, có đường quay lại; không áp dụng trực tiếp file rules mẫu lên hệ thống hiện còn anonymous.

**Nghiệm thu:** gọi trực tiếp từ tài khoản anonymous, học sinh, giáo viên khác cơ sở/môn và tài khoản bị khóa; thử đọc hồ sơ khác, lấy đáp án trước giờ và ghi điểm/duyệt hồ sơ. Các request phải bị từ chối ở server dù bỏ qua UI. Firestore rules không tự lọc kết quả của query rộng: query phải thỏa điều kiện quyền. [Tài liệu Firebase](https://firebase.google.com/docs/firestore/security/rules-query).

### K04 — HTML từ dữ liệu và AI được chèn trực tiếp

**Bằng chứng:** `NewsViewerModal.jsx:33` chèn `news.content`; `App.jsx:10437`, `:10879`, `:11235`, `:11395` hiển thị bài học/quiz/AI bằng HTML. `formatAiText` ở `:4928` chỉ thay Markdown đậm và xuống dòng, chưa lọc thẻ/sự kiện/URL. Không tìm thấy sanitizer HTML dùng chung trong ứng dụng. Hàm tên `sanitizeStudentChanges` làm việc với field hồ sơ, không phải lọc HTML.

**Ảnh hưởng:** nội dung có event handler hoặc URL nguy hiểm có thể chạy khi người khác xem; session token lưu trong trình duyệt làm tác động lớn hơn. Chưa thử payload trên website thật. React xác nhận HTML không tin cậy phải được lọc trước khi dùng cơ chế này. [Tài liệu React](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html).

**Cách sửa:**

1. Dùng một sanitizer được duy trì, cấu hình allowlist cho định dạng thực tế: bảng, ảnh, công thức, liên kết và attachment.
2. Chặn event handlers, script, URL nguy hiểm; chỉ cho iframe từ origin được duyệt như Drive/YouTube, không cho iframe tùy ý. Bảo toàn thuộc tính attachment/MathJax thật sự cần.
3. Phân biệt text AI cần escape/Markdown parser với HTML do trình soạn thảo tạo. Lọc tại ranh giới render và khi lưu nội dung phù hợp; xử lý cả dữ liệu cũ.
4. Rà cả `innerHTML`, cửa sổ in, nội dung copy và xuất file; không chỉ sửa component bản tin.

**Nghiệm thu:** nội dung có `onerror`, URL script, iframe lạ không chạy; bảng/ảnh/quiz/đáp án giáo viên/công thức toán vẫn hiển thị đúng; copy và xuất file không mất định dạng cần thiết.

### K05 — Tải Drive đang tự xóa ghim từ một danh sách có thể thiếu

**Bằng chứng:** `src/App.jsx:3982` lấy một trang Drive, `fields` chỉ có files, không có nextPageToken; `:3998` coi mọi file đã ghim không xuất hiện trong danh sách đó là stale và `:3999` xóa ghim trên Firestore. Ngoài phân trang, file đổi tên không khớp tag cũng biến mất khỏi `filtered` dù file chưa bị xóa. Việc tải lại được kích hoạt khi `allMaterials` đổi, tạo thêm lượt gọi API.

**Cách sửa:**

1. Loại bỏ hành vi tự xóa ghim khỏi luồng đọc kho. Đây là sửa đầu tiên có thể triển khai riêng mà chưa đổi schema.
2. Đọc đầy đủ pagination (`nextPageToken`, `pageToken`), kiểm tra HTTP error và `incompleteSearch`. Không xem kết quả thiếu/quyền đọc thất bại là bằng chứng file đã bị xóa.
3. Nếu cần dọn ghim, làm luồng đối soát riêng: kiểm tra file theo ID/quyền, hiện danh sách xem trước và lý do, rồi mới xóa sau thao tác quản trị được cho phép. Đổi tên file không đồng nghĩa cần gỡ bài đã ghim.
4. Query Drive theo phạm vi hẹp nếu có thể; cache theo ngữ cảnh và chống response cũ khi đổi môn/cơ sở. Áp dụng pagination cho tải sách giáo khoa ở `:3973`.

**Nghiệm thu:** mock ít nhất hai trang, file ghim ở trang 2; trang rỗng nhưng còn token; file đổi tên; API 403/lỗi mạng; chuyển môn nhanh. Không có ghim nào bị xóa chỉ vì tải danh sách. Drive API nêu rõ danh sách có thể chưa đủ khi còn token. [Tài liệu Google Drive](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list).

### K06 — Cập nhật sổ điểm có thể ghi đè bản nháp hoặc giá trị mới

**Bằng chứng:** `ScorebookWorkspace.jsx:850` mỗi snapshot đều `setEdits` và `setIsDirty(false)`; `:959` lưu toàn bộ map edits hiện có. Snapshot của người khác có thể thay bản nháp chưa lưu. `App.jsx:5452` đọc map điểm bằng getDoc rồi ghi lại map cũ cộng một ô; một ô do người khác thay đổi giữa hai bước có thể bị ghi đè bằng giá trị cũ. Điểm nhanh `:2750` đã ghi từng key, nên không cần thay toàn bộ luồng này vô lý. Map merge không bảo vệ giá trị stale của các key vẫn được gửi.

**Cách sửa:** tách server state/base revision với dirty patch theo ô; snapshot cập nhật phần sạch và báo xung đột phần đang sửa. Lưu chỉ các ô thay đổi, xóa bằng deleteField/field path rõ ràng. Dùng transaction hoặc kiểm tra revision khi quyết định có ghi đè một điểm đang có; không ghi lại toàn bộ map lấy từ getDoc. Dirty chỉ hết khi đúng phiên bản bản nháp đã lưu; người nhập tiếp trong lúc save phải vẫn được giữ dirty.

**Nghiệm thu:** hai tab sửa hai ô khác nhau, cùng một ô, xóa điểm, một tab đang nhập khi tab khác lưu; nhập thêm trong lúc save; lỗi mạng. Có chính sách xung đột rõ ràng, không tự mất bản nháp. Transaction phù hợp với quyết định phụ thuộc dữ liệu hiện tại và có thể chạy lại khi xung đột; UI không được cập nhật bên trong callback transaction. [Tài liệu Firebase](https://firebase.google.com/docs/firestore/manage-data/transactions).

### K07 — Các mảnh phân công không có generation chung

**Bằng chứng:** `App.jsx:3212` ghi các chunk `0,1,...` bằng Promise.all, rồi mới ghi parent chunkCount. Listener `:1850` ghép mảnh theo index, không đối chiếu phiên bản. Nếu parent vẫn là bản cũ trong lúc một số chunk đã đổi, reader có thể ghép cũ/mới; JSON lỗi bị bỏ qua hoặc JSON hợp lệ nhưng nội dung trộn vẫn được nhận. Map đọc chưa xóa các phần đã biến mất trên snapshot; chunk dư khi dữ liệu co lại vẫn ở storage.

**Cách sửa:** ghi mỗi phiên bản vào generation riêng, có count/hash/schemaVersion; hoàn tất và kiểm tra đủ rồi atomically đổi con trỏ activeGeneration. Reader chỉ dùng các chunk của generation được công bố; vẫn hiển thị bản trước trong lúc chờ. Không giữ phần đã xóa trong map mới. Dọn generation cũ sau khi không còn cần phục hồi. Xác định kích thước chunk theo bytes UTF-8 phù hợp giới hạn document, không chỉ số ký tự.

**Nghiệm thu:** save lớn hơn/nhỏ hơn trước, lỗi một chunk, hai tab cùng save, listener đến sai thứ tự, tiếng Việt/emoji dài. Chỉ nhận một bản nguyên vẹn, không báo lưu thành công với dữ liệu chưa đủ.

### K08 — Đồng bộ hai hệ thống còn cần idempotency và trạng thái từng hồ sơ

**Bằng chứng:** chuyển năm `App.jsx:3739` tạo hồ sơ đích bằng ID tự sinh, nhiều batch nối tiếp và dựa roster client để tìm hồ sơ đã có; đã có pending/success/failed, nhưng hai phiên chạy từ cùng dữ liệu cũ vẫn có thể tạo bản đích trùng. `HocSinhManager.jsx:3581` duyệt nhiều hồ sơ bằng Promise.all/addDoc rồi mới đánh dấu Sheet; lỗi một promise có thể để một số bản đã tạo mà bước Sheet không chạy. `App.jsx:643` gửi nhóm 20 hồ sơ qua URL JSONP với timeout 9 giây. `code_dangky.gs:syncSchoolYearClasses_` cập nhật từng dòng/cột, chưa có lock bao quanh luồng đó và chưa cập nhật Script Property CURRENT_SCHOOL_YEAR.

**Cách sửa:**

1. Chốt ID hồ sơ đích hoặc unique key theo stable student ID + năm + cơ sở; transaction/unique registry ngăn hai phiên tạo trùng.
2. Lưu job và trạng thái từng hồ sơ với idempotency key. Tiến trình server là nguồn trạng thái; chạy lại chỉ làm bước còn thiếu.
3. Không trông chờ Promise.all rollback: ghi nhận từng kết quả thành công/thất bại và đối soát trước khi thông báo.
4. Chuyển thao tác quản trị ghi Sheet khỏi JSONP GET sang API POST có xác thực qua backend/proxy phù hợp. Đừng đổi Content-Type đơn giản rồi giả định Apps Script giải quyết được CORS.
5. Dùng lock và đọc/ghi vùng Sheet theo lô khi thích hợp; giới hạn thời gian, lưu tiến độ và xử lý cột mới nhất quán.
6. Đồng bộ năm học của form đăng ký với nguồn chuẩn, gồm CURRENT_SCHOOL_YEAR sau bước chốt. Tránh website đã 2026–2027 nhưng form standalone vẫn dùng mặc định 2025–2026.

**Nghiệm thu:** hai Admin đồng thời; batch đầu thành công/batch sau thất bại; Firebase thành công/Sheet thất bại; timeout nhưng server đã ghi; chạy lại nhiều lần; hồ sơ không có định danh; form standalone sau đổi năm. Mỗi học sinh chỉ có một hồ sơ đích và các bước đã làm không bị lặp sai.

### K09 — Quyền Apps Script còn thiếu ở một số đường đi

**Bằng chứng:**

- `code_hoclieu.gs:540` miễn phiên nhân sự cho hai folder upload công khai; chỉ APP_CLIENT_TOKEN không phải xác thực người dùng. Đây là chủ đích phục vụ upload học sinh, nhưng chưa có quyền upload giới hạn theo người/job.
- `:1433` đọc hộp thư dựa accessCode, className, schoolYear do request cung cấp, không đối chiếu danh tính trên server. `:1458` đánh dấu đã đọc theo messageId/code, chưa xác minh người đó là người nhận.
- `:303` kiểm tra staff role trong cache; việc kiểm tra account hiện hành/sessionVersion nằm trong `requireTeacherContentScope_`. Gọi AI không có fileId không đi qua kiểm tra scope này. Upload ảnh news cũng có nhánh bỏ qua scope. Giáo viên bị khóa có thể còn dùng một số action trong thời hạn cache.
- `:318` và `:326` đăng nhập Admin/THĐ chưa có giới hạn thử sai tương tự tài khoản giáo viên.

**Cách sửa:** dựng middleware xác minh phiên hiện hành trước mọi action nhân sự, kiểm tra account version/active cho giáo viên độc lập với việc có fileId hay không. Giới hạn quyền upload bằng token ngắn hạn theo loại file, folder, học sinh/job, số lượng/bytes; server chọn folder và kiểm tra MIME/nội dung. Hộp thư lấy mã/lớp/năm từ hồ sơ đã xác thực, kiểm tra quyền recipient khi đọc/markRead. Thêm giới hạn thử sai cho Admin/THĐ và nhật ký thao tác từ danh tính server. Không biến client token thành “bí mật” bằng cách chuyển sang biến môi trường frontend.

**Nghiệm thu:** khóa giáo viên khi còn token và thử AI text/upload news; giả className/messageId; upload không có quyền hoặc vượt phạm vi; đăng nhập sai liên tục. Học sinh hợp lệ vẫn nộp được file. Cần deploy Apps Script mới sau sửa để hành vi server có hiệu lực.

### K10 — Tách mã lớn có thứ tự, tránh tách cơ học toàn dự án

**Bằng chứng:** App chứa 240 state và 54 effect, cùng nhiều UI lớn cho vai trò Admin/GV/HS. Nhịp nowMs 10 giây làm App render lại; các state và callback nhiều tính năng chung một component. Ba màn hình lớn khác cũng chứa logic parse/ZIP/in/điểm lẫn giao diện.

**Cách sửa:** sau khi chốt hợp đồng dữ liệu, tách service API, hook/session, hook query theo phạm vi, các tiện ích thuần, rồi màn hình News/Teacher/Student/QuickScore. Đưa clock đếm ngược vào nơi dùng. Dùng lazy ở ranh giới màn hình/tính năng thực sự; tránh chỉ đổi tên file hoặc chia chunk để ẩn cảnh báo build. Tiếp theo chia AdminSettings/HocSinh/Scorebook theo nhóm nghiệp vụ. Mỗi đợt giữ nguyên hành vi, test và build; không rewrite toàn bộ trong một commit.

**Nghiệm thu:** các flow đăng nhập, ghi điểm, tạo quiz, duyệt hồ sơ, in/xuất vẫn chạy; build đo được JS tải ban đầu, không kéo template sổ điểm vào entry; thao tác một ô không làm các màn hình không liên quan thực hiện lại logic tốn chi phí. Chưa có profiling trình duyệt nên không hứa một tỷ lệ tăng tốc cụ thể.

## Chi tiết các việc mức vừa

### M01 — Hợp đồng chuẩn hóa điểm và số 0

**Vị trí:** `App.jsx:425`, `ScorebookWorkspace.jsx:400`, `App.jsx:5437`.

**Xác nhận:** số 0 dạng number bị biến thành chuỗi rỗng vì `value || ''`; đường chuẩn hóa điểm quiz truyền number nên điểm 0 có thể không chuyển vào sổ. Text `abc` được chấp nhận nguyên; 11 bị đổi âm thầm thành 10. Test operations nói 11 bị từ chối nhưng test không dùng hàm thực tế.

**Sửa:** dùng `value ?? ''`; tạo một helper điểm thuần dùng chung, phân biệt empty/valid/invalid. Với cột số: báo nhập sai, không lưu text lạ; chốt chính sách từ chối hay giới hạn 0–10 rõ ràng. Các cột nhận xét/Đ/CĐ phải có hợp đồng riêng, không bị biến thành cột số. Định dạng hiển thị một chữ số thập phân nếu nghiệp vụ hiện tại cần.

**Nghiệm thu:** 0 number/string, rỗng, dấu phẩy thập phân, NaN/text, ngoài 0–10, điểm quiz 0/10; test phải gọi đúng helper frontend import. Đây là việc nhỏ hơn K01 nhưng vẫn cần sửa cả các consumer.

### M02 — Nộp bài và lưu điểm có trạng thái khác nhau

**Vị trí:** `App.jsx:5444`, `:5473`, `:6475`.

**Vấn đề:** `writeQuizScoreToScorebook` có nhiều nhánh trả false và catch cũng trả false. `handleSubmitSelfQuiz` vẫn đặt kết quả rồi báo “Đã nộp bài và lưu điểm”, không kiểm tra giá trị trả về. Lỗi mất mạng/quyền, không tìm được học sinh hoặc điểm 0 đều có thể gây thông báo sai.

**Sửa:** trả kết quả có trạng thái (`written`, `noTarget`, `needsReview`, `failed` hoặc tương đương), phân biệt nộp bài đã lưu với điểm chưa đồng bộ. Lưu trạng thái sync cùng bài nộp; retry chỉ ghi điểm, không thêm một bài nộp trùng. Trường hợp cố ý không gắn cột điểm chỉ báo nộp thành công. Kết hợp với K01/M01 và quyền chấm điểm của K03.

**Nghiệm thu:** bài đã lưu nhưng writeScore thất bại; chưa chọn target; mã học sinh không khớp; điểm 0; retry; không hiển thị đã lưu điểm khi chưa có bằng chứng.

### M03 — Debounce autosave giữ đúng ngữ cảnh bài học

**Vị trí:** `App.jsx:1151`, `:2944`, `:3054`, `:4226`.

**Rủi ro qua luồng code:** timer autosave chỉ được dọn khi App unmount hoặc save tay. Callback giữ noteId cũ nhưng tới khi chạy mới đọc DOM ref đang dùng; chuyển bài trong 2 giây có thể khiến nội dung bài mới/loading được gửi với ID bài cũ. Chưa tái hiện trên trình duyệt.

**Sửa:** khi schedule save, chụp payload content/noteId/scope/revision của đúng bài; cancel hoặc flush có kiểm soát khi đổi ngữ cảnh/thoát. Timer xử lý riêng theo note; response cũ không đổi trạng thái save của bài mới. Dirty draft không bị snapshot hay đổi bài xóa âm thầm.

**Nghiệm thu:** nhập ở bài A rồi đổi B ngay, đổi môn/năm/cơ sở, logout, response save A đến sau khi đang ở B. Bài A/B không bị ghi nhầm. Phù hợp test fake timer cùng thao tác giao diện khi triển khai sửa.

### M04 — Listener phải theo tính năng và phạm vi dữ liệu

**Vị trí:** `App.jsx:1780` có 15 listener khi chỉ cần Firebase user; `ScorebookWorkspace.jsx:868` đọc tất cả scorebooks và `:893` đọc toàn bộ attendance; ClassOps cũng đọc attendance rồi lọc client.

**Sửa:** chỉ subscribe dữ liệu công khai trên trang đầu. Các collection hồ sơ/điểm/bài nộp subscribe khi mở màn hình và có role/scope phù hợp; dùng query theo năm, cơ sở, khối/lớp/học sinh và phân trang khi cần. Dùng lại data/hook dùng chung nếu hai màn hình cần cùng phạm vi thay vì listener toàn collection lặp lại. Thêm error handler và reset dữ liệu nhạy cảm khi logout/đổi scope.

**Nghiệm thu:** trang đầu chưa chọn vai trò không nhận students/admissions/private submissions; mở/đóng màn hình listener được dọn; đổi năm/cơ sở không hiện dữ liệu cũ; permission-denied không thành loading vô hạn. Chốt với K03 để query phù hợp rules. Số listener riêng không đồng nghĩa chính xác bằng số lần tính phí; cần đo reads thực tế.

### M05 — Công bố TKB không hạ bản cũ trước khi bản mới sẵn sàng

**Vị trí:** `SimpleScheduleTable.jsx:808–846` hạ các published cũ, lưu bản mới rồi tìm/thêm bản tin.

**Sửa:** lập toàn bộ thay đổi trước; dùng batch với tập documents xác định hoặc transaction/pointer cho active schedule theo cơ sở/năm/học kỳ. Bản tin liên quan dùng ID xác định từ scheduleId, tránh hai phiên cùng tạo hai tin bằng addDoc. Chốt publish cùng bản tin cần thiết hoặc lưu trạng thái để retry rõ ràng. Không hạ bản đang chạy nếu save mới lỗi.

**Nghiệm thu:** lỗi ghi bản mới, lỗi bản tin, hai phiên cùng publish, retry. Luôn xác định được bản được công bố và không sinh bản tin trùng. Batch chỉ bảo đảm trong chính batch đó; truy vấn trước batch cần kiểm soát xung đột.

### M06 — Test nối vào logic thật, giảm các bản tiện ích riêng

**Vị trí:** `src/utils/operations.js`, `test/operations.test.js`; helper điểm trong App/Scorebook/HocSinh; helper ZIP/CSV/Drive/date trong HocSinh/AdminSettings.

**Xác nhận:** import graph từ main không tới `operations.js`; 8 test operations không chứng minh các luồng UI tương ứng dùng logic đã test. Một ví dụ khác biệt có thể đo được là chính sách nhận điểm 11. Các tên hàm trùng không tự chứng minh implementation hoàn toàn giống nhau.

**Sửa:** lập bảng từng helper → consumer thật → test; trích logic thuần từ consumer và dùng lại đúng helper đó. So sánh khác biệt trước khi hợp nhất, nhất là ngày, khóa năm học, nhập điểm, header xuất file và CSV/ZIP. Thay hoặc bỏ helper/test chỉ có mục đích minh họa sau khi test nghiệp vụ thật đã thay thế. `validateBackupSnapshot` hiện chỉ kiểm tra object collections, không đủ cho K02.

**Nghiệm thu:** một thay đổi logic đang dùng làm test liên quan thất bại; không còn hai chính sách điểm vô tình khác nhau; fixture file xuất hiện tại vẫn hợp lệ. Không đo chất lượng bằng cách tăng số test vô nghĩa.

## Các việc dễ có thể giao Luna

### E01 — Xóa ba bản component cũ

**Phạm vi:** `src/AdminSettingsWorkspace.jsx`, `src/ThdTeachingAssignmentsPanel.jsx`, `src/ThdTeachingAssignmentsToolbar.jsx`.

Import graph từ `src/main.jsx` không tới ba file này; App dùng bản trong `components/`, và phần THĐ dùng `features/tran-hung-dao/`. Chúng còn được tracked, một bản chứa relative import không đúng vị trí. Xóa đúng ba bản cũ, gỡ đúng ba ngoại lệ tương ứng trong eslint config. Không xóa bản components/features, không sửa logic nghiệp vụ.

**Nghiệm thu:** kiểm tra import/re-export/dynamic import trước khi xóa; lint/build đạt; không có import mới bị gãy. Xóa code không reachable làm repository rõ hơn, không giảm bundle runtime đang chạy vì bundler vốn không lấy chúng.

**Prompt giao Luna:**

```text
Thực hiện E01 trong RA_SOAT_VA_PHAN_CONG_2026-10-03.md. Xác nhận không có import/re-export/dynamic import dùng ba component bản cũ tại gốc src, rồi xóa đúng ba file đó và gỡ đúng ba ignore trong eslint.config.js. Giữ nguyên bản trong components/features và các thay đổi chưa commit khác. Không refactor logic. Chạy lint và build; báo file đã đổi và kết quả.
```

### E02 — Kiểm tra đủ source/config và cú pháp server

Sau E01, mở rộng lint để quét toàn bộ JS/JSX đang dùng, gồm `src/config/firebase.js` và cấu hình dự án. Khai báo môi trường Node/browser đúng từng loại file. Thêm kiểm tra **parse-only** cho hai Apps Script chính và manifest JSON vào check; không chạy hàm Google thật, không kiểm tra bản export cũ `code_chambai.gs` như server chính. Không vô hiệu hóa hàng loạt rule để đạt lint.

**Nghiệm thu:** lỗi cú pháp giả trong source được đưa vào lint hoặc Apps Script được phát hiện bằng kiểm tra cục bộ; sau khi bỏ fixture lỗi, check đạt. Tài liệu phân biệt parse cú pháp với integration test.

**Prompt giao Luna:**

```text
Thực hiện E02 trong báo cáo, sau E01. Mở rộng lint toàn bộ source JS/JSX đang dùng và config với đúng môi trường. Bổ sung kiểm tra parse-only cho apps-script/code_hoclieu.gs, apps-script/dang-ky-hoc-sinh/code_dangky.gs và JSON appsscript.json vào check. Không gọi dịch vụ Google, không deploy, không tắt rule đại trà. Giữ nguyên logic ứng dụng, chạy check và cập nhật README đúng phạm vi.
```

### E03 — Hồ sơ chờ duyệt không loading vô hạn

**Vị trí:** `HocSinhManager.jsx:3310`, hàm `loadPendingRegistrations`. Hàm này tự tạo script/callback với onerror nhưng không có timeout; cùng file đã có `loadRegistrationDataAction` ở `:1196` với timeout và cleanup.

**Sửa:** tái sử dụng helper có sẵn với action listPending; giữ decorateRegistration/thông báo/quyền Admin. finally luôn tắt loading. Chống request cũ ghi đè lượt reload mới hoặc cập nhật sau unmount nếu cần trong phạm vi nhỏ. Không thay API ghi dữ liệu hay URL deploy.

**Nghiệm thu:** thành công, server từ chối, network error, script tải nhưng không callback, reload liên tiếp; không còn callback/script/timer rò và loading kết thúc.

**Prompt giao Luna:**

```text
Sửa riêng E03: chuyển loadPendingRegistrations trong HocSinhManager.jsx sang helper loadRegistrationDataAction đã có timeout/cleanup. Giữ nguyên dữ liệu, decorateRegistration, thông báo và admin token. Bảo đảm finally tắt loading và response cũ không ghi đè lần tải mới. Không sửa duyệt/xóa/đồng bộ hồ sơ. Kiểm tra các nhánh timeout/onerror/server từ chối rồi chạy lint/build.
```

### E04 — Ngày sao lưu theo Việt Nam

**Vị trí:** `App.jsx:3913` dùng `new Date().toISOString().slice(0, 10)`; mốc là UTC, nên ngày đổi lúc 07:00 tại Việt Nam thay vì 00:00.

**Sửa:** tạo helper ngày `YYYY-MM-DD` theo `Asia/Ho_Chi_Minh` với Intl/date parts và dùng cho daily backup. Giữ nguyên giá trị năm học/ngày lưu dữ liệu khác. Hành vi cần là “lần mở của Admin mỗi ngày” như README, không tự thêm scheduler. Cơ chế chống backup trùng nhiều máy/tab là một nâng cấp server riêng, không nằm trong E04.

**Nghiệm thu:** 23:59/00:01 giờ Việt Nam, 06:59/07:01, host timezone khác Việt Nam.

**Prompt giao Luna:**

```text
Sửa riêng E04: khóa daily backup dùng ngày YYYY-MM-DD theo Asia/Ho_Chi_Minh, thay toISOString().slice(0,10). Tạo helper nhỏ và test các ranh giới ngày Việt Nam; không đổi ngày/năm học khác, không thêm scheduler và không sửa backup/restore. Chạy test/lint/build.
```

### E05 — Vệ sinh repository và tài liệu có giới hạn

Có 32 file tracked thuộc nhóm patch/recovery/text/zip/backup_corrupted ngoài mã chạy, gồm patch*.cjs/py, recover*, toolbar*.txt và src_backup_149am.zip. Không được coi tất cả là rác chỉ vì tên. `mat_khau.txt`/cauhinh.json là cấu hình riêng đã ignore; không đọc hoặc đưa nội dung vào báo cáo. `.gitignore` hiện có ngoại lệ Apps Script cụ thể; phải giữ đúng nguồn đang dùng.

**Sửa:** tìm nơi gọi từng script từ package/scripts/tài liệu; lập danh mục còn dùng, lưu trữ và ứng viên bỏ. Dọn tự động chỉ file tạm đã xác định trong phạm vi giao việc; lưu bản khôi phục hữu ích theo quyết định của chủ dự án. Bổ sung ignore cho output tạm đúng tên nếu cần. README/báo cáo cũ cần được ghi chú mốc kiểm tra; không tiếp tục lấy kết luận “15/15, mọi P0/P1 đã xong” làm trạng thái hiện tại.

**Nghiệm thu:** không mất script vận hành còn dùng, không đưa file chứa khóa/mật khẩu vào Git, nguồn hai Apps Script vẫn tracked/được phép add, repo dễ nhìn hơn. Không dùng `git clean -fd` hoặc xóa đệ quy toàn workspace.

**Prompt giao Luna:**

```text
Thực hiện E05 ở mức lập danh mục trước: xác định file patch/recovery/backup/text nào có consumer trong package/scripts/tài liệu; đề xuất file có thể bỏ và file cần giữ, bổ sung ignore output tạm cụ thể, cập nhật tài liệu kiểm tra. Không đọc/in bí mật, không xóa backup hoặc script chưa xác nhận, không dùng git clean và không deploy. Báo rõ các ứng viên xóa để chủ dự án quyết định.
```

## Thứ tự sửa để tiết kiệm token và tránh chồng chéo

1. **Đợt ngăn lỗi trước mắt:** K05; M01; M02; M03; K06. K05 có thể bắt đầu bằng bỏ xóa ghim trong luồng đọc; phần này độc lập và giảm rủi ro ngay.
2. **Đợt bảo toàn dữ liệu và quyền:** K02, K04, K09; K03 được thiết kế sớm vì ảnh hưởng hầu hết tính năng. Các thử nghiệm phá lỗi thực hiện trên mock/test project, không dữ liệu thật.
3. **Đợt migration:** K01 → cập nhật mọi consumer điểm, rồi K08/K07 theo schema chốt. K06 có thể áp dụng trước để giữ bản nháp và hạn chế ghi đè, sau đó thích nghi schema mới.
4. **Đợt truy vấn và tổ chức:** M04/M05/M06 rồi K10. Tách từng feature, không sửa đồng thời cả App và các màn hình lớn ở nhiều chat cùng workspace.
5. **Luna:** E01 → E02; E03, E04 có thể làm riêng; E05 lập danh mục. E03/E04 sửa App/HocSinh nên nên thực hiện tuần tự với các đợt khó chạm cùng file.

Sau mỗi gói: xem diff phạm vi, chạy test/lint/build thích hợp, cập nhật trạng thái đầu việc. Việc liên quan Firestore/App Script phải có test lỗi/đồng thời hoặc test quyền tương ứng; build đạt không chứng minh dữ liệu/quyền đúng. Chỉ khai triển kiểm tra thêm khi gói sửa tạo rủi ro mới.

## Điểm cần xác nhận nghiệp vụ khi bắt đầu migration

- Hiện A = NAN, B = TQK là **quy ước được code và test cố ý dùng**, không tự kết luận đó là lỗi mới. Nếu thực tế một cơ sở có cả 6A/6B hoặc lớp 6A1, cần cấu hình ánh xạ lớp → cơ sở tường minh và migration. `getSchoolClassesForCampus` chỉ nhận dạng một hậu tố chữ nên chưa hỗ trợ mọi kiểu lớp. Không tự gán lại cơ sở cho hồ sơ cũ.
- Danh tính học sinh xuyên năm và roster khi lưu điểm cũ cần đối soát trước K01. Nếu không có bằng chứng roster lịch sử, phải đánh dấu phần điểm chưa thể chuyển tự động.
- Cần xác nhận rules và version Apps Script đã deploy, tài khoản/quyền có thể dùng để thử tích hợp trước khi tuyên bố K03/K09 đã hoàn tất trên website thật.
- Các API key xuất hiện ở frontend phải được phân loại đúng mục đích; riêng việc Firebase config hiển thị không chứng minh bị lộ mật khẩu. Đổi/giới hạn khóa dịch vụ là thao tác trên Google/Firebase, không giải quyết bằng xóa chuỗi trong Git rồi coi đã an toàn.

## Gợi ý đầu việc cho lượt sửa khó tiếp theo

**Đề xuất bắt đầu K05 + M01 + M02**, vì đã có đường lỗi cụ thể, phạm vi tương đối rõ và không cần đoán dữ liệu migration. Tiếp theo K06/M03 để giữ bản nháp, rồi K02/K01/K03 theo dữ liệu và hệ thống xác thực đã xác nhận.

Prompt cho model chính:

```text
Đọc RA_SOAT_VA_PHAN_CONG_2026-10-03.md. Sửa K05, M01 và M02 trên workspace hiện tại, giữ các thay đổi chưa commit của tôi. K05: tải Drive không được tự xóa ghim; đọc đầy đủ pagination và xử lý response lỗi/cũ. M01: giữ điểm số 0, dùng helper điểm thực tế có kiểm thử và báo nhập sai rõ ràng. M02: phân biệt nộp bài thành công với điểm chưa đồng bộ, có retry không tạo bài nộp trùng. Chưa migration schema điểm K01, chưa deploy Firebase/Apps Script. Chạy kiểm tra phù hợp và báo phạm vi còn lại.
```
