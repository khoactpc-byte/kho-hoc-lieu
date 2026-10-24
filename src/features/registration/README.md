# Form đăng ký học sinh

Địa chỉ trên web: `/#/dang-ky` (`/#/register` cũng được hỗ trợ). Nút **Đăng ký mới** ở màn hình đăng nhập mở trang này.

## Sửa đúng khu vực

| Cần sửa | File |
| --- | --- |
| Các bước, thứ tự nhóm thông tin, nội dung trang | `RegistrationPage.jsx` |
| Màu, khoảng cách, kích thước, responsive | `registration.css` |
| Ô nhập, tìm tỉnh, tải huyện/xã, tệp và ảnh xem trước | `components/RegistrationFields.jsx` |
| Trang kiểm tra trước khi gửi | `components/RegistrationReview.jsx` |
| Học lực, hạnh kiểm các lớp THCS trước lớp đăng ký | `components/AcademicHistoryFields.jsx` |
| Năm khối khai sinh, quê quán, nơi ở và thường trú ở bước 2 | `components/RegistrationAddressStep.jsx` |
| Quy tắc kiểm tra, giới hạn tệp, tên trường gửi sang Sheet | `registrationModel.js` |
| Kết nối Apps Script, đọc tệp, tiến trình và lỗi mạng | `registrationApi.js` |
| Bộ nhớ danh mục, chia sẻ request và tải lại | `useRegistrationDirectories.js` |
| Định tuyến công khai, tải trang khi cần | `../../RootRouter.jsx` |
| URL dự án đăng ký hiện có | `../../config/registration.js` |
| API tiếp nhận và kiểm tra phía máy chủ | `apps-script/dang-ky-hoc-sinh/PublicRegistration.gs` (giữ riêng trên máy) |
| Ánh xạ cột, lưu Sheet/Drive, quản trị và đồng bộ | `apps-script/dang-ky-hoc-sinh/code_dangky.gs` (giữ riêng trên máy) |

## Giao diện gọn và căn cước

- Form dùng toàn bộ bề ngang, không có thanh bước bên trái. Số bước nằm gọn ở đầu form; cơ sở và lớp dùng ô chọn cùng nhóm.
- Chữ nhập liệu 16 px, nhãn 14 px; giảm khoảng cách giữa hàng. Điện thoại vẫn giữ nút thao tác tối thiểu 44 px và không cuộn ngang.
- Bước khai sinh và địa chỉ chia thành năm khối có viền, nền tiêu đề nhẹ: Nơi sinh, Nơi đăng ký khai sinh, Quê quán, Nơi ở hiện tại, Địa chỉ thường trú. Mỗi khối ghi rõ danh mục 3 cấp cũ hay 2 cấp hiện tại; ô tên bệnh viện nằm trong khối Nơi sinh. Các khối luôn mở để dễ đối chiếu khi điền.
- Hồ sơ dùng nút **Chọn tệp / Thêm tệp** nhỏ, giữ ảnh xem trước, tên tệp và nút xóa.
- Nếu có mã định danh 12 số, mục **Căn cước công dân (CCCD)** xuất hiện và bắt buộc đính kèm ảnh. Nếu chưa có mã, ghi **học sinh chưa có**; bước hồ sơ giải thích vì sao không cần ảnh CCCD.
- Máy chủ và biểu mẫu dự phòng đều dùng cách ghi mới. Cách ghi cũ vẫn được nhận để tương thích nháp và dữ liệu trước đây, nhưng đầu ra mới được chuẩn hóa thành **học sinh chưa có**. Không sửa hàng loạt dữ liệu cũ.
- Ngay dưới phần chọn lớp: lớp 7 bắt buộc khai học lực/hạnh kiểm lớp 6; lớp 8 khai lớp 6, 7; lớp 9 khai lớp 6, 7, 8. Tiểu học và lớp 6 không hiện mục này. Phải chọn đủ cả hai kết quả của mỗi lớp trước khi sang bước tiếp theo; đổi lớp tự cập nhật các ô, chỉ gửi kết quả thuộc những lớp cần khai. Trang kiểm tra có nhóm học tập riêng, chỉnh sửa sẽ trở lại bước chọn lớp.

## Luồng dữ liệu

Form → `submitRegistration` của Web App đăng ký → cùng sheet `Data`, cùng thư mục Drive → admin duyệt bằng luồng cũ → Firestore và job đồng bộ Sheet hiện có.

