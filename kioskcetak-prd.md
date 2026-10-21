# PRD: KioskCetak (Sistem Self-Printing Kiosk)

> Nama produk masih **placeholder** ("KioskCetak"). Ide lain: Cetakin, KlikCetak, PrintBox, Cetak Kilat.
> Semua angka target adalah **target awal pilot** dan disesuaikan setelah data nyata terkumpul.
> Status: draft final hasil diskusi bagian 1-6. Tanggal: 21 Oktober 2026.

---

## 1. Latar Belakang

Mahasiswa dan pengguna umum yang perlu mencetak dokumen biasanya harus datang ke percetakan, mengirim file lewat WhatsApp, lalu menunggu operator. Prosesnya lambat, bergantung jam operasional, dan butuh tenaga jaga. Dokumen pribadi juga tersimpan di chat dan HP operator.

KioskCetak menggantikan alur itu dengan **kiosk mandiri**: user scan QR di layar kiosk, upload dokumen dari HP, melihat rincian biaya, membayar QRIS, dan dokumen langsung tercetak otomatis tanpa operator.

## 2. Tujuan

- Cetak mandiri dari HP, tanpa install aplikasi dan tanpa login.
- Waktu scan sampai kertas keluar median **< 2 menit** (PDF/gambar) dan **< 3 menit** (DOCX/PPTX).
- Pembayaran terverifikasi otomatis; tidak ada order dicetak tanpa lunas.
- Operasional hemat tenaga: admin cukup memantau lewat dashboard dan Telegram.
- Privasi terjaga: file user terhapus otomatis setelah dicetak.

## 3. Target Pengguna

| Pengguna | Kebutuhan utama |
|---|---|
| Mahasiswa (utama) | Cetak tugas, makalah, slide; cepat, murah, sering mendadak |
| Umum / pekerja | Cetak formulir dan dokumen administrasi |
| Admin / pemilik | Atur harga, pantau mesin, laporan, terima alert, tangani refund |

## 4. Ruang Lingkup

**Masuk MVP (pilot 1 mesin):**
- Web app user tanpa login, diakses lewat QR dinamis di layar sentuh kiosk
- Upload PDF, DOCX, PPTX, JPG, PNG (maks 50 MB/file); DOCX/PPTX dikonversi ke PDF
- Opsi cetak: A4, hitam-putih/warna, 1 sisi/bolak-balik (jika printer mendukung), salinan, rentang halaman, orientasi, banyak halaman per lembar (N-up)
- Jumlah halaman per dokumen tanpa batas
- Rincian biaya, pembayaran QRIS dinamis (DOKU)
- Status real-time, struk digital, penanganan gagal cetak (cetak ulang lalu refund manual)
- Dashboard admin, monitoring mesin, alert Telegram
- Penghapusan file otomatis

**Di luar MVP (fase berikutnya):** ukuran F4/A3/foto, voucher/promo, multi-mesin dalam satu dashboard (mesin ke-2), fotokopi/scan, akun langganan, PIN rilis cetak, refund otomatis, antarmuka Bahasa Inggris, pindah ke hosting sendiri.

## 5. Asumsi dan Ketergantungan

- Mesin: mini PC (disarankan Windows, RAM minimal 8 GB, SSD) + printer inkjet ink tank USB dengan auto-duplex + layar sentuh. Internet stabil di lokasi, ditempatkan di **dalam ruangan berpenjaga**.
- Stack: Next.js + Supabase, dengan **print agent** (Node.js) di mini PC yang mengambil job dari server lewat koneksi keluar saja. Hosting awal: Vercel (**perlu verifikasi lisensi komersial**; nanti dapat dipindah).
- Pembayaran: akun DOKU Wallet belum sama dengan QRIS merchant. Pengajuan QRIS masih harus diproses dan menjadi **jalur kritis**. Selama menunggu, pengembangan memakai sandbox DOKU.
- Tidak ada dana VPS: konversi dokumen dan pembuatan PDF akhir dijalankan di mini PC.
- Pengisian kertas dan tinta dilakukan manual oleh admin.

### Rekomendasi printer
Inkjet **ink tank** (biaya per halaman jauh lebih murah) dengan **auto-duplex**, koneksi USB, dan tray kertas cukup besar. Kandidat untuk dicek spesifikasinya: seri Epson EcoTank (misalnya L6xxx dengan auto-duplex) dan Canon PIXMA G-series. Verifikasi model dan harga terbaru di toko resmi. Printer A3 biasanya perangkat terpisah, jadi dijadikan fase berikutnya.

---

## 6. Alur Pengguna

### 6.1 Alur utama

| # | Langkah | Yang terjadi |
|---|---|---|
| 1 | Scan QR di layar kiosk | QR dinamis (token sesi berumur pendek). HP terbuka di web app dan layar kiosk menampilkan "HP terhubung". |
| 2 | Upload dokumen | Banyak file sekaligus. DOCX/PPTX berstatus "Mengonversi..." lalu menjadi PDF. Jumlah halaman dibaca. |
| 3 | Preview | Hasil per sisi kertas dirender di browser user, dengan peringatan untuk hasil konversi. |
| 4 | Atur opsi cetak | Warna/hitam-putih, 1 sisi/bolak-balik, salinan, rentang halaman, orientasi, N-up. |
| 5 | Rincian biaya | Ringkasan per file dan total, ditambah estimasi waktu cetak. |
| 6 | Tekan "Bayar" | Mesin **dikunci** secara atomik, harga dikunci, QR pembayaran muncul dengan hitung mundur **5 menit**. |
| 7 | Verifikasi pembayaran | Webhook DOKU masuk, status menjadi Lunas otomatis. |
| 8 | Cetak | Agent membuat PDF akhir lalu mencetak. Progres tampil di HP dan layar kiosk. |
| 9 | Selesai | "Ambil dokumen di nampan" + kode transaksi. File dihapus, kunci dilepas, struk tersedia. |

### 6.2 Alur alternatif dan kasus khusus

- **Mesin tidak siap** (offline, kertas/tinta habis, error) atau **sedang dipakai**: user melihat status dan tidak bisa membuat order (tanpa antrean). Halaman memperbarui status otomatis.
- **Mesin terkunci saat "Bayar" ditekan** (user lain lebih dulu): user diberi tahu dan menunggu dengan pembaruan otomatis.
- **Pembayaran kedaluwarsa:** order `KEDALUWARSA`, file dihapus, kunci dilepas, user bisa membuat order baru.
- **Format tidak didukung, file rusak, atau PDF berpassword:** pesan jelas dan saran tindakan.
- **Halaman bukan A4:** disesuaikan otomatis (fit to page), ditandai di preview.
- **Browser ditutup setelah bayar:** pencetakan tetap berjalan; status dapat dibuka lagi lewat kode transaksi.
- **Cetak gagal setelah bayar:** lihat 6.4.

