# Báo cáo rà soát, tối ưu và hoàn thiện Kho học liệu

Ngày rà soát: **03/10/2026**. Phạm vi: mã đang có trong workspace, đường nối giữa giao diện–dịch vụ–Netlify–Apps Script, logic lặp, dữ liệu và công cụ kiểm chứng. **Lượt này lập báo cáo, không sửa mã ứng dụng hoặc triển khai dịch vụ.**

## 1. Kết luận chính

Ứng dụng đã có nhiều phần xử lý tốt: tách màn hình bằng import động, lưu điểm theo ô có kiểm tra xung đột, chống phản hồi cũ sau đổi phạm vi, phân trang sổ điểm chính, lưu phân công theo generation và bộ kiểm thử tự động. Tuy nhiên, chưa đủ căn cứ kết luận dự án đã hoàn thiện toàn bộ.

- **Chưa tìm thấy module JS/JSX nào trong `src` bị bỏ rời:** 76 module đều có đường import tới điểm chạy, khi tính cả import động và các handler Netlify. Đây là kiểm tra khả năng được gọi, chưa chứng minh mọi nhánh được sử dụng đúng trên hệ thống thật.
- **Có logic lặp cần gom:** tính/định dạng điểm, xếp loại, hai bản bảng nhập điểm nhanh, parser ngày, khóa phiên, endpoint và một số helper nhỏ.
- **Có lỗi và khoảng trống dữ liệu cần sửa trước:** nháp điểm mất khi đóng/chuyển phạm vi, cấp mã học sinh chưa đồng nhất, báo sai khi thao tác chỉ hoàn tất một phần, parser chấp nhận ngày không tồn tại, sao lưu/phục hồi chưa bao phủ và kiểm soát toàn bộ dữ liệu.
- **Nhánh xác thực/chấm máy chủ đã nối vào mã nhưng còn dang dở.** Mẫu cấu hình và tài liệu giữ các cờ tắt; một số API, quyền sổ điểm, lịch sử kết quả và sao lưu dữ liệu riêng còn thiếu. Không nên coi nhánh này là code thừa hoặc bật ngay chỉ vì kiểm thử hiện tại đạt.
- **Tối ưu lớn nhất nằm ở lượng dữ liệu đọc và cách tổ chức bộ điều khiển**, sau đó mới tới số dòng mã hay dung lượng asset nhỏ. Cần đo trước/sau để xác nhận lợi ích thực tế.

## 2. Kết quả kiểm chứng và giới hạn

| Kiểm tra thực hiện lại | Kết quả |
| --- | --- |
| Kiểm thử tự động hiện có | **91/91 đạt** |
| Kiểm tra mã và cú pháp Apps Script/manifest | Đạt |
| Dựng bản phát hành Vite | Đạt; còn cảnh báo chunk lớn hơn 500 kB |
| Kiểm tra dependency toàn bộ | 5 mục mức high, cùng chuỗi dependency phát triển Tailwind; 0 critical |
| Kiểm tra dependency bỏ nhóm phát triển | **0 lỗ hổng được npm báo cáo** tại thời điểm rà soát |
| Đối chiếu import/định nghĩa và logic lặp | Có kiểm tra cả import động, tham chiếu nội bộ và code backend |
| Parser ngày | Tái hiện tại máy: `2026-02-31` thành `2026-03-03`; `2026-13-01` thành `2027-01-01` |
| MathJax | Tái hiện helper bỏ qua lời gọi khi thư viện chưa sẵn sàng và không tự gọi lại khi thư viện đã tải |

Các bài kiểm thử hiện tại chủ yếu dùng dữ liệu/môi trường giả tại máy. **Chưa kiểm chứng Firebase Rules bằng emulator, toàn bộ hành trình nhiều vai trò trên trình duyệt, quyền Drive thật, cấu hình triển khai hoặc bản Apps Script đang hoạt động.** Không đọc cấu hình bí mật, không thực hiện ghi/xóa trên dịch vụ thật. Số liệu hiệu năng bên dưới là số đo bản dựng hoặc cấu trúc nguồn, không phải độ trễ/chi phí Firestore của người dùng thật.

## 3. Danh sách công việc theo ưu tiên và độ khó

**P1:** ảnh hưởng dữ liệu/đáp án hoặc là điều kiện bắt buộc trước khi bật luồng bảo mật mới. **P2:** hoàn thiện tính năng, xử lý tình huống cạnh tranh và tối ưu có tác động. **P3:** dọn dẹp và cải thiện nhỏ. Mức ưu tiên ở nhánh chuẩn bị không đồng nghĩa đã xác nhận hệ thống đang triển khai có lỗ hổng đó.

