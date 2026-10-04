# Báo cáo rà soát, sửa lỗi và phương án bổ sung — 04/10/2026

Đã sửa tiếp các lỗi xác định được trong mã nguồn, chạy kiểm thử hồi quy và Firebase giả lập. Các thay đổi hiện nằm trong máy; **chưa triển khai lên Netlify hoặc hai Google Web App**. Báo cáo này cập nhật tình trạng so với báo cáo ngày 03/10, không thay thế việc nghiệm thu bằng tài khoản và dữ liệu thử trên dịch vụ thật.

## 1. Những phần đã sửa trong lượt này

| Vấn đề | Kết quả sửa | Kiểm chứng và giới hạn |
| --- | --- | --- |
| Nháp điểm mất khi đóng màn hình hoặc đổi cơ sở | Giữ nháp từng sổ ở phiên đăng nhập; mở lại đúng phạm vi tiếp tục nhập. Điểm nhanh không xóa nháp khi đóng/đổi cơ sở. Đổi danh tính tách kho nháp. | Kiểm thử đóng/mở, chuyển sổ, lưu lỗi, sửa trong lúc lưu và đổi tài khoản. **Chưa khôi phục được sau tải lại trình duyệt**; có cảnh báo rời trang khi còn nháp. |
| Giáo viên có thể mở hai giao diện điểm nhanh | Giới hạn cửa sổ Kết quả học tập riêng cho Admin; giáo viên dùng bảng theo môn của mình. | Đã rà điều kiện kết nối trong App và dựng ứng dụng. Chưa nghiệm thu toàn hành trình giáo viên trên dịch vụ thật. |
| Ngày sai bị tự đổi thành ngày khác | Dùng parser lịch chung cho sổ/học bạ và quản lý phân công; từ chối 31/02, tháng 13, ngày 0, kể cả đường nhập ngày phân công thiếu năm. | Kiểm thử ngày nhuận, ngày không tồn tại, ISO và ngày trong ghi chú. Giữ cách suy ra năm học của từng nghiệp vụ. |
| Công thức toán không hiện nếu thư viện tải chậm | Giữ yêu cầu chờ; đợi thư viện và khởi tạo xong, xử lý tuần tự, bỏ phần đã đóng. Có thông báo khi tải lỗi; tải quá chậm rồi hoàn tất vẫn xử lý lại. | Kiểm thử tải chậm, hết thời gian chờ, hồi phục và nhiều yêu cầu đồng thời. Chưa đo tốc độ trên điện thoại thật. |
| Mở An toàn dữ liệu tạo tác vụ sao lưu chỉ để lấy số liệu | Thống kê dùng truy vấn đếm riêng; nhánh xác thực mới có API chỉ đọc dành cho Admin. Mở màn hình không chụp snapshot hoặc tạo job/khóa bảo trì. | Kiểm thử giao diện, dịch vụ và Firestore SDK thật trên emulator; giáo viên/học sinh không dùng được API thống kê. |
| Số liệu chưa tải bị hiển thị như 0 hoặc như dữ liệu mới | Hiển thị đang tải/chưa tải, thời điểm thống kê và nút làm mới. Lỗi làm mới giữ số liệu gần nhất. Cập nhật lại sau sao lưu/phục hồi/tiếp tục công việc. | Kiểm thử lúc chưa có số liệu, số 0 thật và lỗi mạng. Tổng hồ sơ tính toàn collection, **không phải số học sinh đang học trong năm được chọn**. |
| Sao lưu tự động/trước thao tác nguy hiểm chưa xác nhận file đã lưu | Các đường này xác nhận hoàn tất xuất Drive với job máy chủ; chặn lượt sao lưu hằng ngày trùng đang chạy; chỉ ghi ngày thành công sau hoàn tất. | Kiểm tra điểm nối App; dịch vụ kiểm thử xác nhận xuất và tiếp tục job. Sao lưu hằng ngày vẫn phụ thuộc Admin mở ứng dụng. |
| Xóa một thư có thể lệch dòng khi xóa hàng loạt/phục hồi diễn ra cùng lúc | Tìm ID và xóa trong cùng khóa Script. Xóa lại ID đã mất trả kết quả đã xóa, không xóa dòng khác. Nhật ký thất bại được báo riêng. | Kiểm thử khóa, retry, thiếu ID và lỗi nhật ký sau khi đã xóa. |
| Xóa hàng loạt bị gián đoạn nhưng không biết đã xóa bao nhiêu | Sao lưu trước ghi; báo số đã xóa, số chưa xóa và cảnh báo khi lỗi xảy ra giữa chừng. Không tạo bản lưu nếu không có thư khớp bộ lọc. | Kiểm thử lỗi giữa chừng và lỗi sao lưu; khi sao lưu lỗi chưa xóa dòng nào. |
| Gửi lại thư dùng trạng thái chưa đọc cũ và ghi từng dòng | Khóa tìm/đọc/ghi; đọc lại người đã đọc, loại mã trùng và ghi một lô. Giao diện hiển thị số người thực sự được gửi, xử lý cả trường hợp không còn ai cần gửi. | Kiểm thử dữ liệu cũ, mã trùng, ghi một lô, thư không còn tồn tại và lỗi nhật ký. **Chưa có khóa chống trùng cho lần gửi lại mất phản hồi mạng**. |
| Sao chép khóa phiên và URL đăng ký | Tách nguồn cấu hình chung; helper, quản lý phiên, API và các màn hình đọc cùng nguồn. Bỏ một prop không còn dùng của bảng điểm. | Lint và kiểm thử API/phiên đạt. Chưa gom mọi helper theo nghiệp vụ vì một số khác biệt liên quan dữ liệu cũ. |
| Thông báo lỗi dùng sai tên chức năng | API dùng chung không còn báo lỗi “chấm bài” khi thực hiện thống kê/bảo trì. An toàn dữ liệu nêu rõ phạm vi bản lưu. | Bản lưu không chứa nội dung tệp Drive, bảng đăng ký gốc hoặc bảng tài khoản giáo viên; cần kế hoạch riêng cho những nguồn này. |

