# Cập nhật website mới qua GitHub

Đã kiểm tra dashboard ngày 25/10/2026: dự án Cloudflare là `htcdtrungmytay`, địa chỉ production hiện tại là `https://tthtcdtrungmytay.pages.dev/`, nguồn ghi **No Git connection**. Dự án Direct Upload không chuyển sang Git integration trực tiếp; có thể dùng GitHub Actions để giữ dự án và địa chỉ hiện có.

Kho mã hiện có: `https://github.com/khoactpc-byte/kho-hoc-lieu`. Mã Cloudflare nằm trong nhánh `codex/cloudflare-live`, ở checkout `.worktrees/cloudflare-live`. Không đưa toàn bộ mã nhánh này đè lên `main`: nhánh `main` còn phục vụ bản Netlify cũ.

Đã chuẩn bị `.github/workflows/cloudflare-pages.yml`. Workflow chỉ chạy khi người quản trị chọn **Actions → Update Cloudflare website → Run workflow**. Nó đọc nhánh `codex/cloudflare-live`, cài dependencies, kiểm thử gateway và lỗi đăng nhập, build rồi tải riêng `dist` lên dự án đang có. Không chạy khi chỉ push mã. Không cập nhật backend Netlify hoặc Apps Script.

Trước khi bật cần:

- Rà soát và đưa các thay đổi cần thiết của web mới lên nhánh `codex/cloudflare-live`; không đưa Apps Script, `.env`, dữ liệu riêng, output hoặc khóa máy chủ lên GitHub.
- Đưa riêng file workflow lên nhánh mặc định `main` để GitHub hiển thị nút **Run workflow**, đồng thời giữ bản giống hệt ở nhánh Cloudflare. File workflow không thay lệnh build Netlify nhưng commit vào `main` có thể kích hoạt auto deploy Netlify đang bật; thực hiện sau khi được chủ dự án cho phép.
- Thêm hai Actions secrets `CLOUDFLARE_ACCOUNT_ID` và `CLOUDFLARE_API_TOKEN`. Token dùng quyền **Account → Cloudflare Pages → Edit**, giới hạn đúng tài khoản hiện có. Cần chủ tài khoản cho phép trước khi tạo token và trao quyền triển khai cho GitHub. Không dán token vào chat hoặc mã nguồn.
- Thêm bốn Actions variables công khai `VITE_SUPABASE_LESSONS_ENABLED`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_LESSON_SYNC_ENABLED`, lấy đúng các giá trị đang dùng trong `.cloudflare-public-env/.env.production.local`. Không dùng khóa Supabase bí mật.
- Sửa lỗi đăng nhập bằng cách triển khai Apps Script chính v14 trước, rồi kiểm tra phiên bản qua URL `/exec` và thử đăng nhập bằng tài khoản được cấp.

Trạng thái: mới chuẩn bị trên máy. Chưa push, tạo token, cấu hình secrets hoặc chạy workflow; website chưa được cập nhật trong lượt này.

Tài liệu chính thức: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