| Mã | Công việc | Ưu tiên | Độ khó | Phạm vi |
| --- | --- | --- | --- | --- |
| 01 | Thống nhất cấp/đổi mã và định danh học sinh | P1 | Khó | Luồng hiện có |
| 02 | Giữ nháp điểm khi đóng/đổi phạm vi | P1 | Vừa | Luồng hiện có |
| 03 | Báo đúng kết quả xóa/cấp mã hàng loạt và lỗi nhật ký | P1 | Khó | Luồng hiện có |
| 04 | Parser ngày phải từ chối ngày không tồn tại | P1 | Vừa | Lỗi tái hiện tại máy |
| 05 | Tách tài liệu học sinh và tài liệu có đáp án trên Drive | P1 | Khó | Hành vi nguồn; cần đối chiếu quyền thật |
| 06 | Chuyển quiz nhanh sang chấm máy chủ, tách đáp án | P1 | Khó | Luồng hiện có và chuyển đổi |
| 07 | Hoàn tất ma trận quyền/API của tất cả luồng | P1 | Rất khó | Điều kiện bật nhánh chuẩn bị |
| 08 | Ràng buộc quyền ghi sổ điểm theo môn/ô/khóa năm | P1 | Rất khó | Rules dự thảo và API cần bổ sung |
| 09 | Gắn hạn và thu hồi phiên Firebase với phiên đăng nhập | P1 | Rất khó | Điều kiện bật nhánh chuẩn bị |
| 10 | Sao lưu đủ cấu trúc dữ liệu và có tính nhất quán | P1 | Rất khó | Luồng hiện có và dữ liệu mới |
| 11 | Phục hồi có khóa ghi, tiếp tục và đối soát | P1 | Rất khó | Luồng hiện có và dữ liệu mới |
| 12 | Sửa giới hạn đăng nhập cho lớp dùng chung Wi-Fi | P2 | Vừa | Cầu xác thực chuẩn bị |
| 13 | Tách trạng thái tải và thao tác trong An toàn dữ liệu | P2 | Vừa | Luồng hiện có |
| 14 | Đợi MathJax sẵn sàng và xử lý lỗi tải | P2 | Vừa | Luồng hiện có |
| 15 | Dùng chung quy tắc tính điểm/xếp loại/cấu hình môn | P2 | Khó | Logic lặp |
| 16 | Dùng chung bảng và ô nhập điểm nhanh | P2 | Vừa–Khó | Giao diện lặp |
| 17 | Thu hẹp listener và truy vấn theo màn hình/phạm vi | P2 | Khó | Tối ưu cần đo |
| 18 | Phân trang bảng học sinh và điểm nhanh | P2 | Vừa | Tối ưu cần đo |
| 19 | Tách bộ điều khiển khỏi App và giảm tải ban đầu | P2 | Khó theo đợt; rất khó toàn bộ | Kiến trúc |
| 20 | Có môi trường kiểm chứng local và quy trình release | P1 | Khó | Điều kiện bật nhánh chuẩn bị |
| 21 | Xử lý chuỗi dependency Tailwind có cảnh báo | P2 | Khó | Công cụ phát triển |
| 22 | Nối lịch sử/tổng hợp kết quả cho chấm máy chủ | P2 | Khó | Tính năng còn thiếu ở nhánh mới |
| 23 | Hàng đợi đồng bộ Firebase–Sheet và thử lại | P2 | Khó | Hoàn thiện luồng hiện có |
| 24 | Dọn generation phân công cũ và mảnh ghi thất bại | P2 | Khó | Bảo trì dữ liệu |
| 25 | Thống kê an toàn dữ liệu có thời điểm và trạng thái tải | P3 | Dễ | Hoàn thiện giao diện |
| 26 | Gom cấu hình phiên/endpoint và helper lặp | P2 | Vừa | Giảm lệch hành vi |
| 27 | Dọn asset mẫu, nối favicon phù hợp | P3 | Dễ | Asset chưa tham chiếu |
| 28 | Lưu trữ có danh mục các tệp vá/khôi phục/chẩn đoán | P3 | Dễ | Vệ sinh repository |

Tổng cộng **28 nhóm công việc: 12 P1, 13 P2, 3 P3**. Một nhóm có thể cần nhiều thay đổi; không nên coi đây là 28 lỗi độc lập đã xuất hiện trên hệ thống thật.

## 4. Phương án chi tiết cho lỗi và tính toàn vẹn dữ liệu

### 01. Cấp mã học sinh chưa thống nhất

**Bằng chứng:** duyệt đăng ký đã dành mã bằng transaction với `student_code_registry` tại [HocSinhManager.jsx:3501](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:3501). Nhưng thêm/sửa tay ở [dòng 2758](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:2758), bổ sung mã ở [2933](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:2933), cấp lại ở [2970](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:2970) và import ở [3060](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:3060) vẫn dựa vào danh sách mã trên trình duyệt rồi ghi riêng. Hai người quản trị có thể chọn cùng mã; registry có thể lệch sau đổi mã. Hồ sơ cũ dùng mã truy cập làm khóa còn có nguy cơ mất liên kết điểm khi đổi mã, theo [studentScoreKeys.js:3](C:/Users/khoac/kho-hoc-lieu/src/utils/studentScoreKeys.js:3).

**Cách sửa:** một dịch vụ cấp/đổi mã dùng transaction cho mọi đường vào; quy định `studentKey` bất biến và mã đăng nhập được phép thay đổi. Đối chiếu registry, lập kế hoạch backfill hồ sơ cũ và quan hệ bài làm/điểm trước khi chuyển đổi. Adapter đọc điểm theo hàng đã tồn tại, cần giữ tương thích dữ liệu cũ trong giai đoạn chuyển.

**Nghiệm thu:** cấp đồng thời không trùng; thêm tay/import/cấp lại đều dùng cùng dịch vụ; đổi mã vẫn giữ điểm, bài làm và lịch sử; mã được giải phóng hoặc giữ lại đúng chính sách đã chọn.

### 02. Nháp điểm có thể mất khi đóng hoặc đổi phạm vi

**Bằng chứng:** sổ điểm có dấu nháp tại [ScorebookWorkspace.jsx:3705](C:/Users/khoac/kho-hoc-lieu/src/components/ScorebookWorkspace.jsx:3705), nhưng đóng gọi `onClose` trực tiếp ở [3874](C:/Users/khoac/kho-hoc-lieu/src/components/ScorebookWorkspace.jsx:3874). Điểm nhanh xóa map khi tắt tại [useQuickScorebook.js:18](C:/Users/khoac/kho-hoc-lieu/src/hooks/useQuickScorebook.js:18); chuyển cơ sở xóa nháp ở [LearningResultsWorkspace.jsx:109](C:/Users/khoac/kho-hoc-lieu/src/components/LearningResultsWorkspace.jsx:109). Cảnh báo rời trang ở [App.jsx:3003](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:3003) chủ yếu bao phủ bài làm học sinh.

**Cách sửa:** đặt chặn điều hướng khi còn nháp với lựa chọn “Lưu / Giữ nháp / Bỏ thay đổi”; lưu nháp trong phiên theo tài khoản và tài liệu, tách đóng màn hình khỏi đăng xuất. Có thể bổ sung khôi phục nháp sau tải lại sau khi đã quy định rõ nơi lưu và vòng đời. Không tự lưu điểm chính thức khi người dùng chưa chọn lưu.

**Nghiệm thu:** đóng/mở, đổi cơ sở rồi quay lại, lưu lỗi và gõ trong lúc lưu đều giữ đúng nháp; đăng xuất/đổi tài khoản không hiển thị nháp của người trước.

### 03. Thao tác hoàn tất một phần và lỗi nhật ký bị báo như chưa xóa

**Bằng chứng:** [HocSinhManager.jsx:2921](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:2921) dùng `Promise.all` cho nhiều thao tác xóa độc lập; một lỗi không hoàn tác phần đã xóa. Xóa đơn ở [2900](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:2900) rồi ghi nhật ký, nhưng catch vẫn có thể báo chưa xóa nếu nhật ký lỗi. Cấp lại mã cũng ghi từng hồ sơ riêng.