Mã liên quan:

- Nháp và điều hướng: [useScorebookDraft.js](C:/Users/khoac/kho-hoc-lieu/src/hooks/useScorebookDraft.js:10), [useQuickScorebook.js](C:/Users/khoac/kho-hoc-lieu/src/hooks/useQuickScorebook.js:7), [App.jsx](C:/Users/khoac/kho-hoc-lieu/src/App.jsx:1876).
- Ngày hợp lệ: [calendarDate.js](C:/Users/khoac/kho-hoc-lieu/src/utils/calendarDate.js:2).
- Hiển thị toán: [mathTypesetting.js](C:/Users/khoac/kho-hoc-lieu/src/utils/mathTypesetting.js:1). Cách tuần tự hóa theo [tài liệu MathJax 3](https://docs.mathjax.org/en/v3.2/advanced/typeset.html).
- Thống kê: [systemSummary.js](C:/Users/khoac/kho-hoc-lieu/src/services/systemSummary.js:7), [serverSystem.mjs](C:/Users/khoac/kho-hoc-lieu/netlify/lib/serverSystem.mjs:33), [AdminDataSafetyWorkspace.jsx](C:/Users/khoac/kho-hoc-lieu/src/components/AdminDataSafetyWorkspace.jsx:30).
- Thư và nhật ký: [code_hoclieu.gs](C:/Users/khoac/kho-hoc-lieu/apps-script/code_hoclieu.gs:1546).
- Cấu hình: [sessionKeys.js](C:/Users/khoac/kho-hoc-lieu/src/config/sessionKeys.js:1), [registration.js](C:/Users/khoac/kho-hoc-lieu/src/config/registration.js:1).

Trong báo cáo cũ, nhận xét mục 16 rằng hai bảng luôn ở nhánh vai trò riêng cần cập nhật: điều kiện hiện tại cho phép giáo viên có `quickScoreLockedContext` đi vào cả cửa sổ Admin và bảng giáo viên. Đã sửa điều kiện này. Việc hai bảng còn lặp cấu trúc ô nhập là vấn đề bảo trì riêng.

## 2. Kết quả kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Toàn bộ kiểm thử tại máy | **144 bài: 142 đạt, 0 thất bại, 2 bỏ qua** vì cần emulator; có bài kiểm thử con trong tổng số này. |
| Phân quyền và backup/restore trên Firebase emulator | **8/8 đạt**, không bỏ qua; project demo trên localhost, không dùng dữ liệu hoặc credential thật. Có kiểm tra truy vấn đếm mới bằng SDK thật. |
| Kiểm thử màn hình thống kê sau bổ sung thông tin phạm vi bản lưu | Đạt. |
| Lint | Đạt, không cảnh báo. |
| Cú pháp Apps Script/JavaScript biểu mẫu/manifest/JSON triển khai | Đạt. Không gọi Google để xác minh quyền thật. |
| Dựng production | Thành công. Vẫn có cảnh báo chunk lớn. |
| Kiểm tra thay đổi văn bản | Không có lỗi whitespace; Git có nhắc chuyển LF sang CRLF trên Windows. |
| Kiểm tra thư viện chạy ứng dụng: `npm audit --omit=dev` | **0 cảnh báo tại thời điểm kiểm tra**; không phải chứng nhận an toàn toàn ứng dụng. |
| Kiểm tra toàn bộ dependency | **5 mục high**: braces, chokidar, micromatch, fast-glob, tailwindcss. Cùng chuỗi công cụ phát triển liên quan braces, không phải 5 lỗi runtime độc lập. |

Giữ Tailwind 3 theo yêu cầu hỗ trợ thiết bị/trình duyệt cũ. Bộ chặn độ sâu pattern trong công cụ build đã có và kiểm thử đạt; đây là giảm thiểu cục bộ, **không làm npm audit hết cảnh báo**. Advisory hiện chưa liệt kê bản vá braces; cần theo dõi để thay giảm thiểu bằng bản vá chính thức khi có. [GitHub Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

Chưa kiểm chứng đầy đủ hành trình nhiều vai trò trên trình duyệt thật, quyền Drive/Sheet, cấu hình môi trường hosting, Rules/indexes đang triển khai hoặc dữ liệu cũ trên hệ thống thật. Không ghi/xóa/migrate dữ liệu thật trong lượt này.

## 3. Code chưa kết nối, lặp lại và phần cần tối ưu

### Kết nối mã nguồn

Quét các import/export tương đối và import động dạng chuỗi từ `src/main.jsx` và năm Netlify Functions: **114/114 mô-đun JS/JSX/MJS trong src/netlify có đường nối; không thấy đường import tương đối bị mất đích**. Build thành công bổ sung bằng chứng về liên kết. Đây là kiểm tra đường nối tệp, không chứng minh từng nhánh nghiệp vụ đều được người dùng mở hoặc được bật trên hosting.

Nhánh scoped auth/chấm bài/bảo trì có cờ cấu hình và còn nhánh legacy. Không xóa chúng như code chết: chúng phục vụ chuyển đổi có đối soát và khả năng quay lại. Mẫu sổ điểm và plugin nén mẫu cũng đang được sử dụng, có kiểm thử bảo toàn nội dung xuất.

### Những phần còn lặp hoặc quá lớn

| Phần | Tình trạng hiện tại | Phương án |
| --- | --- | --- |
| App | Khoảng 10.017 dòng; còn điều phối nhiều nghiệp vụ. | Tách state/effect và API theo tính năng, bắt đầu hộp thư/tuyển sinh rồi nhập điểm/quiz. Giữ điều phối vai trò và phạm vi nhỏ ở App. Mỗi đợt so lại hành vi và listener. |
| AdminSettings / HocSinhManager / ScorebookWorkspace | Khoảng 6.102 / 4.811 / 4.325 dòng. | Tách tab/toolbar/modal và luồng nhập/xuất, giữ dịch vụ ghi/đối soát tập trung; không chuyển nguyên khối code chỉ để làm số dòng nhỏ đi. |
| Bảng điểm nhanh Admin/Giáo viên | Đã dùng chung hook lưu và tính điểm; vẫn lặp phần dựng bảng, ô nhập và thao tác bàn phím. | Tách bảng/ô dùng chung, wrapper giữ quyền và toolbar. Kiểm tra điểm 0, ô trống, blur/Enter, nháp, điện thoại và thay phạm vi. |
| Bảng nhiều học sinh | Điểm nhanh và một số bảng hồ sơ còn dựng toàn danh sách. Sổ chính đã có phân trang. | Đo trên 1.000–5.000 hồ sơ giả; phân trang 40–100 dòng, nháp theo ID. Chọn tất cả và xuất phải dùng tập kết quả đầy đủ. |
| Helper theo nghiệp vụ | Một số helper tên giáo viên, tách Drive ID và chuẩn hóa chuỗi vẫn có adapter riêng. | Gom phần thực sự tương đương bằng fixture; giữ ánh xạ khóa điểm/định danh cũ. Không đổi thuật toán tạo khóa chỉ vì chuẩn hóa tìm kiếm mới. |

Bản dựng đã đo: chunk chính khoảng **535,31 kB / gzip 147,43 kB**, Firebase **352,05 / 108,73 kB**, CSS **120,96 / 19,92 kB**, mẫu sổ điểm **898,63 / 141,79 kB**. Các màn hình và mẫu được chia chunk; các số này không phải tổng tải ban đầu thực tế. Chưa có số đo Network/Profiler trên cùng điện thoại để kết luận tốc độ hay mức giảm chi phí.

### Asset và tệp lịch sử

Không tìm thấy tham chiếu trong nguồn đang chạy tới `src/assets/hero.png`, `public/icons.svg`, `public/favicon.svg`, hai ảnh nền dự phòng `public/hinhnen.png` và `public/hinh-nen1.jpg`. Hai ảnh nền chính vẫn có dùng. Những URL public có thể được dùng ngoài repository; giữ các tệp dự phòng và ghi rõ trong báo cáo, chưa xóa chỉ dựa vào tìm kiếm nội bộ. Hero không nằm trong bundle nếu không được import.

Root vẫn có tệp phục hồi/chẩn đoán và `backup_corrupted/`; chúng không nằm trong đồ thị import. Archive cũ vẫn được giữ. Nên thống nhất danh mục tài liệu/lịch sử, chuyển các bản phục hồi còn cần giữ vào archive có ghi nguồn gốc, đưa dump tái tạo được vào ignore. Không đọc nội dung tệp chứa mật khẩu/cấu hình riêng hoặc chạy lại script khôi phục để phục vụ lượt dọn này.

## 4. Tính năng nên bổ sung — lập phương án, chưa triển khai

P1: nên làm trước khi mở rộng sử dụng; P2: nâng hiệu quả công việc; P3: tiện ích sau. Độ khó xét trên hệ thống hiện tại, không phải ước lượng số ngày hoặc token.

| Ưu tiên | Tính năng | Độ khó | Phương án và điều kiện nghiệm thu |
| --- | --- | --- | --- |
| P1 | Khôi phục nháp sau tải lại/mất điện | Khó | Lưu nháp theo tài khoản, phạm vi, ID tài liệu và phiên bản nền; có thời hạn và lựa chọn khôi phục/bỏ. Không tự biến nháp thành điểm chính thức. Tải lại khi đang lưu hoặc có sửa từ người khác vẫn phát hiện xung đột; đăng xuất không lộ nháp cho người tiếp theo. |
| P1 | Đồng bộ Sheet và sao lưu chạy nền | Rất khó | Worker máy chủ xử lý outbox có version, retry và giới hạn tải; lập lịch backup không phụ thuộc mở trang Admin. Hiển thị lần thành công, lỗi, số việc còn chờ. Mất mạng/đóng trang/retry không thêm dòng trùng hoặc ghi job cũ đè hồ sơ mới. |
| P1 | Theo dõi tình trạng triển khai | Trung bình | Màn hình Admin kiểm tra phiên bản hai Apps Script, trạng thái bridge/Functions và danh mục địa chỉ. Chỉ kiểm tra quyền Google đã dùng, không in token/mật khẩu. Phân biệt chưa cấp quyền, thiếu cấu hình và sai phiên bản; hướng dẫn đúng dự án cần sửa. |
| P1 | Sao lưu riêng tệp và Sheet quan trọng | Rất khó | Chính sách cho tệp Drive, bảng đăng ký gốc, bảng tài khoản và bí mật cấu hình; phân quyền và thời hạn giữ riêng. Có danh mục/link kiểm tra, thử phục hồi vào nơi riêng. Bản Firestore hiện tại không thay thế những bản lưu này. |
| P1 | Môi trường thử và kiểm thử tự động toàn hành trình | Khó | Web + Functions + Firebase emulator + mock Apps Script; CI chạy check và Rules. Staging riêng nghiệm thu Drive/Sheet thật, ma trận vai trò, migration/rollback và thiết bị cũ trước đổi cờ. Không dùng production để thử xóa/phục hồi. |
| P2 | Thống kê học tập | Khó | Mục menu `study-stats` hiện chỉ thông báo sẽ thiết kế sau. Thống kê theo năm/cơ sở/khối/lớp/môn: đủ/thiếu điểm, phân bố, tiến độ bài và chuyên cần. Dùng cùng quy tắc tính điểm, ghi thời điểm dữ liệu, quyền theo vai trò và xuất báo cáo; không tính ô thiếu thành 0. |
| P2 | Tìm kiếm và phân trang bảng điểm/hồ sơ | Trung bình–khó | Tìm không dấu, lọc lớp/trạng thái/thiếu điểm, chỉ dựng trang hiện tại; liên kết với ID ổn định. Giữ nháp và các lựa chọn khi chuyển trang, bàn phím không lưu nhầm học sinh, export đủ tập đã lọc. |
| P2 | Gửi lại thư chống trùng khi mất phản hồi | Trung bình | Mã thao tác và kết quả bền vững; cùng mã retry trả lại kết quả đã gửi, yêu cầu gửi lại lần mới dùng mã khác. Kiểm thử phản hồi mất sau khi Sheet đã ghi, cập nhật trạng thái đọc và xóa đồng thời. |
| P2 | Vòng đời mật khẩu/mã truy cập | Khó | Giữ mặc định tạo giáo viên `123456` đang được yêu cầu; bổ sung đổi mật khẩu lần đầu, đặt lại có quyền và thu hồi phiên. Với học sinh, cân nhắc PIN riêng bên cạnh mã định danh để mã đoán được không đủ đăng nhập. Kiểm thử quyền khôi phục và hết phiên. |
| P3 | Quản lý thời hạn giữ bản lưu và nhật ký | Trung bình | Xem trước bản đủ điều kiện dọn theo dung lượng/thời hạn/số bản; bảo vệ bản mới nhất và job chưa xong, ghi kết quả từng tệp. Tránh xóa nhầm bản đang cần để phục hồi. |

Giới hạn đăng nhập theo IP đã được nâng ở nguồn lên **240 lượt/15 phút**, không còn ngưỡng 10 như báo cáo cũ. Thành công vẫn được tính và thiếu IP vẫn vào nhóm `unknown`. Khi triển khai cần thử cả lớp dùng chung Wi-Fi và cân nhắc tách đếm thử sai theo mã khỏi chống tăng tải theo IP; không tự điều chỉnh tiếp khi chưa có số đo tải thực tế.

## 5. Phần cần triển khai/cấu hình để hoàn tất trên web thật

1. **Máy chủ chính:** cập nhật [code_hoclieu.gs](C:/Users/khoac/kho-hoc-lieu/apps-script/code_hoclieu.gs:21), triển khai phiên bản mới trên URL hiện tại; version cần thấy là `2026-10-04-review-v8`.
2. **Đăng ký:** dùng bộ [code_dangky.gs](C:/Users/khoac/kho-hoc-lieu/apps-script/dang-ky-hoc-sinh/code_dangky.gs), [Index.html](C:/Users/khoac/kho-hoc-lieu/apps-script/dang-ky-hoc-sinh/Index.html) và manifest phù hợp; máy chủ version `2026-10-04-location-cache-v7`. Giữ nguồn danh mục địa chỉ từ Sheet, không tự đổi địa giới.
3. **Lỗi chọn tỉnh thiếu quyền:** chạy `capQuyenMotLan` bằng tài khoản sở hữu bản triển khai, cấp Sheets/Drive/Docs và triển khai mới với Execute as Me. Chạy `getRegistrationConfig` thành công không xác nhận quyền đọc Sheet danh mục. Cần thử tỉnh → huyện → xã trên URL `/exec` thực tế sau triển khai.
4. **Hosting:** đưa frontend mới và Netlify Functions lên cùng đợt; nếu đang bật scoped auth, Functions cần có `system/readSummary`. Vite preview riêng không cung cấp Netlify Functions. Không bật thêm cờ server quiz/system hoặc đổi Rules chỉ để thử thống kê.
5. **Nhánh bảo mật mới:** chạy kế hoạch metadata/định danh/nội dung cũ, index/Rules, ma trận vai trò và backup/restore trên môi trường thử theo [tài liệu triển khai](C:/Users/khoac/kho-hoc-lieu/TRIEN_KHAI_DINH_DANH_DIEM_VA_AN_TOAN_DU_LIEU.md). Các cờ tắt và adapter legacy vẫn cần giữ cho tới nghiệm thu.

Hướng dẫn chi tiết: [HUONG_DAN_CAP_NHAT_APPS_SCRIPT.md](C:/Users/khoac/kho-hoc-lieu/HUONG_DAN_CAP_NHAT_APPS_SCRIPT.md).

Sau triển khai cần thử: Admin xem thống kê không tạo backup mới; giáo viên chỉ có một bảng điểm đúng môn/cơ sở; nhập nháp đóng/mở; học sinh đăng nhập/nộp bài/tải tệp/đọc thư; đăng ký chọn địa chỉ không dấu; sao lưu thủ công/tự động và phục hồi vào dữ liệu thử. Chỉ kết luận hoàn tất trên dịch vụ thật sau các bước này.
