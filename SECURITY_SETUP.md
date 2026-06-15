# Cau hinh bao mat

## Viec can lam ngay

1. Thu hoi khoa Gemini cu trong Google AI Studio vi khoa nay tung nam truc tiep trong ma nguon.
2. Tao khoa Gemini moi.
3. Mo Apps Script, vao **Project Settings > Script Properties**, them:

| Property | Gia tri |
| --- | --- |
| `APP_GEMINI_API_KEY` | Khoa Gemini moi |
| `APP_CLIENT_TOKEN` | `NGUYENANNINH_KHOA_2026` |
| `APP_ADMIN_PASSWORD` | Mat khau admin manh, it nhat 8 ky tu |
| `APP_TEACHER_PASSWORD` | Mat khau giao vien, it nhat 8 ky tu |
| `APP_TEACHER_PASSWORD_ENABLED` | `true` hoac `false` |
| `APP_THD_PASSWORD` | Mat khau khu Tran Hung Dao, it nhat 8 ky tu |

4. Cap nhat tap tin Apps Script chinh `code_hoclieu.gs`, sau do **Deploy > Manage deployments > Edit > New version > Deploy**. `code_chambai.gs` chi la tap tin cu/tham khao, khong can deploy neu website dang dung URL cua `code_hoclieu.gs`.
5. Dang nhap Admin bang mat khau moi. He thong se tu xoa truong `adminPass` cu khoi Firestore.

`APP_CLIENT_TOKEN` chi la ma nhan dien ung dung web, khong phai bi mat, vi ma chay trong trinh duyet luon co the bi xem. Mat khau admin va khoa Gemini moi la bi mat va chi duoc dat trong Script Properties.

## Khoa Google/Firebase hien trong trinh duyet

Firebase API key va Google Drive API key dung boi trinh duyet khong the duoc giau trong ma frontend. Trong Google Cloud Console, hay gioi han chung theo:

- Website/referrer duoc phep.
- Dung API can thiet.
- Han muc su dung va canh bao chi phi.

Bat Firebase App Check de giam request gia mao.

## Firestore Rules

Tap tin `firestore.rules.secure-ready` la mau cho giai doan chuyen sang Firebase Authentication co vai tro Admin/Giao vien/Hoc sinh. Khong deploy tap tin nay ngay luc nay: ung dung hien dang dung anonymous authentication, nen Firestore chua phan biet duoc vai tro that va quy tac chat se lam hong cac chuc nang dang chay.

Buoc nang cap tiep theo:

1. Tao tai khoan Firebase Auth rieng cho Admin va giao vien.
2. Gan custom claim `role` tren may chu.
3. Gan `studentId` cho tai khoan hoc sinh.
4. Kiem thu tren mot Firebase project thu nghiem.
5. Sau do moi deploy `firestore.rules.secure-ready`.

## Luu y

- Khong dua `mat_khau.txt`, `src/mat_khau.txt`, `cauhinh.json` hoac `.env` len Git.
- Neu mot khoa tung nam trong Git hoac ma nguon, xoa khoi ma nguon chua du: phai thu hoi va tao khoa moi.
- Phien Admin Apps Script hien het han sau 6 gio hoac khi Apps Script xoa cache.
- Mat khau Admin, Giao vien va khu Tran Hung Dao duoc luu trong Script Properties, khong con can luu truc tiep trong Firestore.
- Sau khi thay `code_hoclieu.gs`, bat buoc Deploy mot version Apps Script moi.