### 6.3 Alur admin
1. Login dashboard (satu-satunya yang butuh login).
2. Lihat status mesin, order aktif, transaksi hari ini.
3. Ubah harga dan aktif/nonaktifkan opsi (misalnya warna saat tinta warna habis).
4. Tekan "Isi ulang selesai" setelah mengisi kertas/tinta.
5. Tangani refund, pembayaran tidak cocok, dan order bermasalah.

### 6.4 Penanganan gagal cetak
1. Agent mendeteksi error printer (kertas habis, macet, offline) atau job melewati batas waktu.
2. Sistem mencoba cetak ulang otomatis hingga **2 kali**.
3. Jika tetap gagal: mesin otomatis Tidak tersedia, admin dapat alert Telegram, order masuk `MENUNGGU_REFUND`, user mengisi data refund.
4. Tidak ada halaman tercetak: refund penuh. Sebagian tercetak: admin memilih refund proporsional atau cetak ulang sisa.
5. Admin mentransfer **manual**, menandai selesai dengan catatan/bukti.

**Batas teknis:** lewat driver printer, sistem tahu job "terkirim dan selesai diproses", tetapi tidak selalu tahu apakah kertas benar-benar macet atau keluar kosong. Karena itu ada tombol "Laporkan masalah" (tautan WhatsApp admin dengan kode transaksi terisi) sebagai jalur cadangan.

## 7. Status Order

`DIBUAT → DIUPLOAD → DIATUR → MENUNGGU_BAYAR → LUNAS → MENCETAK → SELESAI`

Cabang: `KEDALUWARSA`, `DIBATALKAN` (hanya sebelum bayar), `GAGAL_CETAK → CETAK_ULANG → MENUNGGU_REFUND → DIREFUND`.

Aturan: hanya order `LUNAS` yang boleh dicetak; satu order tidak boleh dicetak dua kali (idempoten terhadap webhook ganda); tidak ada status antrean karena mesin hanya melayani satu order aktif.

## 8. Daftar Fitur

### Web app pengguna
| ID | Fitur | Prioritas |
|---|---|---|
| F-01 | Akses via QR dinamis di layar kiosk, tanpa login, sesi anonim | MVP |
| F-02 | Cek status mesin sebelum order | MVP |
| F-03 | Upload multi-file (PDF, DOCX, PPTX, JPG, PNG), maks 50 MB/file | MVP |
| F-04 | Konversi otomatis ke PDF (di mini PC) dan hitung halaman | MVP |
| F-05 | Preview halaman sebelum bayar | MVP |
| F-06 | Opsi cetak: warna/hitam-putih, 1 sisi/bolak-balik, salinan, rentang halaman, orientasi | MVP |
| F-07 | Rincian biaya real-time + estimasi waktu cetak | MVP |
| F-08 | Pembayaran QRIS dinamis + hitung mundur 5 menit | MVP |
| F-09 | Status real-time (bayar, cetak, selesai) | MVP |
| F-10 | Halaman status via kode transaksi | MVP |
| F-11 | Penghapusan file otomatis | MVP |
| F-12 | Tombol "Laporkan masalah" (tautan WhatsApp admin + kode transaksi) | MVP |
| F-13 | Antarmuka Bahasa Indonesia (Inggris menyusul) | MVP / berikutnya |
| F-14 | Banyak halaman per lembar (N-up: 1, 2, 4, 6, 9) | MVP |
| F-15 | Struk digital (PNG/PDF) | MVP |

**Penjelasan F-14:** mencetak beberapa halaman dokumen dalam satu sisi kertas. Contoh: PPT 40 slide dengan 4-up hanya butuh 10 sisi, sehingga jauh lebih murah. Biaya dihitung dari **sisi kertas fisik**, bukan halaman asli.

### Sistem dan mesin
| ID | Fitur | Prioritas |
|---|---|---|
| S-01 | Print agent di mini PC mengambil job dari server | MVP |
| S-02 | Satu job aktif per mesin (reservasi saat "Bayar") | MVP |
| S-03 | Heartbeat status mesin (online, kertas, printer) | MVP |
| S-04 | Retry otomatis dan deteksi gagal cetak | MVP |
| S-05 | Nozzle check dan cleaning terjadwal | MVP |
| S-06 | Estimasi tinta/kertas dari hitungan sisi tercetak | MVP |
| S-07 | Layar kiosk: QR dinamis, status mesin, progres cetak | MVP |
| S-08 | Konversi DOCX/PPTX dan pembuatan PDF akhir oleh agent | MVP |

### Dashboard admin
| ID | Fitur | Prioritas |
|---|---|---|
| A-01 | Login admin (2FA direkomendasikan) | MVP |
| A-02 | Pengaturan harga dan opsi per mesin | MVP |
| A-03 | Riwayat transaksi dan filter | MVP |
| A-04 | Status mesin dan order aktif | MVP |
| A-05 | Laporan pendapatan harian/bulanan, ekspor CSV | MVP |
| A-06 | Alert Telegram (email sebagai cadangan) | MVP |
| A-07 | Refund manual dan cetak ulang | MVP |
| A-08 | Multi-mesin dan multi-lokasi | Berikutnya |
| A-09 | Voucher dan promo | Berikutnya |

## 9. Aturan Bisnis dan Harga

- Harga per **sisi** untuk empat kombinasi: hitam-putih 1 sisi, hitam-putih bolak-balik, warna 1 sisi, warna bolak-balik.
- Harga bolak-balik per sisi **sedikit lebih murah** dari 1 sisi (hemat kertas); besar selisih adalah parameter admin.
- Total per file = sisi fisik tercetak × harga satuan × salinan. Total order = jumlah semua file, dibulatkan sesuai aturan admin (Rp 100 atau Rp 500).
- Gambar (JPG/PNG) dihitung sebagai halaman warna kecuali user memilih hitam-putih.
- Order memakai harga saat QR pembayaran dibuat; perubahan harga tidak memengaruhi order berjalan.
- Hitung dulu biaya per halaman (tinta, kertas, perawatan, biaya transaksi QRIS) agar harga jual punya margin.

---

## 10. Kebutuhan Fungsional

