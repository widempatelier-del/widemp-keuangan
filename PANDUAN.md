# Widemp Keuangan — Panduan Pemasangan

Isi tahap 1: proyek dan termin, kas masuk/keluar, ringkasan (saldo, piutang, grafik 6 bulan), sinkron Google Drive, serta cadangan JSON.

Pemasangan cukup dilakukan **sekali**. Siapkan laptop dan sekitar 30 menit.

---

## Langkah 1 — Hosting gratis di GitHub Pages

1. Buat akun di https://github.com (gratis).
2. Klik **New repository**, beri nama `widemp-keuangan`, pilih **Public**, lalu klik **Create**.
3. Klik **uploading an existing file**, lalu seret semua file dari zip ini (kecuali `PANDUAN.md`, boleh ikut). Klik **Commit changes**.
4. Buka **Settings → Pages**. Pada *Source* pilih **Deploy from a branch**, branch **main**, folder **/ (root)**, lalu klik **Save**.
5. Setelah 1–2 menit, aplikasi bisa dibuka di:
   `https://NAMA-AKUN-ANDA.github.io/widemp-keuangan/`

> Repository publik hanya berisi **kode aplikasi**. Data keuangan Anda tidak pernah masuk ke GitHub, melainkan tersimpan di perangkat dan Google Drive Anda.

## Langkah 2 — Buat Client ID Google (izin akses Drive)

1. Buka https://console.cloud.google.com dan login dengan akun Google yang akan dipakai.
2. Buat proyek baru bernama `Widemp Keuangan`.
3. Buka menu **APIs & Services → Library**, cari **Google Drive API**, lalu klik **Enable**.
4. Buka **Google Auth Platform** (atau **OAuth consent screen**):
   - Isi nama aplikasi `Widemp Keuangan` dan email Anda.
   - Pilih *Audience* **External**.
   - Pada **Test users**, tambahkan email Google Anda sendiri.
5. Buka **Clients → Create client**:
   - Pilih *Application type* **Web application**.
   - Pada **Authorized JavaScript origins**, tambahkan `https://NAMA-AKUN-ANDA.github.io` (tanpa `/widemp-keuangan` dan tanpa garis miring di akhir).
   - Klik **Create**, lalu salin **Client ID** (berakhiran `.apps.googleusercontent.com`).

> Aplikasi hanya meminta izin `drive.file`. Artinya aplikasi hanya bisa melihat file yang dibuatnya sendiri, bukan isi Drive Anda yang lain.

## Langkah 3 — Pasang di tiap perangkat

| Perangkat | Cara pasang |
|---|---|
| Android (Chrome) | Buka alamat aplikasi → menu ⋮ → **Install app / Tambahkan ke layar utama** |
| iPhone / iPad (Safari) | Buka alamat aplikasi → tombol **Bagikan** → **Tambah ke Layar Utama** |
| Laptop Windows (Chrome / Edge) | Buka alamat aplikasi → ikon **Install** di kolom alamat |

Lalu di **tiap perangkat**: buka **Pengaturan**, tempel Client ID, ketuk **Hubungkan Drive**, dan pilih akun Google Anda.

Saat login pertama Google akan menampilkan peringatan *"Google hasn't verified this app"*. Ini wajar untuk aplikasi pribadi. Pilih **Continue / Lanjutkan**.

Di Drive akan muncul folder **Widemp Atelier** berisi `widemp-data.json`. **Jangan diedit manual**, tapi boleh disalin sebagai cadangan.

---

## Cara kerja sinkron

- Setiap perubahan disimpan dulu di perangkat, lalu dikirim ke Drive sekitar 3 detik kemudian bila online.
- Saat offline, aplikasi tetap bisa dipakai. Status di kanan atas menunjukkan **Offline · tersimpan lokal**, dan perubahan terkirim saat koneksi kembali.
- Bila dua perangkat mengubah **data yang sama**, perubahan yang **paling akhir** yang dipakai. Data berbeda (misalnya transaksi baru di HP dan di laptop) tidak saling menimpa.
- Login Google berlaku sekitar 1 jam. Jika status menunjukkan **Ketuk untuk sinkron**, ketuk status itu.

## Catatan iPhone

- Selalu buka aplikasi dari ikon di Layar Utama, bukan dari tab Safari.
- Jika login Google gagal dari ikon Layar Utama, hubungkan sekali lewat tab Safari biasa, lalu kembali ke ikon.

## Kebiasaan aman

- Seminggu sekali, buka **Pengaturan → Ekspor JSON** dan simpan filenya.
- Aktifkan **verifikasi 2 langkah** di akun Google Anda.
- Jangan pakai mode penyamaran / privat browser.

## Pembaruan aplikasi

Untuk memasang versi baru, unggah file baru ke repository GitHub (timpa file lama). Perangkat akan memakai versi baru pada pembukaan **kedua** setelah unggahan.

## Memperbarui ke versi baru (mis. tahap 2)

1. Ekstrak zip versi baru di laptop.
2. Di GitHub buka repository → **Add file → Upload files**.
3. Seret **seluruh isi** folder hasil ekstrak, **termasuk folder `assets`** (folder ini berisi font untuk PDF).
4. Klik **Commit changes**. File lama dengan nama sama otomatis tertimpa.
5. Tunggu 1–2 menit, lalu buka aplikasi dua kali (pembukaan pertama mengunduh versi baru).

## Invoice & kwitansi (tahap 2)

- **Pengaturan → Invoice & kwitansi**: kota, kontak, rekening, awalan nomor, dan catatan bawaan. Sudah terisi dari contoh dokumen Anda, cek sekali.
- **Invoice per termin**: buka proyek → tombol **Buat invoice** pada termin. Termin otomatis berstatus *Ditagih* dengan jatuh tempo dari invoice.
- **Invoice nilai penuh** (seperti contoh per m²): buka proyek → **Invoice nilai penuh**, lalu ubah item (qty, satuan, harga).
- **Kwitansi**: otomatis ditawarkan setelah **Catat pembayaran**. Untuk pemasukan lain, ketuk **+ Kwitansi** di daftar transaksi.
- Di layar dokumen: **Unduh PDF**, **Bagikan** (langsung ke WhatsApp dari HP), atau **Simpan ke Drive** (masuk ke folder `Widemp Atelier/Invoice` atau `/Kwitansi`).
- Nomor dibuat berurutan per tahun. Jika dua perangkat membuat dokumen saat offline, nomornya bisa sama; aplikasi memperingatkan, dan nomor bisa diubah manual.
- Kwitansi ≥ Rp5.000.000 otomatis diberi kotak tempat meterai.
