# Rà soát Apps Script — 14/10/2026

Đã rà soát bản mã trên máy của hai dự án đang dùng: `apps-script/code_hoclieu.gs`, `apps-script/dang-ky-hoc-sinh/code_dangky.gs`, `PublicRegistration.gs`, `Index.html`, manifest và phần web gọi API. Đã kiểm tra các bản cũ `code_chambai.gs`, `Javascript.html`, `Stylesheet.html`: chúng được giữ làm bản lưu, không nằm trong bộ triển khai hiện tại. Các sửa đăng ký, danh mục địa phương, năm học, tốt nghiệp/bỏ học của lượt trước được giữ.

## Những lỗi đã sửa

| Phần | Phát hiện và kết quả sửa |
| --- | --- |
| Form dự phòng | `google.script.run.processForm` trước đây đi thẳng vào xử lý cũ, bỏ qua kiểm tra đầy đủ của API mới. Đã đưa cả hai đường qua cùng kiểm tra trường, ngày sinh, địa phương, loại/số lượng/dung lượng tệp và chặn công thức. Hàm thực sự ghi dữ liệu chuyển thành hàm riêng kết thúc bằng `_`, không gọi trực tiếp từ trình duyệt. |
| Gửi lại đăng ký | Form dự phòng chưa có mã yêu cầu ổn định. Đã giữ mã cho cùng hồ sơ khi gửi lại, chặn nhấn gửi hai lần, báo mất kết nối sau thời gian chờ và bỏ qua phản hồi muộn. Đổi nội dung tạo mã mới; thành công mới xóa form. API nhận lại mã đã lưu sẽ trả biên nhận cũ. |
| Tệp đăng ký bị bỏ dở | Tệp đã tạo có thể bị bỏ lại nếu lượt đăng ký thua một yêu cầu đồng thời, năm học thay đổi hoặc lỗi tải tệp. Đã theo dõi và chuyển vào thùng rác chỉ các tệp do lượt chưa ghi tạo ra. Khi đã thử ghi Sheet, giữ tệp vì thao tác ghi có thể đã thành công dù phản hồi bị mất. |
| Ghi Sheet | Văn bản bắt đầu bằng `=` có thể bị chạy như công thức. Đã ghi dưới dạng chữ trong hồ sơ, giấy tờ, ghi chú, xuất danh sách, thư và nhật ký; phục hồi thư cũng không chạy lại công thức có trong nội dung. |
| Nâng lớp hàng loạt | Trước đây đọc lại toàn bộ danh sách để tìm từng học sinh. Đã đọc định danh một lần mỗi nhóm, kiểm tra thiếu dòng, trùng dòng, khác năm và bỏ học trước khi ghi. Nếu lỗi sau một phần, trả đúng số dòng đã hoàn tất. |
| Tài khoản và thao tác đồng thời | Khóa thao tác đổi trạng thái giáo viên cùng cơ chế với sửa tài khoản; giới hạn thử đăng nhập giáo viên được đếm dưới khóa. Các thao tác ghi Sheet được flush trước khi nhả khóa. Bỏ những lần đọc tài khoản giáo viên lặp lại trong cùng bước xác thực. |
| Gemini | Loại model 2.0 đã ngừng hoạt động khỏi web/máy chủ, sửa lựa chọn đã lưu để không gọi lại model cũ. Còn model 2.5 cho luồng hiện hữu và thêm các model Flash hiện hành. Máy chủ báo khi đã thử hết; web không lặp thêm cả danh sách. Ghi số lượt hoặc nhật ký lỗi thất bại không làm mất kết quả AI đã có. Kết quả tệp ghép đủ các phần văn bản và báo rõ khi không có nội dung. |
| Thống kê AI | Bộ đếm `usedToday` trước đây không có mốc ngày nên không tự đặt lại. Đã tự thêm cột `Ngày thống kê` nếu có cột đếm, giữ số đang có trong ngày nâng cấp, đặt lại theo múi giờ dự án khi qua ngày mới và tăng số dưới khóa. Đây là số lượt ứng dụng, không thay thế hạn mức của nhà cung cấp. |
| Tải giấy tờ | Giới hạn chống lạm dụng dùng chung mức 10 lần đăng nhập khiến không gửi đủ bộ học bạ 20 trang. Đã tách mức tải tệp thành 60 lượt/15 phút, giữ mức thử đăng nhập 10 lần. Form dự phòng xử lý ảnh lần lượt để giảm bộ nhớ trên điện thoại. |
| Thông báo lỗi | Quota hoặc lỗi 403 của Sheet/Drive trước đây có thể bị báo thành lỗi Gemini. Đã giữ đúng ngữ cảnh dịch vụ; lỗi đồng bộ nhóm cũng giữ thông tin nguyên nhân. |

