# Kho hoc lieu so - THCS Nguyen An Ninh

Ung dung quan ly hoc lieu, hoc sinh, diem, diem danh, thoi khoa bieu, thong bao va hop thu hoc sinh.

## Chay tren may

```powershell
npm install
npm run dev
```

Kiem tra truoc khi dua len web:

```powershell
npm test
npm run lint
npm run build
```

## Trien khai web

1. Kiem tra `npm test` va `npm run lint`.
2. Dua ma nguon len Git.
3. De dich vu hosting tu build bang `npm run build`.
4. Kiem tra dang nhap Admin, Giao vien, Hoc sinh va cac luong gui thu/xuat file.

## Trien khai Apps Script

Apps Script dang dung nam trong `apps-script/code_hoclieu.gs`.

Thu muc `apps-script/` dang duoc bo qua khi dua len Git de tranh lo cau hinh rieng. Vi vay, lenh push Git chi cap nhat website, khong cap nhat Apps Script.

Moi lan sua file nay bat buoc:

1. Dan noi dung moi vao Google Apps Script.
2. Vao **Deploy > Manage deployments**.
3. Chon **Edit > New version > Deploy**.
4. Kiem tra URL Web App van trung voi `APPS_SCRIPT_URL` trong `src/utils/helpers.js`.

Khong chi bam Save trong Apps Script. Bam Save ma khong Deploy ban moi thi website van chay code cu.

Xem cau hinh Script Properties trong [SECURITY_SETUP.md](./SECURITY_SETUP.md).

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
- `src/components/AdminDataSafetyWorkspace.jsx`: sao luu, phuc hoi, nhat ky va thu da gui.
- `src/components/HocSinhManager.jsx`: database hoc sinh.
- `src/components/SimpleScheduleTable.jsx`: thoi khoa bieu.
- `src/components/ScorebookWorkspace.jsx`: so diem va hoc ba.
- `src/utils/operations.js`: logic dung chung co kiem thu.
- `apps-script/code_hoclieu.gs`: may chu Apps Script chinh.

File mau so diem hon 3 MB khong con duoc nap cung man hinh dau. No chi duoc nap khi mo cac chuc nang can so diem.

## Nguyen tac van hanh

- Khong dua file mat khau, `.env` hoac cau hinh rieng len Git.
- Khong deploy Firestore Rules moi truc tiep tren du an dang chay neu chua kiem thu.
- Luon tao sao luu truoc thay doi du lieu lon.
- Sau khi cap nhat Apps Script, kiem tra lai gui thu, AI, tai file, xuat PDF/Sheet va sao luu.
- Sau khi push Git, van phai dan lai `apps-script/code_hoclieu.gs` va Deploy ban moi tren Apps Script.