### 10.1 Akses, Sesi, dan Status Mesin (FR-ACC)
| ID | Kebutuhan |
|---|---|
| FR-ACC-01 | QR ditampilkan **di layar kiosk** dan berisi URL + token sesi acak yang terikat ke mesin. Token QR diganti tiap 60 detik; token sebelumnya tetap berlaku 30 detik (masa toleransi). |
| FR-ACC-02 | Saat QR di-scan, server menukar token menjadi **sesi order** untuk HP tersebut (berlaku 15 menit untuk upload dan atur opsi) dan layar kiosk menampilkan "HP terhubung". |
| FR-ACC-03 | Status mesin tampil: Tersedia, Sedang dipakai, Tidak tersedia (offline, kertas habis, tinta habis, error). |
| FR-ACC-04 | Jika bukan Tersedia, user tidak bisa membuat order dan melihat alasan; halaman memperbarui otomatis. |
| FR-ACC-05 | Opsi yang dinonaktifkan admin tidak muncul atau tampil abu-abu dengan keterangan. |

### 10.2 Reservasi Mesin (FR-LCK)
| ID | Kebutuhan |
|---|---|
| FR-LCK-01 | Satu mesin hanya boleh punya satu order aktif (dari "Bayar" sampai selesai). |
| FR-LCK-02 | Mesin dikunci **saat user menekan "Bayar"** (QR pembayaran dibuat), lewat pembaruan atomik bersyarat. Kunci dilepas saat kedaluwarsa, batal, atau cetak selesai. |
| FR-LCK-03 | Jika mesin sudah terkunci saat "Bayar" ditekan, user diberi tahu dan menunggu dengan pembaruan otomatis. |
| FR-LCK-04 | Kunci punya batas waktu maksimum; admin bisa melepas kunci manual. |

### 10.3 Upload dan Konversi (FR-UP)
| ID | Kebutuhan |
|---|---|
| FR-UP-01 | Mendukung **PDF, DOCX, PPTX, JPG, PNG**, banyak file per order. |
| FR-UP-02 | Validasi tipe berdasarkan isi (bukan hanya ekstensi), batas 50 MB/file, pesan error jelas. |
| FR-UP-03 | Progres upload tampil; upload terputus dapat diulang. File diunggah langsung ke Storage lewat URL bertanda tangan. |
| FR-UP-04 | DOCX/PPTX dikonversi ke PDF oleh **agent di mini PC** (LibreOffice headless). Gambar dikonversi ke PDF dan disesuaikan ke A4. Konversi terjadi sebelum "Bayar". |
| FR-UP-05 | Jumlah halaman dihitung setelah konversi. |
| FR-UP-06 | PDF berpassword, rusak, atau gagal konversi ditolak dengan pesan jelas dan saran ("simpan sebagai PDF lalu upload ulang"). |
| FR-UP-07 | User bisa menghapus atau mengganti file sebelum bayar. |
| FR-UP-08 | Peringatan bahwa hasil konversi DOCX/PPTX bisa sedikit berbeda (font, tata letak); anjurkan memeriksa preview atau mengunggah PDF. |
| FR-UP-09 | Jika mini PC offline, upload DOCX/PPTX tidak tersedia (mesin berstatus Tidak tersedia). |

### 10.4 Preview dan Opsi Cetak (FR-OPT)
| ID | Kebutuhan |
|---|---|
| FR-OPT-01 | Opsi per file: warna/hitam-putih, 1 sisi/bolak-balik, salinan, rentang halaman (contoh 1-3, 5, 8-10), orientasi. |
| FR-OPT-02 | Opsi N-up: 1, 2, 4, 6, 9 halaman per sisi. |
| FR-OPT-03 | Bolak-balik hanya ditawarkan jika mesin mendukung auto-duplex dan admin mengaktifkannya. |
| FR-OPT-04 | Preview (dirender di browser) menampilkan hasil akhir per sisi kertas, memperhitungkan rentang, N-up, orientasi, dan hitam-putih. |
| FR-OPT-05 | Rentang halaman divalidasi dengan pesan jelas. |
| FR-OPT-06 | Halaman non-A4 disesuaikan ke A4 (fit to page) dan ditandai di preview. |
| FR-OPT-07 | Batas **jumlah salinan (rangkap) per file: 50** (diatur admin), untuk mencegah salah ketik. Jumlah halaman per dokumen tidak dibatasi. |
| FR-OPT-08 | Mode hitam-putih memakai tinta hitam saja bila printer mendukung. |

### 10.5 Harga dan Rincian Biaya (FR-PRC)
| ID | Kebutuhan |
|---|---|
| FR-PRC-01 | Harga per sisi untuk 4 kombinasi; bolak-balik per sisi lebih murah (selisih diatur admin). |
| FR-PRC-02 | Total per file = sisi fisik × harga × salinan; total order dibulatkan sesuai aturan admin. |
| FR-PRC-03 | Rincian per file berubah real-time saat opsi diubah, disertai **estimasi waktu cetak**. |
| FR-PRC-04 | Harga dikunci saat QR pembayaran dibuat. |
| FR-PRC-05 | Perhitungan harga dilakukan **di server**. |
| FR-PRC-06 | Jika total di bawah minimum QRIS/admin, user diberi tahu. |

### 10.6 Pembayaran QRIS (FR-PAY)
| ID | Kebutuhan |
|---|---|
| FR-PAY-01 | QRIS dinamis via DOKU dengan nominal tepat dan ID order unik. |
| FR-PAY-02 | QR kedaluwarsa dalam **5 menit** dengan hitung mundur (juga diatur di sisi DOKU). Setelah itu `KEDALUWARSA`, file dihapus, kunci dilepas. |
| FR-PAY-03 | Status lunas lewat **webhook DOKU**; signature wajib diverifikasi. |
| FR-PAY-04 | Webhook idempoten; notifikasi ganda tidak menyebabkan cetak ganda. |
| FR-PAY-05 | Nominal dan ID order webhook harus cocok; jika tidak, ditandai untuk admin dan tidak dicetak otomatis. |
| FR-PAY-06 | Rekonsiliasi berkala via API cek status DOKU jika webhook terlambat/hilang. |
| FR-PAY-07 | Pembayaran masuk setelah kedaluwarsa ditandai khusus dan masuk antrean refund manual. |
| FR-PAY-08 | User bisa membatalkan order **hanya sebelum** membayar. Setelah lunas tidak bisa dibatalkan. |

