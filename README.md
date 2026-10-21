# KioskCetak

Sistem kiosk cetak mandiri sesuai [kioskcetak-prd.md](kioskcetak-prd.md): scan QR di layar kiosk → upload dari HP → bayar QRIS → tercetak otomatis.

```
apps/web        Next.js: web app user (/order), layar kiosk (/kiosk/<id>), dashboard admin (/admin), semua API
apps/agent      Print agent Node.js untuk mini PC (konversi LibreOffice, PDF akhir, cetak, heartbeat)
packages/shared Logika bersama: harga, rentang halaman, N-up (diuji)
supabase/       Skema Postgres + fungsi atomik (kunci mesin, konfirmasi pembayaran idempoten)
```

## Setup

### 1. Supabase
1. Buat proyek Supabase. Jalankan isi [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) di SQL Editor (sekaligus membuat bucket privat `documents`).
2. Authentication → Users → buat user admin (email + password), lalu daftarkan sebagai admin:
   ```sql
   insert into admins(email) values ('email-admin@contoh.com');
   ```
   2FA: aktifkan lewat fitur MFA Supabase bila ingin (direkomendasikan; belum dipaksa oleh aplikasi).

### 2. Web
```bash
npm install
cp .env.example apps/web/.env.local   # isi URL/key Supabase, APP_URL, CRON_SECRET
npm run dev                            # http://localhost:3000
```
Buka `/admin`, login, lalu **Ringkasan → Tambah mesin**. Token agent tampil sekali. Atur harga di tab **Pengaturan** (default Rp 500/400/1500/1300 per sisi, hanya contoh; hitung dulu biaya per halaman Anda).

URL layar kiosk ada di Ringkasan → "Layar kiosk & agent" (memuat kunci `?k=` agar QR tidak bisa dibuka dari jauh).

### 3. Print agent (di mini PC)
```bash
cd apps/agent
cp .env.example .env     # SERVER_URL, AGENT_TOKEN, PRINTER_NAME, SOFFICE_PATH
npm run start
```
- Pasang LibreOffice (untuk DOCX/PPTX) dan font umum. Tanpa itu, PDF/JPG/PNG tetap jalan.
- `DRY_RUN=1` menyimpan PDF akhir ke `apps/agent/data/dry-run/` tanpa mencetak. Pakai ini untuk menguji seluruh alur tanpa printer.
- Auto-start saat boot (Windows): Task Scheduler → trigger "At startup", aksi `cmd /c cd /d <folder>\apps\agent && npm run start`, centang "Run whether user is logged on or not" dan restart bila gagal. Layar kiosk: Chrome `--kiosk <URL kiosk>` juga lewat startup.

### 4. Pembayaran
- `PAYMENT_PROVIDER=mock` (default): muncul tombol "Simulasi bayar" di halaman bayar. Di produksi, endpoint simulasi mati kecuali `ALLOW_MOCK_PAY=1` (**jangan** aktifkan di live).
- `PAYMENT_PROVIDER=doku`: lihat catatan di bawah.
- Webhook: `POST {APP_URL}/api/webhooks/payment`.

### 5. Pekerjaan terjadwal
Kedaluwarsa order, penghapusan file, rekonsiliasi pembayaran, alert offline/kertas/tinta ada di [apps/web/src/lib/tick.ts](apps/web/src/lib/tick.ts). Dijalankan dari dua jalur: **heartbeat agent** (tiap ~20 dtk, dibatasi 1x/30 dtk, tidak butuh cron hosting) dan endpoint `/api/cron/tick` (header `Authorization: Bearer $CRON_SECRET`) bila ingin penjadwal eksternal. Dashboard menampilkan peringatan jika tick berhenti > 5 menit.

Alert Telegram: isi `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID`. Tanpa itu alert tetap tercatat dan tampil di dashboard.

## Apa yang sudah diuji, dan yang belum

Sudah diverifikasi otomatis:
- `npm test`: harga, rentang halaman, N-up (shared) dan pembangunan PDF akhir, PDF rusak/halaman kosong, sniff isi file (agent): 11 tes lulus.
- Typecheck web + agent bersih, `next build` lolos.
- Migrasi SQL dijalankan di Postgres in-memory: kunci mesin atomik (user kedua ditolak), `confirm_payment` idempoten (duplikat tidak membuat job ganda), nominal tidak cocok, pembayaran terlambat masuk antrean refund.

**Belum diuji** (butuh akun/perangkat nyata):
- Seluruh alur terhadap Supabase asli (Storage signed upload, RLS) dan UI di browser/HP.
- **DOKU**: [doku.ts](apps/web/src/lib/payments/doku.ts) hanyalah kerangka dengan skema signature HMAC DOKU; path endpoint dan bentuk body ditandai `TODO(verify)` dan harus dicocokkan dengan dokumentasi DOKU (SNAP QRIS atau bukan) serta diuji di sandbox sebelum live. Tidak ada uang yang diproses oleh kode ini selama belum diverifikasi.
- Pencetakan ke printer sungguhan (`pdf-to-printer` + SumatraPDF), deteksi status kertas/tinta via Windows (`Win32_Printer`), duplex, hitam-putih murni. Banyak printer USB tidak melaporkan kertas/tinta akurat; tombol "Laporkan masalah" tetap jalur cadangan.
- Konversi DOCX/PPTX via LibreOffice dan fidelitas font.

## Keputusan implementasi yang menyimpang atau menyederhanakan PRD

- **Status real-time** memakai polling 1,5 dtk (bukan Supabase Realtime): memenuhi target < 3 dtk, lebih sederhana, tanpa kebijakan RLS ke klien.
- **Semua akses data lewat server** (service role); tabel di-RLS tanpa policy sehingga anon tidak bisa membaca langsung.
- **QR kiosk** sekali pakai dan dikunci `?k=` pada URL layar; sesi HP 15 menit (diperpanjang saat bayar).
- **Struk** berupa halaman cetak/Simpan sebagai PDF dari browser (belum PNG).
- **Antivirus**: ClamAV opsional lewat `CLAMSCAN_PATH`; belum ada isolasi konversi (sandbox/akun OS terpisah) di mini PC, lihat NFR-SEC-07/10.
- **Nozzle check** otomatis mencetak pola uji saat menganggur; *cleaning* head tidak bisa dipicu lewat API cetak standar dan harus manual/driver.
- **Rate limit** disimpan di memori per instance (cukup untuk pilot 1 mesin).
- Jika agent mati di tengah cetak, job **tidak dicetak ulang otomatis** (hasil tidak pasti); langsung ke antrean refund/cetak ulang admin supaya tidak ada cetak ganda.
- Vercel Hobby: cron per menit tidak tersedia, itulah sebabnya tick dijalankan dari heartbeat agent. Verifikasi lisensi komersial Vercel/Supabase sebelum live (PRD R12).
