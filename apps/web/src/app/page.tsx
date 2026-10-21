"use client";
import { useState } from "react";
import { I, MIcon, Shell } from "./mobile/ui";

const STEPS: [string, string][] = [
  ["Scan QR di layar mesin", "Buka kamera HP. Tanpa install aplikasi dan tanpa login."],
  ["Upload dokumen", "PDF, Word, PowerPoint, JPG, atau PNG dari HP kamu."],
  ["Atur opsi cetak di layar mesin", "Pilih warna, sisi kertas, dan salinan; harga langsung terlihat."],
  ["Bayar QRIS, kertas langsung keluar", "Pakai e-wallet atau m-banking apa pun yang berlogo QRIS."],
];

export default function Home() {
  const [code, setCode] = useState("");
  return (
    <Shell tag="Cetak Mandiri">
      <div className="m-hero">
        <h1>Cetak dokumen <em>dari HP-mu</em></h1>
        <p>Scan <b>QR di layar mesin</b> dengan kamera HP. Tidak perlu install aplikasi dan tidak perlu login.</p>
      </div>
      <div className="m-card">
        <ol className="m-flow">
          {STEPS.map(([t, d], i) => (
            <li key={t}><span className="n">{i + 1}</span><div><b>{t}</b><span>{d}</span></div></li>
          ))}
        </ol>
      </div>
      <form
        className="m-card m-stack m-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) window.location.href = `/status/${encodeURIComponent(code.trim().toUpperCase())}`;
        }}
      >
        <div className="m-lab m-row" style={{ justifyContent: "flex-start", gap: ".375rem" }}><MIcon d={I.receipt} size={18} />Sudah punya kode transaksi?</div>
        <input className="m-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Contoh: K7M2QX9TPA" autoCapitalize="characters" />
        <button className="m-btn block" type="submit"><MIcon d={I.search} size={18} />Cek status</button>
      </form>
      <div className="m-links">
        <a href="/privacy">Kebijakan Privasi</a> · <a href="/terms">Syarat Penggunaan</a>
      </div>
    </Shell>
  );
}