### 10.7 Pencetakan (FR-PRT)
| ID | Kebutuhan |
|---|---|
| FR-PRT-01 | Hanya order `LUNAS` yang boleh dikirim ke printer. |
| FR-PRT-02 | **Agent di mini PC** membuat PDF akhir per order (rentang halaman, N-up, orientasi, mode warna) dari file yang sudah ada, lalu mencetaknya. |
| FR-PRT-03 | Agent mengambil job lewat koneksi keluar saja, tanpa port terbuka. |
| FR-PRT-04 | Agent menerapkan pengaturan printer (warna/hitam-putih, duplex, salinan) dan memantau job sampai selesai. |
| FR-PRT-05 | Agent melaporkan status (`MENCETAK`, `SELESAI`, `GAGAL`) ke server. |
| FR-PRT-06 | Setelah selesai, layar user dan layar kiosk menampilkan "Ambil dokumen di nampan" dan kode transaksi. |
| FR-PRT-07 | Setelah selesai, file di server dan di mini PC dihapus. |

### 10.8 Kegagalan Cetak dan Refund (FR-FAIL)
| ID | Kebutuhan |
|---|---|
| FR-FAIL-01 | Agent mendeteksi error printer (offline, kertas habis, macet, melewati batas waktu). |
| FR-FAIL-02 | Cetak ulang otomatis maksimal 2 kali. |
| FR-FAIL-03 | Jika tetap gagal: mesin Tidak tersedia, alert Telegram ke admin, order `MENUNGGU_REFUND`. |
| FR-FAIL-04 | User mengisi form refund (nama, e-wallet/rekening, nomor); data hanya diminta saat gagal. |
| FR-FAIL-05 | Admin melihat refund pending, mentransfer **manual**, menandai selesai dengan catatan/bukti; status user menjadi `DIREFUND`. |
| FR-FAIL-06 | Cetak sebagian: admin memilih refund proporsional atau cetak ulang sisa. |
| FR-FAIL-07 | Tombol "Laporkan masalah" membuka WhatsApp admin dengan kode transaksi terisi. |
| FR-FAIL-08 | Data refund dan bukti transfer dihapus/dianonimkan setelah **6 bulan**. |

### 10.9 Status, Kode Transaksi, dan Struk (FR-STS)
| ID | Kebutuhan |
|---|---|
| FR-STS-01 | Kode transaksi acak kriptografis, minimal 8 karakter. |
| FR-STS-02 | Halaman status (dapat dibuka lagi via kode) menampilkan status real-time. |
| FR-STS-03 | Halaman status tidak menampilkan isi dokumen, hanya nama file, jumlah halaman, rincian biaya. |
| FR-STS-04 | Struk digital (kode, waktu, mesin, rincian, total, metode, status) dapat diunduh PNG/PDF. |

### 10.10 Data dan Privasi (FR-DAT)
| ID | Kebutuhan |
|---|---|
| FR-DAT-01 | File disimpan di penyimpanan privat dengan URL bertanda tangan berumur pendek. |
| FR-DAT-02 | File dihapus segera setelah cetak selesai, atau maksimal **1 jam** jika order tidak jadi dibayar. |
| FR-DAT-03 | Jika menunggu refund, file dihapus setelah keputusan atau maksimal 24 jam. |
| FR-DAT-04 | Penghapusan terjadwal andal, dengan log (tanpa isi dokumen). |
| FR-DAT-05 | Admin tidak bisa melihat atau mengunduh isi dokumen; hanya metadata. |

### 10.11 Dashboard Admin (FR-ADM)
| ID | Kebutuhan |
|---|---|
| FR-ADM-01 | Login email + password; **2FA direkomendasikan** (bukan wajib). |
| FR-ADM-02 | Ubah harga dan aktif/nonaktif opsi (warna, bolak-balik, N-up) per mesin. |
| FR-ADM-03 | Status mesin real-time: online/offline, order aktif, estimasi kertas/tinta, heartbeat terakhir. |
| FR-ADM-04 | Riwayat transaksi dengan filter tanggal, status, dan pencarian kode. |
| FR-ADM-05 | Laporan pendapatan harian/bulanan, jumlah lembar, ekspor CSV. |
| FR-ADM-06 | Tombol "Isi ulang selesai" mereset estimasi dan mengaktifkan mesin. |
| FR-ADM-07 | Antrean tindakan: refund pending, pembayaran tidak cocok, order bermasalah. |
| FR-ADM-08 | Lepas kunci mesin manual; mode perawatan (nonaktifkan mesin). |
| FR-ADM-09 | Alert via **Telegram** (email sebagai cadangan): kertas/tinta menipis, mesin offline > N menit, gagal cetak, refund baru. |

### 10.12 Monitoring dan Perawatan Mesin (FR-MCH)
| ID | Kebutuhan |
|---|---|
| FR-MCH-01 | Agent mengirim heartbeat berkala; tanpa heartbeat melewati batas, mesin offline. |
| FR-MCH-02 | Estimasi kertas/tinta dari jumlah sisi tercetak sejak isi ulang, ambang diatur admin. |
| FR-MCH-03 | Nozzle check dan cleaning terjadwal saat mesin lama menganggur, hasil dilaporkan ke admin. |
| FR-MCH-04 | Agent dapat dikelola jarak jauh (minimal restart dan lihat log). |

### 10.13 Layar Kiosk (FR-KSK)
| ID | Kebutuhan |
|---|---|
| FR-KSK-01 | Halaman `/kiosk/{machineId}` dalam mode kiosk di layar sentuh. |
| FR-KSK-02 | Menampilkan QR dinamis, status mesin, "HP terhubung", hitung mundur pembayaran, dan progres cetak. |
| FR-KSK-03 | Layar **tidak** memiliki fungsi upload; semua input dokumen lewat HP user. |
| FR-KSK-04 | Menampilkan petunjuk singkat penggunaan dan peringatan konversi DOCX/PPTX. |

---

## 11. Kebutuhan Non-Fungsional

### 11.1 Performa (NFR-PRF)
| ID | Kebutuhan | Target |
|---|---|---|
| NFR-PRF-01 | Web app terbuka setelah scan (4G biasa) | < 3 detik |
| NFR-PRF-02 | Upload file 10 MB | < 15 detik di 4G |
| NFR-PRF-03 | Konversi DOCX/PPTX (sampai 30 halaman) + preview | < 30 detik |
| NFR-PRF-04 | Pembaruan harga saat opsi diubah | < 1 detik |
| NFR-PRF-05 | Webhook diterima sampai printer mulai bekerja | < 10 detik |
| NFR-PRF-06 | Perubahan status sampai tampil di layar user | < 3 detik |
| NFR-PRF-07 | Scan sampai kertas pertama keluar | < 2 menit (PDF/gambar), < 3 menit (DOCX/PPTX) |