Google xác nhận `setValues` coi giá trị bắt đầu bằng `=` là công thức trong [tài liệu Range](https://developers.google.com/apps-script/reference/spreadsheet/range). Quy tắc hàm riêng kết thúc bằng `_` nằm trong [tài liệu HTML Service](https://developers.google.com/apps-script/guides/html/communication). Gemini 2.0 Flash/Flash-Lite đã ngừng từ 01/06/2026; 2.5 còn phục vụ các tài khoản đã dùng trước đó theo [lịch model hiện tại](https://ai.google.dev/gemini-api/docs/deprecations/), kiểm tra ngày 14/10/2026.

## Bộ triển khai một lượt

Các nguồn gốc vẫn nằm ở vị trí cũ. Bộ sao chép theo đúng tên file Google Apps Script nằm ở `apps-script/ban-trien-khai-2026-10-14/`; `SHA256SUMS.json` dùng để đối chiếu nội dung bộ sao chép với nguồn.

1. Máy chủ chính: thay **Code.gs** bằng `may-chu-chinh/Code.gs`; Deploy phiên bản mới của deployment hiện tại. `/exec` phải hiện `2026-10-14-script-review-v10`.
2. Đăng ký: thay **Code.gs**, **PublicRegistration.gs**, **Index.html**, **appsscript.json** bằng các file tương ứng trong `dang-ky-hoc-sinh/`; Deploy phiên bản mới của deployment hiện tại. `/exec?action=version` phải trả `2026-10-14-script-review-v15`; cấu hình có `publicApiVersion: 1`.
3. Cập nhật frontend bằng bản build hiện tại. Các thay đổi về tên model và tránh thử lại lặp nằm ở frontend, nên chỉ cập nhật Apps Script chưa đủ áp dụng toàn bộ lượt rà soát.

Giữ các Script Properties và URL deployment đang dùng. Không cần đổi ID Sheet/Drive hoặc tạo thêm dự án. Nếu Google yêu cầu cấp quyền lại, chủ dự án chạy `capQuyenMotLan_` trong trình sửa dự án đăng ký. Hàm này không còn gọi được từ form công khai. Không ghép mã `code_chambai.gs` vào máy chủ chính hoặc include `Javascript.html` cũ vào form mới.

Bản trước rà soát được sao lưu ở `.test-tools/apps-script-before-review-20261014.zip`; cả nguồn Apps Script và bộ đóng gói đều nằm ngoài Git.

## Xác nhận và giới hạn

Kiểm thử chạy bằng dữ liệu giả lập; không duyệt, xóa hay chuyển tệp thật. Bộ kiểm tra gồm hồi quy đăng ký, gửi lại sau mất kết nối, tệp bị bỏ dở, ghi dữ liệu giống công thức, đồng bộ năm học, học sinh bỏ học/tốt nghiệp, tệp cũ, phân quyền, hộp thư và AI. Lần kiểm tra cuối `npm run check` đạt **297/297 kiểm thử thực thi**, 2 kiểm thử được bỏ qua, 0 lỗi; lint, cú pháp và build đều đạt. Trình kiểm tra cú pháp đã bao gồm cả các bản script/HTML lưu cũ và việc ghép hai file `.gs` của dự án đăng ký. Build còn cảnh báo kích thước chunk trên 500 kB; không chặn build, việc tách bundle sâu hơn được để riêng để tránh thay đổi luồng tải trang trong cùng lượt cập nhật Script.

Hai kiểm thử được bỏ qua thuộc Firestore Rules và backup/restore trên Firestore emulator; môi trường này chưa chạy emulator. Lượt sửa không đổi Rules hoặc cơ chế backup/restore Firestore.

Tại thời điểm hoàn tất rà soát, các kiểm thử trên chỉ chạy với **mã nguồn local**, chưa xác nhận quyền/quota bằng dịch vụ thật. Các luồng ghi/xóa cần kiểm tra trên dữ liệu thử khi nghiệm thu: đăng ký/gửi lại cùng hồ sơ; duyệt một trường; đồng bộ Sheet; đọc/gửi thư; gọi AI; thử dọn một tệp không dùng chung.

## Triển khai theo yêu cầu sau rà soát

Đã vào đúng hai dự án Google, sao lưu source và đối chiếu cấu hình trước khi thay. Máy chủ chính trên Google là `review-v8`; dự án đăng ký là `registration-compact-v13`, cùng ID Sheet/Drive với bản local. Hàm `capQuyenMotLan` của bản cũ đã đổi thành `capQuyenMotLan_` trong bản mới; các file HTML cũ được giữ, form không include chúng. Manifest đăng ký giữ cấu hình Web App thực tế và múi giờ, bổ sung danh sách scope cần cho Sheet/Drive/Docs/UrlFetch.

Đã cập nhật deployment hiện tại: **máy chủ chính phiên bản Google 46**, mã v10; **đăng ký phiên bản Google 55**, mã v15. Các endpoint công khai trả đúng mã mới; cấu hình đăng ký trả `publicApiVersion: 1` và năm `2026-2027`. Không ghi hoặc dọn hồ sơ/tệp thật trong quá trình xác nhận. Source Google trước triển khai, thông tin phiên bản để quay lại và nhật ký kiểm tra được giữ ngoài Git trong `.test-tools/apps-script-google-before-deploy-20261014/`.