**Cách sửa:** thao tác nhỏ dùng batch/transaction khi phù hợp; thao tác lớn có mã công việc, kết quả từng ID và thử lại phần chưa xong. Tách trạng thái thay đổi dữ liệu khỏi trạng thái nhật ký/đồng bộ. Với dữ liệu có lịch sử học tập, cân nhắc đánh dấu lưu trữ trước khi xóa cứng.

**Nghiệm thu:** giả lập một mục lỗi và lỗi nhật ký sau khi xóa; giao diện chỉ rõ đã xóa/chưa xóa, không khuyến khích chạy lại những mục đã hoàn tất.

### 04. Parser ngày tự chuyển ngày sai sang ngày khác

**Bằng chứng:** hai hàm tại [AdminSettingsWorkspace.jsx:1811](C:/Users/khoac/kho-hoc-lieu/src/components/AdminSettingsWorkspace.jsx:1811) và [ScorebookWorkspace.jsx:262](C:/Users/khoac/kho-hoc-lieu/src/components/ScorebookWorkspace.jsx:262) cùng tạo `Date` mà không so lại năm/tháng/ngày. Ngày sai từ dữ liệu văn bản/import có thể được nhận thành ngày khác; ảnh hưởng ngày trên học bạ, phân công và tính tuổi. Không phải khẳng định ô nhập ngày chuẩn của trình duyệt luôn cho phép nhập ngày sai.

**Cách sửa:** parser lịch dùng chung, kiểm định dạng và so lại từng thành phần sau khi tạo ngày; trả `null` cho ngày không tồn tại. Giữ chính sách xử lý ngày thiếu riêng của từng màn hình và tránh lệch ngày do múi giờ.

**Nghiệm thu:** từ chối 31/02, tháng 13, ngày 0; nhận đúng năm nhuận và ngày hợp lệ; tuổi/ngày xuất ở các màn hình khớp nhau.

### 05. Bản Google Doc có thể chứa đáp án và được chia sẻ theo link

**Bằng chứng:** [App.jsx:4319](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:4319) gửi toàn `savedContent` sang tạo tài liệu. [code_hoclieu.gs:1757](C:/Users/khoac/kho-hoc-lieu/apps-script/code_hoclieu.gs:1757) thêm nội dung vào Doc và [1761](C:/Users/khoac/kho-hoc-lieu/apps-script/code_hoclieu.gs:1761) đặt `ANYONE_WITH_LINK`. Loại URL khỏi metadata Firestore không thu hồi chia sẻ của file. Đây là hành vi nguồn đã xác nhận; quyền file thực tế và phiên bản Apps Script đang chạy chưa được kiểm tra.

**Cách sửa:** tạo bản học sinh đã loại đáp án và bản giáo viên riêng; hạn chế quyền bản giáo viên. Kiểm kê file cũ và thu hồi quyền không phù hợp theo kế hoạch có thể đối soát. Kiểm tra cả xuất HTML/Doc/PDF để tránh tạo thêm đường lộ đáp án.

**Nghiệm thu:** bản học sinh không có khối đáp án; tài khoản học sinh có URL bản giáo viên vẫn không đọc được; giáo viên vẫn sử dụng được tài liệu đúng quyền.

### 06. Quiz nhanh vẫn đưa đáp án và việc chấm xuống trình duyệt

**Bằng chứng:** [App.jsx:4876](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:4876) lưu `quizData`/`sourceContent` đầy đủ vào tài liệu; [5758](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:5758) chấm bằng client rồi [5782](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:5782) gửi kết quả. Rules dự thảo vẫn cho học sinh đọc tài liệu đúng phạm vi ở [firestore.rules.secure-ready:52](C:/Users/khoac/kho-hoc-lieu/firestore.rules.secure-ready:52). Chấm máy chủ theo tuần mới chưa thay thế đường này.

**Cách sửa:** dùng chung engine máy chủ cho quiz từ tài liệu: đề công khai chỉ có nội dung được phép đọc, đáp án riêng, lượt làm có định danh, nộp/chấm nguyên tử và chống nộp lại. Client gửi câu trả lời thay vì điểm. Đồng thời chuyển dữ liệu cũ và sửa bản xuất ở mục 05.

**Nghiệm thu:** đọc dữ liệu/response bằng tài khoản học sinh không lấy được đáp án trước thời điểm cho phép; sửa điểm trong request không thay đổi kết quả máy chủ; retry không tạo thêm lượt hoặc ghi điểm hai lần.

### 07. Chuyển đổi quyền/API còn thiếu nhiều luồng

**Bằng chứng:** ghi kết quả nhanh ở [App.jsx:5782](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:5782), tiến độ ở [5889](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:5889), bài tự luận ở [5666](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:5666) và yêu cầu hồ sơ ở [1687](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:1687) vẫn có đường ghi trực tiếp. [Rules dự thảo:50](C:/Users/khoac/kho-hoc-lieu/firestore.rules.secure-ready:50) chưa cấp các thao tác đó cho học sinh. API phát đề ở [serverQuiz.mjs:139](C:/Users/khoac/kho-hoc-lieu/netlify/lib/serverQuiz.mjs:139) chỉ nhận đề `auto`, trong khi giao diện còn luồng đề thủ công. Nguồn/tài liệu cũng cho thấy nhánh cũ còn dùng anonymous auth; quyền triển khai thực tế chưa được xác minh.

**Cách sửa:** lập ma trận Admin–Giáo viên–Học sinh × đọc/tạo/sửa/xóa từng loại dữ liệu. Hoàn tất API hoặc rules cho từng đường vào, có kiểm tra phạm vi trên máy chủ. Kiểm tra cả truy cập chéo cơ sở/khối/môn/năm và gọi trực tiếp bằng SDK. Chuyển đổi theo từng nghiệp vụ có kế hoạch quay lại, không bật cờ toàn bộ cùng lúc khi còn đường chưa hoàn thiện.

**Nghiệm thu:** tất cả hành trình hợp lệ chạy được; request ngoài quyền bị từ chối dù bỏ qua giao diện; không dựa vào bộ lọc màn hình để bảo vệ dữ liệu. Phải đạt mục 20 trước khi phát hành nhánh mới.

### 08. Quyền ghi sổ điểm chưa ràng buộc từng môn/ô và khóa năm