### 11.2 Ketersediaan dan Keandalan (NFR-REL)
| ID | Kebutuhan |
|---|---|
| NFR-REL-01 | Ketersediaan layanan web **99%** selama jam operasional. |
| NFR-REL-02 | Mini PC otomatis menyala dan menjalankan agent + mode kiosk setelah mati listrik/restart. |
| NFR-REL-03 | Agent menyimpan status job lokal; setelah restart/internet putus tidak mencetak dua kali. |
| NFR-REL-04 | Internet mesin putus: mesin otomatis Tidak tersedia, order baru diblokir. |
| NFR-REL-05 | Proses yang melibatkan uang idempoten dan tercatat (audit trail). |
| NFR-REL-06 | Backup database harian dengan uji pemulihan berkala. |
| NFR-REL-07 | Pekerjaan terjadwal (hapus file, kedaluwarsa, rekonsiliasi) dipantau dengan alert jika berhenti. |

### 11.3 Keamanan (NFR-SEC)
| ID | Kebutuhan |
|---|---|
| NFR-SEC-01 | Seluruh lalu lintas HTTPS. |
| NFR-SEC-02 | Signature webhook DOKU diverifikasi; kunci API hanya di server. |
| NFR-SEC-03 | Print agent memakai token unik per mesin yang dapat dicabut; hanya koneksi keluar. |
| NFR-SEC-04 | Row Level Security di Supabase; sesi anonim hanya membaca order miliknya. |
| NFR-SEC-05 | Kode transaksi acak kriptografis + rate limiting anti tebak. |
| NFR-SEC-06 | Rate limiting upload dan pembuatan order per IP/sesi. |
| NFR-SEC-07 | File dipindai antivirus (misalnya ClamAV) dan dikonversi di lingkungan terisolasi. |
| NFR-SEC-08 | URL file bertanda tangan berumur pendek; storage tidak publik. |
| NFR-SEC-09 | Admin: password kuat, 2FA direkomendasikan, sesi berbatas waktu, aksi sensitif (ubah harga, refund, lepas kunci) tercatat. |
| NFR-SEC-10 | Mini PC dikeraskan: mode kiosk, tanpa akses desktop/keyboard umum, USB tidak terekspos, akun OS minimal, disk terenkripsi bila memungkinkan. Karena mini PC mengonversi file dari anonim, tidak menyimpan data sensitif lain di dalamnya. |
| NFR-SEC-11 | Harga dihitung server dan dicocokkan dengan nominal webhook. |
| NFR-SEC-12 | QR dinamis di layar sentuh menggantikan stiker QR, sehingga QR palsu tidak relevan dan order tidak dapat dimulai dari jauh. |

### 11.4 Privasi dan Kepatuhan (NFR-PRV)
| ID | Kebutuhan |
|---|---|
| NFR-PRV-01 | Data minimal: tanpa akun, tanpa nomor HP/email wajib; data pribadi hanya saat refund. |
| NFR-PRV-02 | Isi dokumen tidak pernah tampil di log, dashboard, atau monitoring. |
| NFR-PRV-03 | Retensi mengikuti FR-DAT; data refund dihapus/dianonimkan setelah **6 bulan**. |
| NFR-PRV-04 | Tersedia Kebijakan Privasi dan Syarat Penggunaan; user menyetujui sebelum upload. |
| NFR-PRV-05 | Desain mengikuti prinsip UU No. 27 Tahun 2022 (Pelindungan Data Pribadi). Isi dokumen kebijakan sebaiknya ditinjau pihak yang paham hukum. |
| NFR-PRV-06 | Pembayaran sepenuhnya diproses DOKU; sistem tidak menyimpan data rekening/e-wallet pembayar. |

### 11.5 Kegunaan dan Kompatibilitas (NFR-USE)
| ID | Kebutuhan |
|---|---|
| NFR-USE-01 | Mobile-first, nyaman di layar 360 px ke atas. Layar kiosk dioptimalkan untuk layar sentuh. |
| NFR-USE-02 | Chrome dan Safari (iOS/Android) versi terbaru dan satu versi sebelumnya. |
| NFR-USE-03 | Alur upload sampai bayar maksimal 5 langkah layar; pesan error sederhana berbahasa Indonesia. |
| NFR-USE-04 | Ukuran huruf dan kontras mengacu WCAG AA sebisa mungkin. |
| NFR-USE-05 | Halaman ringan agar cepat di sinyal lemah. |
| NFR-USE-06 | User dapat kembali ke status order lewat kode transaksi. |
| NFR-USE-07 | User **tidak perlu me-refresh** halaman; QR di layar kiosk berotasi otomatis dan sesi HP tidak terpengaruh rotasi. |

### 11.6 Skalabilitas dan Pengembangan (NFR-SCL)
| ID | Kebutuhan |
|---|---|
| NFR-SCL-01 | Mesin sebagai entitas terpisah (harga, opsi, status per mesin) sehingga menambah mesin ke-2 tanpa perombakan. |
| NFR-SCL-02 | Kemampuan printer (duplex, warna, ukuran kertas) diabstraksikan agar F4/A3 dapat ditambah nanti. |
| NFR-SCL-03 | Backend tidak terikat satu hosting; logika bisnis dipisah dari SDK penyedia. |
| NFR-SCL-04 | Konfigurasi harga/opsi terpisah dari kode; ubah harga tanpa deploy. |

### 11.7 Observabilitas dan Perawatan (NFR-OPS)
| ID | Kebutuhan |
|---|---|
| NFR-OPS-01 | Pencatatan error web/backend (misalnya Sentry) dan log agent yang dapat dilihat jarak jauh. |
| NFR-OPS-02 | Pemantauan uptime layanan dan mesin dengan notifikasi. |
| NFR-OPS-03 | Jejak peristiwa per order untuk menyelesaikan sengketa. |
| NFR-OPS-04 | Panduan operasional admin (isi kertas/tinta, ganti printer, mesin macet). |

### 11.8 Lingkungan Fisik dan Perangkat Keras (NFR-HW)
| ID | Kebutuhan |
|---|---|
| NFR-HW-01 | Mesin di **dalam ruangan berpenjaga**, terlindung dari hujan, debu, panas berlebih. |
| NFR-HW-02 | Catu daya stabil; disarankan UPS kecil. |
| NFR-HW-03 | Internet stabil; disarankan LAN kabel dengan tethering sebagai cadangan. |
| NFR-HW-04 | Printer via USB dengan driver teruji pada OS terpilih (rencana awal Windows; final setelah printer diuji). |
| NFR-HW-05 | Admin mudah mengisi kertas/tinta; pengguna hanya menjangkau layar dan nampan keluaran. |
| NFR-HW-06 | Mini PC: RAM minimal 8 GB, SSD, font umum terpasang (Times New Roman, Arial, Calibri; cek lisensi). |

