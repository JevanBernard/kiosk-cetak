Slot iklan layar kiosk (tampilan idle).

1. Taruh gambar (.jpg/.png/.webp) atau video (.mp4/.webm) di folder ini.
   Ukuran yang pas: rasio 16:9, mis. 1600x900 px (di layar 1080p slot tampil sekitar 1067x606 px). Video diputar tanpa suara.
2. Daftarkan di ads.json, mis.:
   [
     { "src": "/ads/paper-sidu.png", "alt": "Paper Sidu", "seconds": 12 },
     { "src": "/ads/promo.mp4", "alt": "Promo", "seconds": 15 }
   ]
   "seconds" = lama tampil sebelum ganti ke iklan berikutnya (default 10).
3. Daftar kosong ([]) = layar menampilkan "Ruang Sponsor".

Layar kiosk membaca ulang ads.json tiap 2 menit, jadi tidak perlu refresh manual.
Catatan: pada mode produksi (next start), file baru di folder public hanya terbaca setelah
aplikasi di-build/restart ulang.