**Bằng chứng:** [firestore.rules.secure-ready:61](C:/Users/khoac/kho-hoc-lieu/firestore.rules.secure-ready:61) cho giáo viên tạo/cập nhật sổ khi khớp phạm vi cơ sở/khối, chưa giới hạn trường thay đổi, môn, nguồn điểm hoặc `inputYearLocks`. Kiểm tra khóa năm trong client không ngăn request SDK tự tạo. Phát hiện này chỉ liên quan đến rules dự thảo, không phải kết luận về rules đang triển khai.

**Cách sửa:** API lưu ô điểm kiểm tra phiên/phân công hiện tại, chỉ cho phép môn/ô/metadata hợp lệ; kiểm khóa năm và nguồn điểm trong giao dịch, ghi nhật ký đầy đủ. Sau khi giao diện đã dùng API, chặn ghi trực tiếp của giáo viên. Dùng chung schema/cấu hình với mục 15.

**Nghiệm thu:** giáo viên không sửa môn khác, metadata tùy ý, nguồn chấm máy chủ hoặc năm đã khóa; hai người sửa cùng ô nhận xung đột rõ ràng, sửa ô khác không mất dữ liệu.

### 09. Phiên Firebase chưa gắn đầy đủ với hạn/thu hồi phiên gốc

**Bằng chứng:** [identity.mjs:60](C:/Users/khoac/kho-hoc-lieu/netlify/functions/identity.mjs:60) tạo claims nhưng chưa có lease/hạn phiên. Apps Script có TTL 6 giờ và kiểm phiên ở [code_hoclieu.gs:22](C:/Users/khoac/kho-hoc-lieu/apps-script/code_hoclieu.gs:22). API quiz kiểm lại phiên nhân viên; rules chỉ dựa trên claims. Chưa tìm thấy cơ chế chủ động `revokeRefreshTokens` trong nguồn.

**Cách sửa:** thiết kế bản ghi phiên/lease máy chủ, hạn theo phiên gốc, gia hạn có kiểm tra và thu hồi khi khóa tài khoản/đổi phân công. Rules và API cùng thực thi chính sách. Cân nhắc nhiều phiên cùng tài khoản để thu hồi một phiên không vô tình phá tất cả phiên hợp lệ. Việc bật kiểm tra revoked token không tự tạo cơ chế thu hồi.

**Nghiệm thu:** hết phiên gốc hoặc thu hồi thì quyền đọc/ghi không còn dùng được sau giới hạn đã định; đổi phân công không giữ quyền cũ; không thể tự kéo dài phiên bằng liên tục gọi cầu đăng nhập.

### 10. Sao lưu chưa bao phủ toàn bộ dữ liệu và một thời điểm nhất quán

**Bằng chứng:** [backupManifest.js:1](C:/Users/khoac/kho-hoc-lieu/src/utils/backupManifest.js:1) có 18 collection công khai, chưa có ba collection riêng `server_quizzes`, `server_quiz_attempts`, `server_quiz_slots` ở [serverQuiz.mjs:110](C:/Users/khoac/kho-hoc-lieu/netlify/lib/serverQuiz.mjs:110). [systemBackup.js:15](C:/Users/khoac/kho-hoc-lieu/src/services/systemBackup.js:15) đọc từng nhóm; giao dịch sau đó chỉ đối chiếu settings/phân công. Manifest đã ghi rõ không chứa nội dung Drive và Sheet tài khoản, nhưng người sử dụng cần thấy giới hạn này. Khôi phục header đề cũ mà private head vẫn mới có thể làm đề không mở được.

**Cách sửa:** manifest có phiên bản cho toàn đồ thị đề–lượt–kết quả–điểm–định danh và subcollection cần thiết. Công cụ máy chủ xuất theo cơ chế snapshot nhất quán hoặc khóa ghi được mọi đường vào tuân thủ. Phân loại Drive/Sheet: phần được sao lưu, phần chỉ lưu tham chiếu và phần có chính sách riêng; hiển thị phạm vi và thời điểm bắt đầu/kết thúc trên giao diện.

**Nghiệm thu:** sao lưu/phục hồi thử vào môi trường riêng giữ đủ quan hệ và phiên bản đề; checksum/số lượng khớp; ghi đồng thời được chặn hoặc thuộc snapshot xác định rõ; không gọi bản lưu một phần là sao lưu toàn hệ thống.

### 11. Phục hồi cần khóa ghi, tiếp tục công việc và đối soát

**Bằng chứng:** [backupManifest.js:50](C:/Users/khoac/kho-hoc-lieu/src/utils/backupManifest.js:50) giới hạn 350 thao tác, [systemBackup.js:68](C:/Users/khoac/kho-hoc-lieu/src/services/systemBackup.js:68) giới hạn 7 MiB. Bước liệt kê ở [48](C:/Users/khoac/kho-hoc-lieu/src/services/systemBackup.js:48) và giao dịch ở [73](C:/Users/khoac/kho-hoc-lieu/src/services/systemBackup.js:73) chỉ bảo vệ các ref đã biết: tài liệu mới được thêm sau khi liệt kê có thể tồn tại ngoài kế hoạch phục hồi. Hộp thư Sheet được phục hồi riêng sau Firebase ở [AdminDataSafetyWorkspace.jsx:95](C:/Users/khoac/kho-hoc-lieu/src/components/AdminDataSafetyWorkspace.jsx:95). Màn hình đã có thông báo trường hợp dữ liệu chính xong nhưng hộp thư chưa xong; còn thiếu công việc bền vững để tiếp tục/đối soát.

**Cách sửa:** giữ giới hạn hiện tại đến khi có phương án thay thế. Job máy chủ có xem trước số mục thêm/sửa/xóa, checkpoint và retry; khóa ghi bắt buộc trên mọi đường hoặc phục hồi sang namespace/generation mới rồi đổi con trỏ nguyên tử. Ghi riêng trạng thái Firebase/Sheet/Drive và xác minh quan hệ trước công bố.

**Nghiệm thu:** hơn 350 mục, mất kết nối rồi tiếp tục, ghi đồng thời và lỗi Sheet đều có kết quả rõ; không có tài liệu ngoài snapshot lọt lại; không báo hoàn thành khi chưa đối soát.

## 5. Lỗi cạnh tranh và hoàn thiện trải nghiệm

### 12. Giới hạn đăng nhập có thể chặn cả lớp dùng chung IP

**Bằng chứng:** [identity.mjs:32](C:/Users/khoac/kho-hoc-lieu/netlify/functions/identity.mjs:32) đếm tối đa 10 lần/15 phút theo IP trước xác thực; đăng nhập thành công cũng được tính và không reset. Khi sử dụng cầu này, học sinh thứ 11 trong cùng Wi-Fi có thể bị từ chối dù mã đúng.

