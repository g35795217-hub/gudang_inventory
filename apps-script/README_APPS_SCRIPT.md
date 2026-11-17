# Integrasi Google Spreadsheet ↔ Gudang Inventory (Arsitektur A)

## Penting sebelum dipasang
Paket ini menambahkan jalur **Spreadsheet → Neon**. Jangan jalankan `bootstrapSheetsToNeon()` sebelum API `api/sheets-sync.js` terpasang dan variabel rahasia Vercel sudah diisi. Buat salinan Spreadsheet terlebih dahulu. **Jika Neon sudah berisi hasil seed/import sebelumnya, endpoint akan menolak bootstrap untuk mencegah data ganda.** Pemetaan baris lama perlu direkonsiliasi terlebih dahulu.

Saat ini paket ini belum mengaktifkan penulisan balik transaksi website → Spreadsheet. Jalur itu membutuhkan pemetaan ID untuk seluruh data lama dan pengujian konflik edit; jangan menganggap sinkronisasi dua arah sudah aktif hanya dengan memasang Apps Script ini.

## Isi folder
- `apps-script/Code.gs`: trigger edit dan pengiriman batch awal dari 10 sheet.
- `apps-script/appsscript.json`: manifest Apps Script.
- `api/sheets-sync.js`: endpoint Vercel yang memverifikasi HMAC dan menerima perubahan Spreadsheet.
- `api/_lib.js`: fungsi store diperluas dengan pencarian/pemetaan baris Spreadsheet.

## Konfigurasi Vercel
Tambahkan Environment Variables untuk Production (dan Preview jika digunakan):
- `SHEETS_SYNC_SECRET`: string acak panjang, minimal 32 karakter. Jangan kirimkan nilainya di chat.
- `DATABASE_URL`: tetap gunakan koneksi Neon yang sudah ada.

Deploy ulang setelah file di-commit.

## Konfigurasi Apps Script
1. Buka Google Spreadsheet → Extensions → Apps Script.
2. Buat file `Code.gs`, tempel isi `apps-script/Code.gs`.
3. Di Project Settings aktifkan `Show "appsscript.json" manifest file` bila perlu, lalu samakan manifest dengan file yang disediakan.
4. Project Settings → Script Properties, tambahkan:
   - `VERCEL_API_URL` = alamat proyek Vercel, contoh `https://nama-proyek.vercel.app`
   - `SYNC_SECRET` = nilai yang sama persis dengan `SHEETS_SYNC_SECRET` di Vercel.
5. Simpan, jalankan `setupInventorySync()` sekali dan setujui izin.
6. Setelah endpoint berhasil dideploy, jalankan `bootstrapSheetsToNeon()` sekali.

## Catatan data
- Script menambahkan kolom tersembunyi `_WEB_ID` pada setiap sheet. Jangan hapus atau ubah kolom ini.
- Jangan jalankan bootstrap berulang-ulang tanpa memahami pemetaan. Endpoint memakai pemetaan nomor baris untuk mencegah duplikasi.
- Perubahan satu sel mengirim seluruh baris yang diedit.
- Penghapusan baris secara fisik belum disinkronkan; gunakan prosedur penghapusan khusus setelah sinkronisasi penuh diuji.
- Spreadsheet sebaiknya tetap privat. Apps Script berjalan dengan otorisasi pemilik dan hanya endpoint bertoken yang menerima perubahan.
