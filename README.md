# Kho hoc lieu so - THCS Nguyen An Ninh

Ung dung quan ly hoc lieu, hoc sinh, diem, diem danh, thoi khoa bieu, thong bao va hop thu hoc sinh.

## Chay tren may

```powershell
npm install
npm run dev
```

Kiem tra truoc khi dua len web:

```powershell
npm run check
```

`npm run check` chạy test các luồng dữ liệu thực tế, lint frontend/Netlify/test/config, kiểm tra cú pháp hai Apps Script và build production. Dùng Node 22 (hoặc Node 20.19+); Netlify đã được cấu hình Node 22. Xem [hướng dẫn chuyển Vite 7](https://v7.vite.dev/guide/migration) khi đổi môi trường build.

## Trien khai web

1. Kiem tra `npm run check`.
2. Dua ma nguon len Git.
3. De dich vu hosting tu build bang `npm run build`.
4. Kiem tra dang nhap Admin, Giao vien, Hoc sinh va cac luong gui thu/xuat file.

## Trien khai Apps Script

Ma nguon Apps Script dang duoc quan ly trong Git o `apps-script/`. He thong co hai Web App doc lap:

- May chu chinh: `apps-script/code_hoclieu.gs`.
- Dang ky va dong bo du lieu hoc sinh: `apps-script/dang-ky-hoc-sinh/code_dangky.gs` va `Index.html`.

Sau khi cap nhat ma, dong bo dung tep voi dung du an Apps Script, roi vao **Deploy > Manage deployments > Edit > New version > Deploy**. Luu ma ma khong tao ban trien khai moi se khong cap nhat Web App dang chay. Khong tao URL trien khai moi neu ung dung van dung URL hien tai.

Chi tiet nhan dien hai du an, Script Properties va cac buoc kiem tra sau trien khai nam trong [huong dan Apps Script](./HUONG_DAN_CAP_NHAT_APPS_SCRIPT.md). Cau hinh bao mat nam trong [SECURITY_SETUP.md](./SECURITY_SETUP.md).

## Sao luu va phuc hoi

Admin vao **Tien ich > An toan du lieu**:

- Tao sao luu thu cong.
- Xem cac ban sao luu tren Google Drive.
- Phuc hoi hoc sinh, diem, diem danh, thoi khoa bieu, thong bao va hop thu.
- Xem nhat ky hoat dong.
- Xem, xoa rieng hoac gui lai thu cho hoc sinh chua doc.

He thong tu tao sao luu:

- Lan dau Admin mo web moi ngay.
- Truoc khi phuc hoi.
- Truoc khi xoa hoc sinh.
- Truoc khi xoa thu hang loat.

Ban sao luu duoc luu trong thu muc `SAO LUU HE THONG`, nam trong thu muc Drive hop thu hoc sinh.

Neu du lieu tang rat lon, nen tao va thu phuc hoi dinh ky. Apps Script co gioi han thoi gian chay va kich thuoc request; khi vuot gioi han, web se bao loi va khong ghi de ban sao luu cu.

## Cau truc chinh

- `src/App.jsx`: dieu phoi giao dien va cac luong chinh.
- `src/utils/schoolClasses.js`: chuan hoa co so, lop, nam hoc va phan cong giao vien.
- `src/components/AdminDataSafetyWorkspace.jsx`: sao luu, phuc hoi, nhat ky va thu da gui.
- `src/components/HocSinhManager.jsx`: database hoc sinh.
- `src/components/SimpleScheduleTable.jsx`: thoi khoa bieu.
- `src/components/ScorebookWorkspace.jsx`: so diem va hoc ba.
- `src/services/`: giao dịch điểm danh, lịch/bản tin, bản nháp, phân công, sao lưu và chuyển năm.
- `src/components/LearningResultsWorkspace.jsx`, `StudentProfileModal.jsx`: màn hình tải khi cần.
- `archive/recovery-2026-10-03/`: giữ nguyên các bản vá/khôi phục cũ để đối chiếu.
- `apps-script/`: nguon hai Web App Apps Script.

Mẫu sổ điểm gốc hơn 3 MB được giữ nguyên trong `src/data/scorebookTemplate.json`. Khi build, `scripts/scorebook-template-plugin.mjs` gom các định dạng ô trùng nhau; mã mẫu xuất ra khoảng 899 KB (142 KB gzip), chỉ tải khi mở chức năng cần sổ điểm. Kiểm thử đối chiếu lại toàn bộ ô và thông số in với bản gốc.

## Nguyen tac van hanh

- Khong dua file mat khau, `.env` hoac cau hinh rieng len Git.
- Khong deploy Firestore Rules moi truc tiep tren du an dang chay neu chua kiem thu.
- Luon tao sao luu truoc thay doi du lieu lon.
- Sau khi cap nhat Apps Script, kiem tra lai gui thu, AI, tai file, xuat PDF/Sheet va sao luu.
- Sau khi push Git, van phai dan lai `apps-script/code_hoclieu.gs` va Deploy ban moi tren Apps Script.

## Rà soát mới nhất

Xem [lượt sửa luồng chấm máy chủ ngày 03/10/2026](./KET_QUA_CHAM_DIEM_MAY_CHU_2026-10-03.md): thêm luồng đề trắc nghiệm theo tuần được chấm trên máy chủ, có cờ riêng vẫn tắt; sửa mất nội dung khi xóa/lưu lỗi và phản hồi lưu đề muộn. Đây là mã chuẩn bị chưa triển khai; các giới hạn được ghi rõ trong báo cáo.

Xem [kết quả rà soát lần 3 ngày 03/10/2026](./KET_QUA_RA_SOAT_LAN_3_2026-10-03.md): sửa tiếp lưu điểm, xóa/chấm bài, hủy đăng nhập và phục hồi thiết lập. [Báo cáo lượt 2](./KET_QUA_TOI_UU_LAN_2_2026-10-03.md) giữ số liệu của lượt trước. Phần chưa hoàn tất được ghi rõ trong báo cáo mới.