**Cách sửa:** tách giới hạn thử sai theo mã/tài khoản khỏi giới hạn đột biến theo IP; ngưỡng IP phải phù hợp tải một lớp. Xác định cách lấy IP đáng tin từ nền tảng, xử lý trường hợp thiếu header. **Nghiệm thu:** 40 học sinh hợp lệ chung IP đăng nhập được, thử sai liên tục vẫn bị hạn chế, header thiếu không gom sai mọi người thành một tài khoản.

### 13. Trạng thái bận của An toàn dữ liệu có thể bị yêu cầu khác xóa

**Bằng chứng:** các loader ở [AdminDataSafetyWorkspace.jsx:23](C:/Users/khoac/kho-hoc-lieu/src/components/AdminDataSafetyWorkspace.jsx:23) cùng ghi/xóa một biến `busy`; đổi tab ở [59](C:/Users/khoac/kho-hoc-lieu/src/components/AdminDataSafetyWorkspace.jsx:59) có thể mở yêu cầu mới khi sao lưu/phục hồi đang chạy. `finally` của yêu cầu cũ có thể xóa trạng thái thao tác mới.

**Cách sửa:** loading riêng cho từng tab, khóa thao tác thay đổi dữ liệu riêng, request ID/hủy yêu cầu cũ; chỉ yêu cầu sở hữu trạng thái được giải phóng trạng thái đó. **Nghiệm thu:** trả response sai thứ tự/đổi tab nhanh không bật lại nút thao tác khi phục hồi còn chạy.

### 14. Công thức có thể không hiện khi MathJax tải chậm

**Bằng chứng:** [index.html:13](C:/Users/khoac/kho-hoc-lieu/index.html:13) tải MathJax bất đồng bộ; cấu hình tắt tự typeset. [helpers.js:53](C:/Users/khoac/kho-hoc-lieu/src/utils/helpers.js:53) thoát nếu thư viện chưa sẵn sàng, không lưu yêu cầu chờ. Thử helper độc lập cho thấy không có lần gọi typeset sau khi thư viện sẵn sàng. Đây là lỗi điều kiện tải chậm, chưa đo tỷ lệ gặp trên trình duyệt thật.

**Cách sửa:** một promise readiness và hàng đợi typeset theo màn hình; khi ready chỉ xử lý phần còn mounted, có trạng thái lỗi/thử lại và phối hợp các lần typeset. Sau đó cân nhắc tải thư viện chỉ khi có nội dung toán. **Nghiệm thu:** giả lập mạng chậm/lỗi CDN, mở bài trước khi thư viện tải xong và đổi màn hình liên tục; công thức hiện đúng hoặc có thông báo có thể xử lý.

## 6. Logic lặp và tối ưu kiến trúc

### 15. Quy tắc tính điểm/xếp loại và cấu hình môn có nhiều bản

**Bằng chứng:** parse/format tại [App.jsx:398](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:398), [HocSinhManager.jsx:687](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:687), [ScorebookWorkspace.jsx:387](C:/Users/khoac/kho-hoc-lieu/src/components/ScorebookWorkspace.jsx:387); tính học kỳ tại [App.jsx:2153](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:2153), [HocSinhManager.jsx:827](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:827), [ScorebookWorkspace.jsx:1512](C:/Users/khoac/kho-hoc-lieu/src/components/ScorebookWorkspace.jsx:1512). Backend còn lặp ánh xạ môn/tên mẫu ở [serverQuiz.mjs:7](C:/Users/khoac/kho-hoc-lieu/netlify/lib/serverQuiz.mjs:7). Sự lặp đã xác nhận, chưa chứng minh mọi kết quả hiện tại đều sai.

**Cách sửa:** module tính thuần dùng chung trọng số/làm tròn/điểm trống/xếp loại, trả cả trạng thái đủ dữ liệu. Mỗi màn hình giữ adapter đọc dữ liệu riêng, bao gồm dữ liệu theo hàng cũ. Cấu hình môn/ô/mẫu có schema version dùng được cả frontend và backend. So sánh kết quả hiện tại trước khi thay; giữ khác biệt nghiệp vụ có chủ đích giữa điểm số và môn đánh giá.

**Nghiệm thu:** một bộ fixture cho bảng điểm, học bạ, quá trình học và chuyển năm cho cùng kết quả; điểm 0, điểm trống, thiếu môn và giá trị biên được xử lý đúng; không thay tiêu chí nghiệp vụ trong lúc refactor.

### 16. Hai bản bảng nhập điểm nhanh cần chung phần lõi

**Bằng chứng:** bảng giáo viên ở [App.jsx:6906](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:6906), bảng quản trị ở [LearningResultsWorkspace.jsx:294](C:/Users/khoac/kho-hoc-lieu/src/components/LearningResultsWorkspace.jsx:294) lặp dựng ô, draft, tô màu, bàn phím, blur và lưu. **Hai bảng nằm ở hai nhánh vai trò khác nhau, không phải lỗi hiển thị hai bảng cùng lúc.**

**Cách sửa:** `QuickScoreTable`/`QuickScoreCell` dùng chung, wrapper giữ toolbar và quyền riêng của từng vai trò. Làm sau mục 02 và cùng mô hình điểm mục 15. **Nghiệm thu:** Admin/giáo viên vẫn đủ chức năng, nhập bàn phím và điện thoại không đổi hành vi, không sửa một phiên bản rồi bỏ sót phiên bản kia.

### 17. Listener đọc rộng và bị mở lại theo thay đổi không liên quan

**Bằng chứng:** [App.jsx:1911](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:1911) mở 11 listener chung; dependencies ở [1936](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:1936) gồm khối, môn, học sinh. [scopedQueries.js:7](C:/Users/khoac/kho-hoc-lieu/src/services/scopedQueries.js:7) cho Admin đọc collection rộng; nhiều query chưa giới hạn năm học.

**Cách sửa:** hook theo nghiệp vụ, chỉ bật dữ liệu khi màn hình cần dùng; menu/dashboard dùng thống kê nhẹ, lịch sử phân trang. Thêm phạm vi năm/cơ sở/khối/môn đúng nghiệp vụ; các tác vụ cần toàn danh sách tải riêng khi thực hiện. Không làm mất truy vấn cần thiết cho đối soát/export. Chỉ thêm index sau khi xác minh query cần nó.

