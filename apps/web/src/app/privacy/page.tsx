export const metadata = { title: "Kebijakan Privasi - PaperMate" };

export default function Privacy() {
  return (
    <main className="wrap stack">
      <h1>Kebijakan Privasi</h1>
      <div className="banner warn">
        Draft. Wajib ditinjau pihak yang paham hukum dan dilengkapi isian [dalam kurung siku] sebelum dipublikasikan.
      </div>
      <div className="card stack">
        <p><b>Data yang kami proses.</b> Dokumen yang kamu unggah untuk dicetak, pengaturan cetak, dan data transaksi (kode transaksi, waktu, nominal, status). Kami tidak meminta akun, nomor HP, atau email. Jika terjadi kegagalan cetak dan kamu meminta pengembalian dana, kami meminta nama dan tujuan transfer (rekening/e-wallet).</p>
        <p><b>Tujuan.</b> Mencetak dokumenmu, memproses pembayaran, menangani masalah dan pengembalian dana, serta menjaga keamanan layanan.</p>
        <p><b>Pembayaran.</b> Pembayaran QRIS diproses oleh [DOKU]. Kami tidak menyimpan data rekening atau e-wallet pembayarmu dari proses ini.</p>
        <p><b>Penyimpanan dan penghapusan.</b> Dokumenmu dihapus otomatis segera setelah pencetakan selesai, atau paling lambat 1 jam jika pembayaran tidak dilakukan. Jika cetak gagal dan menunggu pengembalian dana, dokumen dihapus segera setelah keputusan atau paling lambat 24 jam. Data pengembalian dana dihapus atau dianonimkan setelah 6 bulan. Data transaksi disimpan sesuai kebutuhan pembukuan [sebutkan jangka waktu].</p>
        <p><b>Akses.</b> Pengelola tidak membuka isi dokumenmu. Pengelola hanya melihat nama file, jumlah halaman, dan pengaturan cetak.</p>
        <p><b>Pihak ketiga.</b> Kami memakai penyedia infrastruktur [hosting, penyimpanan] dan pembayaran untuk menjalankan layanan. [Jika memakai layanan konversi pihak ketiga, sebutkan di sini.]</p>
        <p><b>Hak kamu.</b> Kamu dapat meminta informasi atau penghapusan data transaksi/refund yang terkait denganmu lewat [kontak].</p>
        <p><b>Kontak.</b> [Nama pengelola, email/WhatsApp].</p>
      </div>
      <a href="/">Kembali</a>
    </main>
  );
}
