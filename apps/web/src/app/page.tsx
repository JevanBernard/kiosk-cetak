"use client";
import { useState } from "react";

export default function Home() {
  const [code, setCode] = useState("");
  return (
    <main className="wrap stack">
      <h1>KioskCetak</h1>
      <div className="card stack">
        <h2>Mau cetak dokumen?</h2>
        <p>
          Scan <b>QR di layar mesin</b> dengan kamera HP. Tidak perlu install aplikasi dan tidak perlu login.
        </p>
        <ol>
          <li>Scan QR di layar mesin</li>
          <li>Upload dokumen (PDF, Word, PowerPoint, JPG, PNG)</li>
          <li>Atur opsi cetak dan cek biaya</li>
          <li>Bayar QRIS, kertas langsung keluar</li>
        </ol>
      </div>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) window.location.href = `/status/${encodeURIComponent(code.trim().toUpperCase())}`;
        }}
      >
        <h2>Sudah punya kode transaksi?</h2>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Contoh: K7M2QX9TPA" autoCapitalize="characters" />
        <button className="primary block" type="submit">Cek status</button>
      </form>
      <p className="muted">
        <a href="/privacy">Kebijakan Privasi</a> · <a href="/terms">Syarat Penggunaan</a>
      </p>
    </main>
  );
}