**Nghiệm thu:** đo listener đang mở, lượt đọc và thời gian mở trang trước/sau; đổi môn không mở lại tuyển sinh/điểm danh không liên quan; số tổng hợp và quyền dữ liệu vẫn đúng. Chưa có số đo chi phí để hứa mức tiết kiệm cụ thể.

### 18. Bảng học sinh và điểm nhanh dựng toàn bộ dòng

**Bằng chứng:** [HocSinhManager.jsx:4572](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:4572), [LearningResultsWorkspace.jsx:273](C:/Users/khoac/kho-hoc-lieu/src/components/LearningResultsWorkspace.jsx:273), [App.jsx:7011](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:7011). Sổ chính đã phân trang 40 học sinh ở [ScorebookWorkspace.jsx:1437](C:/Users/khoac/kho-hoc-lieu/src/components/ScorebookWorkspace.jsx:1437), nên giữ cơ chế đang có.

**Cách sửa:** phân trang 40–100 dòng trước, chỉ dùng virtualization nếu phép đo cho thấy cần. Lưu draft theo định danh thay vì vị trí trang; “chọn tất cả” và export phải độc lập với trang đang hiển thị. **Nghiệm thu:** 1.000–5.000 hồ sơ giả không dựng toàn bộ input; lọc/chuyển trang/bàn phím không trỏ nhầm, export và chọn tất cả không thiếu hồ sơ.

### 19. App còn giữ quá nhiều state và hiệu ứng của nhiều tính năng

**Bằng chứng:** `App.jsx` khoảng **10.336 dòng**, 239 `useState`, 60 `useEffect`; AdminSettings 6.106 dòng, HocSinhManager 5.163, ScorebookWorkspace 4.363. [LearningResultsWorkspace.jsx:7](C:/Users/khoac/kho-hoc-lieu/src/components/LearningResultsWorkspace.jsx:7) nhận 57 biến qua `view`. Đây là bằng chứng về độ phức tạp, không tự nó chứng minh render chậm.

**Cách sửa:** chuyển cả state/effect và UI theo từng feature, thay túi props lớn bằng API rõ. Thứ tự phù hợp: phiên đăng nhập → hộp thư/tuyển sinh → quiz → nhập điểm → sao lưu. Đo bằng React Profiler và Network trước/sau từng đợt; giữ cùng hành vi để dễ khoanh lỗi. Tiếp tục lazy-load phần nặng khi thật sự cần thay vì chỉ chia tên file.

**Số đo bản dựng hiện tại:**

| Phần | Kích thước sau minify | Gzip |
| --- | ---: | ---: |
| Chunk chính | 523,27 kB | 143,03 kB |
| Firebase | 349,26 kB | 107,86 kB |
| React | 134,07 kB | 43,05 kB |
| CSS | 120,74 kB | 19,91 kB |
| Mẫu sổ điểm | 898,63 kB | 141,79 kB |
| AdminSettings | 247,11 kB | 65,63 kB |
| HocSinhManager | 171,31 kB | 43,40 kB |
| ScorebookWorkspace | 139,14 kB | 36,54 kB |

Các chunk màn hình/mẫu không nhất thiết được tải cùng lúc. Kiểm tra Network mới xác định tải ban đầu thực tế. Mẫu sổ điểm chứa cấu trúc xuất cần bảo toàn; không cắt bớt tùy tiện để giảm dung lượng. **Nghiệm thu:** cùng dữ liệu và thiết bị kiểm thử, tải/mở màn hình và nhập điểm không chậm hơn; state cũ không rò qua tài khoản/phạm vi; xuất sổ vẫn giữ mẫu. Không nâng ngưỡng cảnh báo để gọi đó là tối ưu.

### 20. Quy trình kiểm chứng chưa bao phủ Functions, Rules và hành trình thật

**Bằng chứng:** [package.json:8](C:/Users/khoac/kho-hoc-lieu/package.json:8) chạy Vite thuần, trong khi [serverQuizClient.js:35](C:/Users/khoac/kho-hoc-lieu/src/services/serverQuizClient.js:35) gọi `/.netlify/functions/quiz`. Repo chưa có workflow CI, cấu hình Firebase emulator/deploy hay manifest indexes; chưa có bộ kiểm thử trình duyệt. Thiếu file index không chứng minh mọi query đều thiếu index.

**Cách sửa:** môi trường local chạy đồng thời web và Functions, Firebase Emulator dùng dữ liệu giả và mock Apps Script; bổ sung kiểm thử ma trận quyền và hành trình Admin/Giáo viên/Học sinh. CI chạy check hiện có cộng kiểm thử cần thiết; lưu rules/indexes đã xác minh và checklist cờ cấu hình/migration/rollback. Khi có điều kiện, chạy staging cho tích hợp Drive/Sheet thật trước phát hành. Hiện không có môi trường cloud thử riêng, vẫn có thể kiểm chứng nhiều phần bằng emulator local.

**Nghiệm thu:** máy mới dựng được môi trường theo tài liệu; mọi vai trò có luồng hợp lệ và trường hợp bị từ chối; không cần bật cờ lên hệ thống thật để thử. Check đạt là điều kiện cần, chưa thay thế thử migration/restore và quyền thực tế.

### 21. Chuỗi dependency phát triển Tailwind có cảnh báo mới