### 11.9 Batasan Teknis
- **Konversi DOCX/PPTX** tidak dapat berjalan di Vercel (serverless). Karena belum ada VPS, konversi dijalankan agent di mini PC memakai LibreOffice. Satu konversi pada satu waktu; bergantung pada mini PC yang online.
- **Cadangan konversi:** API konversi pihak ketiga (CloudConvert, ConvertAPI, dll; cek biaya). Bila dipakai, dokumen user keluar ke pihak ketiga dan kebijakan privasi harus menyebutnya.
- **PDF akhir** dibuat agent (bukan Vercel) karena batas durasi/memori fungsi serverless; preview tetap dirender di browser.
- **Fidelitas konversi** dapat berbeda dari tampilan di Word; preview dan peringatan wajib.
- **Status fisik printer** tidak selalu terdeteksi (macet/kosong); jalur "Laporkan masalah" tetap diperlukan.
- **Biaya QRIS** per transaksi perlu dihitung dalam harga, terutama order kecil.

---

## 12. Arsitektur Sistem Tingkat Tinggi

### 12.1 Komponen

```
 HP user (browser)                    Layar sentuh kiosk (Chrome mode kiosk)
   |  upload, opsi, bayar, status        |  QR dinamis, status mesin, progres cetak
   +--------------+----------------------+
                  v
        Web app + API (Next.js)  ---------->  DOKU (QRIS dinamis)
          |      ^   ^                              |
          |      |   +---- webhook pembayaran <-----+
          v      |
   Supabase: Postgres + Storage (privat) + Realtime + Auth (admin)
          ^
          |  polling/realtime, koneksi keluar saja, token per mesin
   Print Agent (Node.js di mini PC) --> LibreOffice (konversi) --> Printer inkjet (USB)
          |
          +-- heartbeat, status job, estimasi kertas/tinta

   Dashboard admin (Next.js, login) --> alert Telegram (email cadangan)
```

| Komponen | Tugas |
|---|---|
| Web app user | Upload, atur opsi, preview (di browser), hitung biaya, tampil QRIS, status real-time |
| Layar kiosk | `/kiosk/{machineId}`: QR sesi, status mesin, progres cetak; tanpa fungsi upload |
| API/server | Validasi, harga (sumber kebenaran), kunci mesin, buat QRIS, terima webhook, endpoint untuk agent |
| Database dan Storage | Data order dan mesin; file privat dengan URL bertanda tangan |
| Print agent | Ambil job, konversi DOCX/PPTX, bangun PDF akhir, cetak, lapor status, hapus file lokal |
| Dashboard admin | Harga, status mesin, transaksi, refund, laporan |
| Penjadwal (cron) | Kedaluwarsa order, hapus file, rekonsiliasi pembayaran, deteksi mesin offline, alert |

### 12.2 Alur sesi QR dinamis
1. Layar kiosk menampilkan QR berisi URL + token sesi acak terikat mesin, diganti tiap 60 detik (toleransi 30 detik untuk token sebelumnya).
2. User scan; server menukar token menjadi sesi order HP (15 menit). Layar kiosk menampilkan "HP terhubung".
3. Saat "Bayar" ditekan, mesin dikunci atomik, QR pembayaran muncul di HP, layar kiosk menampilkan "Menunggu pembayaran, 5:00".
4. Setelah bayar, layar kiosk menampilkan progres cetak dan "Ambil dokumen di nampan".

Alasan tidak statis: QR statis di layar dapat difoto/di-screenshot dan dipakai dari jauh untuk membuat order lalu mengunci mesin 5 menit berulang kali tanpa membayar. Alternatif lebih sederhana (QR statis + kode 4 digit tiap order) lebih aman dari statis tetapi menambah langkah.

### 12.3 Alur data order
1. HP mengunggah file langsung ke Storage (URL bertanda tangan). File dicek (tipe, ukuran). DOCX/PPTX dikonversi agent, lalu jumlah halaman dibaca.
2. Opsi cetak dikirim ke API; server menghitung harga dan jumlah sisi fisik.
3. "Bayar": server mengunci mesin dan harga, membuat QRIS di DOKU, menyimpan referensi pembayaran.
4. Webhook DOKU: verifikasi signature, cocokkan nominal dan ID order, status `LUNAS` secara idempoten.
5. Server membuat `print_job`; agent membangun PDF akhir, mencetak, dan melapor.
6. Status mengalir ke HP dan layar lewat Realtime.
7. Setelah selesai: file dihapus, kunci dilepas, struk tersedia.

### 12.4 Garis besar database
| Tabel | Isi utama |
|---|---|
| `machines` | id, nama, lokasi, status, kemampuan, `active_order_id` (kunci), `last_heartbeat`, hash token agent |
| `machine_settings` | harga 4 kombinasi, selisih bolak-balik, opsi aktif, batas salinan, ambang kertas/tinta, nominal minimum |
| `sessions` | id, machine_id, hash token, kedaluwarsa |
| `orders` | id, kode transaksi, machine_id, session_id, status, total, snapshot harga, waktu per tahap |
| `order_files` | order_id, path storage, nama asli, jumlah halaman, opsi cetak, sisi fisik, harga |
| `payments` | order_id, referensi DOKU (unik), nominal, status, signature terverifikasi, payload webhook (tanpa data sensitif), waktu |
| `print_jobs` | order_id, path PDF akhir, status, percobaan ke-n, error, waktu mulai/selesai |
| `refunds` | order_id, status, nama dan tujuan transfer, catatan/bukti admin, tanggal hapus (6 bulan) |
| `order_events` | jejak peristiwa order |
| `admins` / `audit_log` | akun admin, aksi sensitif |
| `alerts` | jenis, mesin, status terkirim |

Catatan: `machines.active_order_id` diubah lewat pembaruan bersyarat ("hanya jika masih kosong") agar dua user tidak mengunci bersamaan; `payments` punya batasan unik pada referensi DOKU untuk idempotensi.

### 12.5 Integrasi DOKU
- Dipakai: QRIS dinamis, webhook pembayaran, API cek status (rekonsiliasi).
- Keamanan: signature webhook diverifikasi dengan kunci rahasia di server. Format signature mengikuti dokumentasi DOKU (cek versi, misalnya apakah memakai standar SNAP QRIS), karena detail API dapat berubah.
- Batas waktu 5 menit diatur saat membuat QRIS; pembayaran telat masuk antrean refund manual.
- Pastikan dengan DOKU saat pengajuan QRIS: dukungan webhook, biaya per transaksi (MDR), jadwal pencairan, dan ada tidaknya API refund.
- Pengembangan memakai sandbox selagi pengajuan diproses.

