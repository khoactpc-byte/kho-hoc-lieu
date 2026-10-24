# Cập nhật website mới qua GitHub

Đã kiểm tra dashboard ngày 25/10/2026: dự án Cloudflare là `htcdtrungmytay`, địa chỉ production hiện tại là `https://tthtcdtrungmytay.pages.dev/`, nguồn ghi **No Git connection**. Dự án Direct Upload không chuyển sang Git integration trực tiếp; có thể dùng GitHub Actions để giữ dự án và địa chỉ hiện có.

Kho mã hiện có: `https://github.com/khoactpc-byte/kho-hoc-lieu`. Mã Cloudflare nằm trong nhánh `codex/cloudflare-live`, ở checkout `.worktrees/cloudflare-live`. Không đưa toàn bộ mã nhánh này đè lên `main`: nhánh `main` còn phục vụ bản Netlify cũ.

Đã bật `.github/workflows/cloudflare-pages.yml`. Workflow chỉ chạy khi người quản trị chọn **Actions → Update Cloudflare website → Run workflow → Run workflow** (giữ lựa chọn workflow ở `main`). Nó tự đọc mã web từ nhánh `codex/cloudflare-live`, cài dependencies, kiểm thử gateway và lỗi đăng nhập, build rồi tải riêng `dist` lên dự án đang có. Không chạy khi chỉ push mã. Không cập nhật backend Netlify hoặc Apps Script.

Cấu hình đã áp dụng ngày 25/10/2026:

- Mã web mới, đăng nhập chung và in học bạ năm cũ đã lên nhánh `codex/cloudflare-live`, commit ứng dụng `c1f8fb4`. Không đưa Apps Script, `.env`, dữ liệu riêng, output hoặc khóa máy chủ lên GitHub.
- Riêng workflow đã lên nhánh mặc định `main`, commit `9062631` với `[skip ci]`, để hiện nút **Run workflow**; các thay đổi ứng dụng và backend ở thư mục chính chưa được đưa lên `main`.
- Đã lưu hai Actions secrets `CLOUDFLARE_ACCOUNT_ID` và `CLOUDFLARE_API_TOKEN`. Token có tên `GitHub kho-hoc-lieu Cloudflare Pages`, quyền **Account → Cloudflare Pages → Edit**, giới hạn một tài khoản hiện có. Token ban đầu đã được thay và vô hiệu hóa trước khi lưu token mới vào GitHub theo phê duyệt riêng của chủ tài khoản. Không lưu giá trị token trong tài liệu, mã nguồn hoặc file trên máy.
- Đã lưu đủ bốn Actions variables công khai `VITE_SUPABASE_LESSONS_ENABLED`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_LESSON_SYNC_ENABLED`, lấy đúng giá trị đang dùng trong `.cloudflare-public-env/.env.production.local`. Không dùng khóa Supabase bí mật.
- Apps Script chính đã triển khai v14 / Google 50, giữ nguyên URL; endpoint thật đã trả đúng v14. Đăng nhập bằng thông tin người dùng nhập sẵn trên local đã vào được giao diện giáo viên. Không thử ghi dữ liệu học sinh thật để kiểm tra triển khai.

Lần chạy đầu tiên đã **Success**: https://github.com/khoactpc-byte/kho-hoc-lieu/actions/runs/40116806908 . Tổng thời gian 1 phút, job triển khai 52 giây. Đã mở lại trang production, kiểm tra có nút đăng nhập/đăng ký và `/.site/health` trả `web-ready`. Kết quả này xác nhận luồng build và triển khai; không coi là đã kiểm thử ghi điểm/hồ sơ/chấm bài thật.

Những lần sau: commit/push mã web đã kiểm tra vào `codex/cloudflare-live`, rồi mở https://github.com/khoactpc-byte/kho-hoc-lieu/actions/workflows/cloudflare-pages.yml và bấm **Run workflow**. Chỉ chạy `up-github.bat` ở thư mục chính sẽ cập nhật `main`; không thay cho bước cập nhật nhánh Cloudflare này.

Tài liệu chính thức: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