**Bằng chứng:** npm hiện báo 5 mục high: `braces`, `chokidar`, `micromatch`, `fast-glob`, `tailwindcss`. Đây là các package trong cùng chuỗi bị ảnh hưởng bởi cảnh báo `braces`, không phải năm lỗ hổng production độc lập. Advisory mô tả khả năng làm đầy stack khi xử lý mẫu brace lồng sâu; tại thời điểm kiểm tra, advisory chưa liệt kê bản vá cho `braces` <=3.0.3. [GitHub Advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

**Cách sửa:** thử loại chuỗi bị ảnh hưởng bằng nâng Tailwind có kiểm soát trên nhánh riêng. npm đề xuất Tailwind 4.3.3, là nâng major; cần đổi cấu hình/CSS và kiểm tra giao diện cùng yêu cầu trình duyệt thực tế. Không chạy ép tự sửa dependency rồi coi là xong. [Hướng dẫn nâng cấp chính thức Tailwind](https://tailwindcss.com/docs/upgrade-guide).

**Nghiệm thu:** audit xác nhận đường dependency ảnh hưởng đã được loại hoặc có phương án được ghi rõ; bản dựng và màn hình/print/export được so sánh; thiết bị trường dùng vẫn được hỗ trợ. Kiểm tra bỏ dev hiện báo 0, nhưng con số này không chứng nhận toàn ứng dụng an toàn.

## 7. Tính năng cần bổ sung và luồng cần hoàn thiện

### 22. Lịch sử/tổng hợp kết quả học sinh cho nhánh chấm máy chủ

**Bằng chứng:** [scopedQueries.js:21](C:/Users/khoac/kho-hoc-lieu/src/services/scopedQueries.js:21) dừng listener `quiz_results` học sinh khi bật server quiz; [serverQuiz.mjs:117](C:/Users/khoac/kho-hoc-lieu/netlify/lib/serverQuiz.mjs:117) chưa có API lịch sử. [App.jsx:5964](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:5964) mới lấy kết quả đề đang mở.

**Cách sửa:** API lịch sử phân trang và summary theo học sinh/năm/môn; lược đáp án, tuân thủ thời điểm công bố/ẩn điểm. Nối màn hình quá trình học và kết quả, hỗ trợ dữ liệu cũ qua adapter khi chuyển đổi. **Nghiệm thu:** tải lại/đăng nhập lại vẫn thấy đủ lượt của chính mình; tổng hợp khớp lịch sử; không đọc lịch sử người khác hoặc đáp án bị ẩn. Làm trước khi bỏ listener legacy.

### 23. Hàng đợi đồng bộ Firebase–Sheet

**Bằng chứng:** duyệt đăng ký đã có `sheetSync.pending/failed/success` và retry ở [HocSinhManager.jsx:3508](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:3508). Thêm/sửa tay tại [2773](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:2773) chưa giữ công việc retry lâu dài khi Sheet lỗi; duyệt yêu cầu hồ sơ ở [3574](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:3574) còn có đường xóa yêu cầu sau lỗi đồng bộ.

**Cách sửa:** mở rộng outbox chung, ghi thay đổi và công việc đồng bộ trong cùng transaction Firebase; worker xử lý idempotent theo phiên bản, retry có giới hạn. Màn hình quản trị cho thấy mục chờ/lỗi, lý do và nút thử lại/đối soát. Tận dụng trạng thái đang có thay tạo thêm bảng theo dõi không nối vào luồng.

**Nghiệm thu:** tải lại sau lỗi vẫn thấy việc còn chờ; retry không thêm dòng trùng; job cũ không ghi đè dữ liệu sửa mới. Nếu Sheet là nguồn bắt buộc cho hoạt động tiếp theo, nâng mục này lên P1 trong kế hoạch thực hiện.

### 24. Vòng đời generation phân công

**Bằng chứng:** [teachingAssignments.js:38](C:/Users/khoac/kho-hoc-lieu/src/services/teachingAssignments.js:38) tạo generation mới, ghi chunks rồi đổi pointer; chưa có quy trình dọn phiên bản cũ/orphan sau lần ghi hỏng. Đây là dữ liệu tích lũy, không phải module chết.

**Cách sửa:** job máy chủ liệt kê với chế độ xem trước, giữ generation đang dùng và số bản lịch sử theo chính sách; dọn orphan sau khoảng an toàn. Nhận diện generation đang staging/phục hồi để không xóa nhầm. **Nghiệm thu:** dọn song song với lưu/restore không làm mất bản hiện hành; số lượng/checksum và khả năng đọc không đổi; lịch sử được giữ đúng chính sách.

### 25. Thống kê “Dữ liệu hiện tại” cần thời điểm và trạng thái tải

**Bằng chứng:** [App.jsx:693](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:693) khởi tạo snapshot rỗng; snapshot được cập nhật khi [buildSystemSnapshot ở 3103](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:3103) chạy. [AdminDataSafetyWorkspace.jsx:172](C:/Users/khoac/kho-hoc-lieu/src/components/AdminDataSafetyWorkspace.jsx:172) dùng số từ snapshot nên ban đầu có thể là 0 hoặc bản cũ.

**Cách sửa:** hiển thị “Chưa lấy thống kê”, trạng thái tải và “Dữ liệu lúc …”; cập nhật thống kê khi mở/nhấn làm mới hoặc dùng counters thích hợp. **Nghiệm thu:** chưa tải không hiển thị 0 như số thật, có thời điểm, lỗi tải không làm mất thông tin bản trước.

## 8. Code/asset chưa dùng và dọn dẹp

### 26. Cấu hình và helper bị sao chép

**Bằng chứng:** khóa phiên ở [helpers.js:34](C:/Users/khoac/kho-hoc-lieu/src/utils/helpers.js:34), [adminSession.js:4](C:/Users/khoac/kho-hoc-lieu/src/utils/adminSession.js:4), [serverQuizClient.js:38](C:/Users/khoac/kho-hoc-lieu/src/services/serverQuizClient.js:38); endpoint đăng ký ở App và HocSinhManager. Helper gợi ý tên giáo viên tại [AdminSettingsWorkspace.jsx:119](C:/Users/khoac/kho-hoc-lieu/src/components/AdminSettingsWorkspace.jsx:119)/[SimpleScheduleTable.jsx:72](C:/Users/khoac/kho-hoc-lieu/src/components/SimpleScheduleTable.jsx:72); tách Drive ID tại [ClassOpsManager.jsx:39](C:/Users/khoac/kho-hoc-lieu/src/components/ClassOpsManager.jsx:39)/[HocSinhManager.jsx:899](C:/Users/khoac/kho-hoc-lieu/src/components/HocSinhManager.jsx:899).

**Cách sửa:** nguồn cấu hình phiên/endpoint duy nhất; helper nhỏ chia theo miền. Giữ phân biệt escape HTML và sanitizer, giữ fallback năm học riêng nếu nghiệp vụ khác nhau; không gom tất cả vào một file tiện ích khổng lồ. **Nghiệm thu:** đổi cấu hình một nơi có tác dụng ở mọi nhánh; fixture xác nhận hành vi cũ; không vô tình đổi luồng phiên hoặc xuất HTML. Lợi ích chính là bảo trì, dung lượng giảm ít.

### 27. Asset mẫu chưa có tham chiếu

**Bằng chứng:** `src/assets/hero.png` (13.057 byte), `public/icons.svg` (5.031 byte), `public/favicon.svg` (9.522 byte) chưa có tham chiếu trong import/HTML/CSS/nguồn đang chạy. `index.html` chưa nối favicon SVG. Không khẳng định các URL này không được sử dụng ngoài repository.

**Cách sửa:** xác nhận mục đích rồi loại hero/icons nếu không dùng; favicon thay bằng biểu tượng phù hợp và khai báo trong HTML hoặc loại khỏi public. **Nghiệm thu:** không mất asset được dùng, favicon hiển thị đúng. Hero không được import nên xóa nó không làm bundle JavaScript nhỏ đi; asset trong public có thể giảm tệp phát hành.

### 28. Tệp vá, khôi phục và chẩn đoán còn ở root

**Bằng chứng:** còn `reconstruct_from_git.cjs`, `admin_edit_4786.txt`, `admin_handle_from_7adaba85.txt`, `edits_to_apply.json`, `firebase_debug.json`, `found_ban_moi.txt`, `func3.txt`, `func4.txt`, `pc_cm_func*.txt`, `responses.txt`, cùng `backup_corrupted/`. [archive/recovery-2026-10-03/README.md](C:/Users/khoac/kho-hoc-lieu/archive/recovery-2026-10-03/README.md) đã có danh mục lịch sử, có thể mở rộng. Không đọc nội dung dump cấu hình trong lượt này.

**Cách sửa:** lập danh mục còn cần giữ, chuyển lịch sử sang archive có lý do và nguồn gốc; đưa tệp chẩn đoán tái tạo được vào ignore khi phù hợp. Giữ công cụ push Git nếu đang dùng và ghi rõ đây là tooling. Không chạy lại script khôi phục hay xóa bản dự phòng chỉ vì tên.

**Nghiệm thu:** cây nguồn dễ đọc hơn, không mất bản khôi phục cần thiết và không thay hành vi ứng dụng. Những tệp này không được import vào runtime, nên việc dọn giúp bảo trì/review hơn là tăng tốc web.

### Những phần không nên xóa trong lượt dọn

- Nhánh server quiz/scoped auth và Netlify: đã có điểm nối, đang chờ hoàn thiện điều kiện chuyển đổi.
- Nhánh legacy còn phục vụ dữ liệu/luồng cũ: chỉ loại sau khi có migration, kiểm chứng hành trình và phương án quay lại.
- Export dùng nội bộ hoặc trong kiểm thử: tìm không thấy import ở một màn hình chưa đủ để kết luận thừa.
- Mẫu sổ điểm và plugin dựng mẫu: cần cho xuất dữ liệu, có kiểm thử bảo toàn cấu trúc.
- Adapter định danh/đọc điểm cũ, kiểm tra xung đột, khóa năm, hủy request: cần giữ khi refactor.
- Archive và backup: có chính sách lưu trữ riêng, không cùng loại với mã chạy ứng dụng.

## 9. Lộ trình đề xuất

| Đợt | Mục tiêu | Nhóm việc | Điều kiện chuyển đợt |
| --- | --- | --- | --- |
| 1 | Sửa lỗi có thể mất/sai dữ liệu trong luồng hiện có | 01–04; xử lý 13; kiểm kê nguồn đáp án ở 05–06 | Có kiểm thử concurrent/failure/draft; dữ liệu cũ còn đọc được |
| 2 | Làm bảo mật và chấm máy chủ thành luồng đầy đủ | 20 trước, rồi 05–09, 12, 22; phối hợp 10–11 | Ma trận quyền và hành trình đạt; không còn đường phát đáp án; backup/rollback đã thử |
| 3 | Hoàn thiện phục hồi và đồng bộ | 10–11, 23–25 | Phục hồi thử, đối soát và tiếp tục sau lỗi đạt; phạm vi backup rõ |
| 4 | Gom logic và giảm dữ liệu/tải giao diện | 15–19, 26; xử lý 14 và 21 trên thay đổi riêng | Kết quả nghiệp vụ giữ nguyên; có số đo trước/sau và so giao diện |
| 5 | Dọn repository và loại legacy đủ điều kiện | 27–28, generation 24; nhánh legacy đã chuyển xong | Không xóa dữ liệu/mã còn dùng; có danh mục lưu trữ và kiểm tra regression |

Một số nhóm được làm song song, nhưng **không gộp nâng Tailwind, refactor App, migration định danh và đổi quyền trong một lần phát hành**: khi lỗi xảy ra sẽ khó xác định nguyên nhân và quay lại.

**Năm việc nên bắt đầu:** giữ nháp điểm (02), parser ngày (04), thống nhất cấp mã (01), kết quả thao tác từng phần (03), dựng môi trường kiểm chứng quyền/API (20). Song song kiểm kê đường xuất đáp án (05–06); chưa triển khai quyền mới trước khi các mục 07–11 đạt điều kiện.

Tính năng bổ sung có giá trị nhất lúc này là **khôi phục nháp, lịch sử kết quả, hàng đợi đồng bộ có thử lại, phục hồi có xem trước/tiếp tục và thống kê trạng thái dữ liệu**. Ưu tiên khép kín các luồng đã có trước khi thêm chức năng ngoài phạm vi dự án.

## 10. Tiêu chí coi đợt hoàn thiện đã đạt

1. Các lỗi ưu tiên P1 ở luồng đang dùng có tình huống tái hiện và kiểm thử chống tái phát; tác vụ thất bại một phần báo đúng kết quả.
2. Cấp/đổi mã không phá định danh; nháp và kết quả học tập giữ đúng tài khoản/phạm vi.
3. Nhánh bảo mật mới có ma trận quyền, kiểm thử emulator, hành trình trình duyệt và kiểm chứng triển khai; đáp án không xuất hiện ở nguồn mà học sinh đọc được trước khi được phép.
4. Bản sao lưu nêu rõ phạm vi; phục hồi thử giữ quan hệ dữ liệu và tiếp tục/đối soát được sau lỗi.
5. Các màn hình dùng cùng quy tắc điểm; tối ưu listener/DOM/tải trang được đo bằng cùng dữ liệu trước/sau.
6. Kiểm thử, kiểm tra mã/cú pháp và bản dựng đạt; cảnh báo dependency có kết quả xử lý rõ; dữ liệu cũ và mẫu xuất vẫn tương thích.

Báo cáo này đánh giá phiên bản nguồn tại thời điểm rà soát. Các số dòng có thể thay đổi sau khi sửa; khi triển khai cần đối chiếu lại đường mã và cấu hình môi trường thực tế.