### 12.6 Print Agent
- Node.js, berjalan sebagai service yang otomatis hidup saat boot.
- Memeriksa job baru (polling beberapa detik atau Realtime), mengunduh file, mengonversi DOCX/PPTX, membangun PDF akhir, mencetak, melapor.
- Autentikasi token per mesin lewat endpoint khusus agent, bukan kunci database penuh; token dapat dicabut dari dashboard.
- Rencana awal OS Windows (driver Epson/Canon paling lengkap untuk duplex, hitam-putih, status tinta); agent memanggil utilitas cetak PDF baris-perintah dengan opsi. Alternatif Linux (CUPS) lebih ringan tetapi dukungan inkjet konsumen sering kurang. Keputusan final setelah pengujian pada printer yang dibeli.
- Status job disimpan lokal agar tidak mencetak dua kali setelah restart.

### 12.7 Hosting tahap awal
- **Next.js:** rencana awal Vercel. Setahu saya paket gratis (Hobby) dibatasi untuk non-komersial; **verifikasi ketentuan terbaru** atau siapkan paket berbayar/alternatif (Cloudflare Pages/Workers, Netlify, yang syaratnya juga perlu dicek).
- **Supabase gratis:** proyek bisa dijeda saat tidak aktif lama dan kuotanya terbatas; untuk layanan yang harus hidup terus, paket berbayar kecil lebih aman.
- **Penjadwal:** `pg_cron` Supabase atau cron hosting.
- Logika bisnis dipisah dari SDK penyedia (NFR-SCL-03) agar pindah hosting tidak memerlukan penulisan ulang.

---

## 13. Metrik Keberhasilan

| Metrik | Cara ukur | Target awal |
|---|---|---|
| Keberhasilan cetak | `SELESAI` / `LUNAS` | >= 97% |
| Gagal cetak berakhir refund | `DIREFUND` / `LUNAS` | < 3% |
| Waktu scan sampai kertas keluar | Selisih waktu event order | Median < 2 menit (tanpa konversi), < 3 menit (DOCX/PPTX) |
| Konversi order | `LUNAS` / sesi dimulai | >= 50% |
| Order kedaluwarsa | `KEDALUWARSA` / `MENUNGGU_BAYAR` | < 20% |
| Waktu penyelesaian refund | `MENUNGGU_REFUND` ke `DIREFUND` | < 24 jam |
| Ketersediaan mesin | Waktu Tersedia / jam operasional | >= 95% |
| Margin per halaman | Harga jual - (tinta, kertas, perawatan, biaya QRIS) | Positif; target setelah hitung biaya |
| Pengguna berulang | Perangkat kembali dalam 30 hari (perkiraan) | Dipantau |

Indikator utama pilot: cetak berhasil dan user tidak butuh bantuan admin.

## 14. Risiko dan Mitigasi

| # | Risiko | Mitigasi |
|---|---|---|
| R1 | Pengajuan QRIS DOKU lama/ditolak | Ajukan lebih awal, kembangkan di sandbox, siapkan alternatif (Midtrans/Xendit) |
| R2 | Head inkjet tersumbat | Printer ink tank, nozzle check/cleaning terjadwal, alert admin |
| R3 | Kertas macet/keluar kosong tak terdeteksi | Tombol "Laporkan masalah", jejak event, refund manual |
| R4 | Hasil konversi DOCX/PPTX berbeda | Preview wajib + peringatan, font umum, anjurkan PDF |
| R5 | Mini PC lemah/mati (kini juga worker konversi) | RAM 8 GB + SSD, UPS, auto-start, cadangan API konversi pihak ketiga |
| R6 | Internet lokasi putus | Mesin otomatis Tidak tersedia, LAN kabel + tethering cadangan |
| R7 | File berbahaya diunggah (kini diproses di mini PC) | Validasi isi, antivirus, konversi terisolasi, akun OS minimal, tanpa data sensitif lain di mini PC |
| R8 | Penyalahgunaan (mengunci mesin berulang) | QR dinamis, rate limit, batas bayar 5 menit, admin dapat lepas kunci |
| R9 | Pembayaran tidak cocok/webhook ganda | Verifikasi signature, idempotensi, rekonsiliasi |
| R10 | Dokumen diambil orang lain | Lokasi berpenjaga, satu order pada satu waktu, PIN rilis cetak di fase berikutnya |
| R11 | Biaya operasional di atas pendapatan | Hitung biaya per halaman, pantau margin bulanan |
| R12 | Batas/ketentuan komersial Vercel/Supabase | Verifikasi sebelum peluncuran, anggaran paket berbayar kecil, arsitektur tidak terikat hosting |
| R13 | Hukum dan kepatuhan (data pribadi, izin usaha) | Kebijakan privasi, tinjauan pihak yang paham hukum, urus izin usaha |
| R14 | Konflik hak cipta | Syarat penggunaan menegaskan tanggung jawab user |
| R15 | Mini PC/printer dirusak/dicuri | Lokasi berpenjaga, bodi kiosk terkunci, hanya layar dan nampan terjangkau |

## 15. Roadmap Pengembangan

Urutan fase saja; durasi ditentukan sesuai waktu luang.

**Fase 0: Persiapan (paralel)**
- Ajukan QRIS DOKU; pastikan webhook dan biaya transaksi
- Pilih dan beli printer (ink tank, auto-duplex, USB), mini PC (RAM 8 GB, SSD), layar sentuh
- Hitung biaya per halaman dan tentukan harga awal
- Siapkan lokasi pilot berpenjaga, internet, listrik/UPS
- Verifikasi ketentuan komersial Vercel/Supabase

**Fase 1: Inti sistem**
- Skema database, sesi QR dinamis, kunci mesin
- Upload PDF/JPG/PNG, preview di browser, opsi cetak, harga di server
- Integrasi DOKU sandbox, webhook, idempotensi
- Print agent dasar: ambil job, cetak, lapor status
- Layar kiosk: QR, status, progres

**Fase 2: Lengkapi MVP**
- Konversi DOCX/PPTX di mini PC; PDF akhir oleh agent (rentang halaman, N-up)
- Penanganan gagal cetak: retry, form dan alur refund manual
- Dashboard admin: harga, transaksi, laporan, status mesin
- Alert Telegram, heartbeat, estimasi kertas/tinta, nozzle check
- Struk digital, kebijakan privasi dan syarat penggunaan

**Fase 3: Pengujian dan pilot**
- Uji printer asli: duplex, hitam-putih murni, N-up, file besar, mati listrik, internet putus, konversi DOCX dengan berbagai font
- Uji keamanan dasar (webhook palsu, tebak kode, file berbahaya)
- Pilot terbatas dengan pengguna dikenal; pantau metrik bagian 13
- Pembayaran live setelah QRIS aktif

