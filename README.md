# PLN Icon Plus - Gudang Inventory (versi Vercel)

Port dari aplikasi PHP/MySQL ke **HTML + CSS + JavaScript** yang berjalan di Vercel (PHP tidak didukung Vercel).

## Arsitektur
| Bagian | Pengganti |
|---|---|
| PHP (render halaman, stok, grafik) | SPA statis di `public/` (`js/logic.js` = logika stok & pergerakan, `js/pages.js` = halaman) |
| `proses.php`, `fungsi.php` (tulis data) | Fungsi serverless Node di `api/` (`data.js`, `mutate.js`, `login.js`, `status.js`) |
| MySQL InfinityFree / Google Sheets | **Postgres (Neon)**, tabel `inventory_records` (skema JSON per baris, sama seperti versi MySQL) |
| Tanpa login | Kata sandi bersama (`APP_PASSWORD`) |

Tampilan, menu, dan aturan stok sama dengan versi PHP. Perbedaan: Sinkron Spreadsheet (sudah nonaktif di versi MySQL) dihapus; Import Excel membaca format `inventory.xlsx` 10 sheet; ekspor PDF memakai dialog cetak browser.

## Deploy (sekali saja)
1. Unggah folder ini ke repo GitHub **privat** (`data/inventory.xlsx` berisi data bisnis) lalu **Add New > Project** di Vercel dan impor repo itu.
2. Di proyek Vercel: **Storage > Create > Neon (Postgres)**, sambungkan ke proyek (variabel `DATABASE_URL` otomatis terisi). Pilih region Singapore agar dekat dengan fungsi (`sin1`).
3. **Settings > Environment Variables**: tambah `APP_PASSWORD` (kata sandi masuk). Lalu **Redeploy**.
4. Isi database dari komputer Anda (sekali):
   ```bash
   npm install
   vercel env pull .env.local        # atau salin DATABASE_URL dari dashboard Neon
   DATABASE_URL="postgres://..." npm run seed
   ```
   Perintah ini memuat `data/inventory.xlsx` (33.422 baris). Ulangi dengan `-- --reset` bila ingin mengisi ulang dari nol.
5. Buka `https://<proyek>.vercel.app`. Cek `/api/status` (setelah login, atau lewat tombol Muat ulang) untuk melihat jumlah baris per sheet.

## Uji lokal
```bash
npm install
npm run dev     # http://localhost:3000, data dari data/inventory.xlsx di memori (tanpa database)
npm test        # tes logika stok terhadap data nyata
node scripts/test-api.mjs   # tes SQL/API (perlu: npm i --no-save @electric-sql/pglite)
```

## Memperbarui data dari Excel
Konversi Excel mentah dengan `scripts/buat_inventory_xlsx.py` (sama seperti versi lama), lalu buka menu **Import Excel**: unggah, **Periksa file**, **Mulai import**. Baris yang sudah ada tidak digandakan.

## Pengaturan
- Tanggal snapshot Kartu Gantung: `STOK_AWAL_TANGGAL` di `public/js/logic.js` (sekarang `2026-11-03`).
- Aturan stok: transaksi sesudah tanggal itu menambah/mengurangi Stok Awal; sebelumnya hanya riwayat (sama seperti versi PHP).

## Catatan
- Pengecekan stok keluar dilakukan di browser (data sudah dimuat); server memvalidasi tanggal, SN ganda, dan konflik versi edit.
- Seluruh data dimuat saat aplikasi dibuka (~30 ribu baris, dikirim terkompresi per 5.000 baris), lalu disegarkan otomatis bila tab dibuka kembali setelah 2 menit.
- Plan gratis Neon/Vercel cukup untuk skala ini.


## Integrasi Google Spreadsheet (tahap awal)
Lihat `apps-script/README_APPS_SCRIPT.md`. Paket ini menambahkan sinkronisasi perubahan Spreadsheet menuju Neon. Sinkronisasi balik dari transaksi website ke Spreadsheet belum diaktifkan; lakukan setelah pemetaan data lama diverifikasi.