- Học sinh không chọn năm. Năm trên form là thông tin đọc từ admin; máy chủ tự đặt năm lưu và kiểm tra lại ngay trước khi ghi.
- Tên trường và 56 cột hồ sơ cũ giữ nguyên. Lịch sử lớp được lưu ở cột năm như trước.
- Hai cột kỹ thuật **Mã yêu cầu đăng ký** và **Kiểm tra yêu cầu đăng ký** được thêm sau các cột hiện có khi nhận hồ sơ đầu tiên từ form mới. Không sửa/xóa hai cột này: chúng giúp cùng một yêu cầu gửi lại chỉ tạo một dòng, kể cả học sinh chưa có mã định danh.
- Mã yêu cầu và nội dung dòng được ghi trong cùng `appendRow`. Gửi lại cùng mã/nội dung trả biên nhận cũ; khác nội dung bị từ chối. Nếu mất phản hồi sau khi lưu, retry đọc biên nhận trước khi kiểm tra năm mới.
- Form giữ thông tin và tệp trong bộ nhớ khi chuyển bước/lỗi mạng. Không lưu thông tin cá nhân vào localStorage. Đóng hoặc tải lại trang sẽ mất thông tin chưa gửi; trình duyệt cảnh báo trước khi rời.
- Nếu trang được mở trước lúc triển khai Script, cờ tiếp nhận hồ sơ có thể còn cũ. Khi bấm gửi, form tự đọc lại cấu hình tại chỗ trước khi quyết định gửi; giữ nguyên dữ liệu và tệp đã chọn. Nếu năm học vừa đổi, người điền phải kiểm tra và xác nhận lại; chỉ báo thành công sau khi máy chủ trả biên nhận lưu hồ sơ.
- Các ô thông tin cá nhân hiện ngay, không chờ Apps Script hoặc danh mục địa chỉ. Năm học/cơ sở lấy từ endpoint cấu hình nhẹ, không đoán năm; chỉ cho tiếp tục sau khi cấu hình hợp lệ. Thông tin đã nhập giữ nguyên khi tải xong hoặc tải lại cấu hình.
- Danh mục tỉnh/huyện/xã ưu tiên bản JSON tích hợp cùng web, giống phần sửa hồ sơ; nếu tệp không tải được thì dùng endpoint địa chỉ công khai hiện có. Request dùng chung giữa các ô; phản hồi của tỉnh đã bỏ chọn không thay ô hiện tại.
- Cấu hình và danh mục công khai hoàn chỉnh được dùng lại trong bộ nhớ tối đa 60 giây; không lưu hồ sơ hay thông tin cá nhân vào cache. Nút Tải lại và kiểm tra phiên bản trước khi gửi luôn yêu cầu dữ liệu mới, không dùng năm học cố định.
- Form được tải riêng, không khởi động giao diện admin/Firebase khi học sinh mở đường dẫn đăng ký.

## Triển khai

1. Trong **dự án Apps Script đăng ký học sinh hiện có**, thay `Code.gs` bằng `code_dangky.gs`, thêm file script tên **PublicRegistration** và dán nội dung `PublicRegistration.gs`. Cập nhật `Index.html` để form dự phòng cũng ẩn năm và đặt đúng nhóm trường. Giữ các file, Script Properties, Spreadsheet ID, Folder ID và Web App URL hiện tại.
2. **Deploy → Manage deployments → Edit → New version → Deploy**, giữ nguyên deployment URL và phạm vi tiếp nhận hồ sơ đã cấu hình trước đây. Không tạo dự án Script mới. Endpoint `?action=version` phải trả `2026-10-14-script-review-v15`; `?action=registrationConfig` phải có `publicApiVersion: 1`.
3. Lượt rà soát tổng hợp ngày 14/10 còn cập nhật máy chủ chính (`2026-10-14-script-review-v10`). Dùng bộ file và thứ tự trong [hướng dẫn cập nhật chung](../../../HUONG_DAN_CAP_NHAT_APPS_SCRIPT.md), Deploy mỗi dự án một lần rồi build và đưa web lên hosting. Không cần đổi Firestore Rules hoặc thêm biến môi trường.
4. Kiểm tra một hồ sơ thử, xác nhận đúng năm/cơ sở/lớp, tệp Drive và danh sách chờ duyệt; duyệt thử trên dữ liệu kiểm thử rồi kiểm tra đồng bộ.

Nếu Script chưa được cập nhật, form không báo gửi thành công giả; học sinh có thể dùng **Biểu mẫu dự phòng**. Không thêm quyền admin vào API công khai; các action quản trị vẫn yêu cầu phiên admin.

## Backup và kiểm thử

Cơ chế backup/phục hồi web giữ nguyên và tương thích các bản trước. Form không tạo kho dữ liệu học sinh thứ hai. Backup hệ thống hiện tại **không bao gồm toàn bộ Sheet đăng ký hoặc nội dung tệp Drive**; các đường dẫn tệp đã nằm trong hồ sơ Firestore được sao lưu cùng hồ sơ. Hồ sơ chờ duyệt trên Sheet và bản gốc tệp cần cơ chế sao lưu riêng nếu muốn bao phủ toàn bộ. Hai dự án Apps Script tiếp tục bị loại khỏi Git theo quy định hiện có: tự sao lưu cả `PublicRegistration.gs` cùng bộ mã Script.

Kiểm tra: `node --test test/publicRegistration.test.js test/registrationForm.integration.test.js test/registrationLocations.test.js test/registrationSchoolYear.test.js test/registrationReview.integration.test.js test/registrationStudentSync.test.js`, `npm run check:syntax`, `npm run build`. Test dùng dữ liệu giả, không gửi hồ sơ thật lên Sheet/Drive.