**Fase 4: Evaluasi dan perluasan**
- Perbaiki berdasarkan data pilot; sesuaikan harga dan target
- Mesin ke-2 dan dashboard multi-mesin
- F4/A3, voucher, PIN rilis cetak, refund otomatis bila API mendukung, bahasa Inggris, pindah ke hosting sendiri

## 16. Pertanyaan Terbuka

1. Model dan harga printer serta mini PC (menentukan driver, duplex, dan cara cetak agent)
2. Status paket Vercel/Supabase untuk penggunaan komersial dan biayanya
3. Biaya per transaksi QRIS DOKU dan jadwal pencairan dana
4. Harga jual per halaman dan besar diskon bolak-balik
5. Nama produk
6. Izin usaha dan tinjauan hukum untuk kebijakan privasi
7. Apakah DOKU menyediakan API refund (untuk otomatisasi nanti)
8. Kecukupan mini PC untuk konversi DOCX/PPTX; kapan beralih ke API konversi pihak ketiga atau VPS
9. Pembuatan bot Telegram dan grup admin

---

## Lampiran A: Draft Kebijakan Privasi (ringkas)

> **Draft, perlu ditinjau pihak yang paham hukum sebelum diterbitkan.** Isi dalam kurung siku diisi oleh pengelola.

**Data yang kami proses.** Dokumen yang kamu unggah untuk dicetak, pengaturan cetak, dan data transaksi (kode transaksi, waktu, nominal, status). Kami tidak meminta akun, nomor HP, atau email. Jika terjadi kegagalan cetak dan kamu meminta pengembalian dana, kami meminta nama dan tujuan transfer (rekening/e-wallet).

**Tujuan.** Mencetak dokumenmu, memproses pembayaran, menangani masalah dan pengembalian dana, serta menjaga keamanan layanan.

**Pembayaran.** Pembayaran QRIS diproses oleh [DOKU]. Kami tidak menyimpan data rekening atau e-wallet pembayarmu dari proses ini.

**Penyimpanan dan penghapusan.** Dokumenmu dihapus otomatis segera setelah pencetakan selesai, atau paling lambat 1 jam jika pembayaran tidak dilakukan. Jika cetak gagal dan menunggu pengembalian dana, dokumen dihapus segera setelah keputusan atau paling lambat 24 jam. Data pengembalian dana dihapus atau dianonimkan setelah 6 bulan. Data transaksi disimpan sesuai kebutuhan pembukuan [sebutkan jangka waktu].

**Akses.** Pengelola tidak membuka isi dokumenmu. Pengelola hanya melihat nama file, jumlah halaman, dan pengaturan cetak.

**Pihak ketiga.** Kami memakai penyedia infrastruktur [hosting, penyimpanan] dan pembayaran untuk menjalankan layanan. [Jika memakai layanan konversi pihak ketiga, sebutkan di sini.]

**Hak kamu.** Kamu dapat meminta informasi atau penghapusan data transaksi/refund yang terkait denganmu lewat [kontak].

**Kontak.** [Nama pengelola, email/WhatsApp].

## Lampiran B: Draft Syarat Penggunaan (ringkas)

1. **Penggunaan.** Layanan untuk mencetak dokumen milikmu atau yang kamu berhak cetak. Kamu bertanggung jawab atas isi dokumen dan tidak boleh mencetak materi yang melanggar hukum atau hak cipta.
2. **Harga dan pembayaran.** Harga yang ditampilkan sebelum pembayaran adalah harga final order. Pembayaran lewat QRIS dalam batas waktu 5 menit. Setelah pembayaran berhasil, order tidak dapat dibatalkan.
3. **Hasil cetak.** Hasil konversi DOCX/PPTX dapat berbeda dari tampilan aslinya. Periksa preview sebelum membayar. Untuk hasil paling akurat, unggah PDF. Warna cetak dapat berbeda dari layar.
4. **Kegagalan cetak.** Jika cetak gagal karena gangguan mesin, kami mencoba mencetak ulang. Jika tetap gagal, kamu berhak atas pengembalian dana penuh (atau proporsional jika sebagian tercetak) melalui transfer manual dalam [24 jam kerja]. Laporkan masalah lewat tombol "Laporkan masalah" dengan menyertakan kode transaksi.
5. **Dokumen di mesin.** Ambil hasil cetak segera. Kami tidak bertanggung jawab atas dokumen yang diambil orang lain setelah tercetak.
6. **Batas tanggung jawab.** Tanggung jawab kami terbatas pada nilai order yang bersangkutan.
7. **Perubahan.** Syarat ini dapat diperbarui, dan versi terbaru berlaku saat kamu memakai layanan.

---

## Lampiran C: Ringkasan Keputusan

| Topik | Keputusan |
|---|---|
| Printer | Inkjet ink tank, warna + hitam-putih, auto-duplex, USB; mini PC |
| Skala awal | Pilot 1 mesin; mesin ke-2 menyusul |
| Ukuran kertas | A4 dulu; F4/A3 menyusul |
| Format file | PDF, DOCX, PPTX, JPG, PNG; maks 50 MB/file; halaman tanpa batas |
| Login | Tanpa login untuk user; login hanya admin |
| Pembayaran | QRIS dinamis DOKU, batas bayar 5 menit; pengajuan QRIS belum diproses |
| Mesin sibuk | Diblokir (tanpa antrean); mesin dikunci saat "Bayar" ditekan |
| Kegagalan | Cetak ulang otomatis (2x) lalu refund manual |
| Harga bolak-balik | Per sisi, sedikit lebih murah |
| Batas salinan | 50 rangkap per file |
| N-up dan struk | Masuk MVP |
| Retensi refund | 6 bulan |
| Pembatalan | Hanya sebelum bayar |
| 2FA admin | Direkomendasikan, tidak wajib |
| QR | Dinamis di layar sentuh kiosk (rotasi 60 detik, toleransi 30 detik, sesi HP 15 menit) |
| Lokasi | Dalam ruangan berpenjaga |
| Konversi dokumen | Di mini PC (LibreOffice); PDF akhir dibuat agent |
| OS mini PC | Windows (final setelah uji printer) |
| Hosting awal | Vercel + Supabase (verifikasi lisensi komersial) |
| Alert admin | Telegram, email sebagai cadangan |
| Nama produk | Placeholder "KioskCetak" |
| Kebijakan privasi/syarat | Draft di lampiran A dan B, ditinjau sebelum terbit |
