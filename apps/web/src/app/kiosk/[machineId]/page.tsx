"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { formatRupiah } from "@kioskcetak/shared";
import { fmtTime } from "@/lib/client";

type KioskState = {
  name: string;
  availability: { state: "available" | "busy" | "unavailable"; reason: string | null };
  qrUrl: string | null;
  phoneConnected: boolean;
  order: { status: string; payExpiresAt: string | null; total: number } | null;
  progress: { status: string; attempt: number } | null;
  finished: { code: string } | null;
  prices: { bw: number; bwDuplex: number; color: number; colorDuplex: number };
};

/** Layar sentuh kiosk. Tidak ada fungsi upload: semua input lewat HP pengguna (FR-KSK-03). */
export default function KioskPage({ params }: { params: { machineId: string } }) {
  const [s, setS] = useState<KioskState | null>(null);
  const [qrImg, setQrImg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("k") ?? "";
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/kiosk/${params.machineId}?k=${encodeURIComponent(key)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (!stop) {
          setS(json);
          setErr(null);
        }
      } catch (e: any) {
        if (!stop) setErr(e.message || "Tidak terhubung ke server");
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [params.machineId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (s?.qrUrl) QRCode.toDataURL(s.qrUrl, { margin: 1, width: 720, errorCorrectionLevel: "M" }).then(setQrImg);
    else setQrImg("");
  }, [s?.qrUrl]);

  // Cegah menu konteks / seleksi di layar kiosk
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);

  if (err && !s) return <div className="kiosk"><h1>Layar belum dapat dipakai</h1><p className="muted">{err}</p></div>;
  if (!s) return <div className="kiosk"><h1>Memuat...</h1></div>;

  const st = s.order?.status;
  const left = s.order?.payExpiresAt ? (new Date(s.order.payExpiresAt).getTime() - now) / 1000 : 0;

  let body: React.ReactNode;
  if (st === "MENUNGGU_BAYAR") {
    body = (
      <>
        <h1>Menunggu pembayaran</h1>
        <div className="huge">{fmtTime(left)}</div>
        <p>Selesaikan pembayaran QRIS di HP kamu. Total {formatRupiah(s.order!.total)}</p>
      </>
    );
  } else if (st && ["LUNAS", "MENCETAK", "CETAK_ULANG"].includes(st)) {
    body = (
      <>
        <h1>{st === "LUNAS" ? "Pembayaran diterima" : st === "CETAK_ULANG" ? "Mencoba mencetak ulang..." : "Sedang mencetak..."}</h1>
        <p>Mohon tunggu, kertas akan keluar di nampan.</p>
      </>
    );
  } else if (s.finished) {
    body = (
      <>
        <h1>Selesai! Ambil dokumen di nampan</h1>
        <p>Kode transaksi</p>
        <div className="huge" style={{ fontSize: "clamp(2rem,8vw,5rem)" }}>{s.finished.code}</div>
      </>
    );
  } else if (s.availability.state === "unavailable") {
    body = (
      <>
        <h1>Mesin belum bisa dipakai</h1>
        <p style={{ fontSize: "1.4rem" }}>{s.availability.reason}</p>
        <p className="muted">Mohon maaf. Silakan coba lagi nanti.</p>
      </>
    );
  } else if (s.availability.state === "busy") {
    body = (
      <>
        <h1>Mesin sedang dipakai</h1>
        <p>Tunggu sebentar, layar akan kembali otomatis.</p>
      </>
    );
  } else {
    body = (
      <>
        <h1>Cetak dokumen dari HP-mu</h1>
        {s.phoneConnected ? (
          <div className="banner ok" style={{ fontSize: "1.6rem" }}>HP terhubung. Lanjutkan di HP kamu.</div>
        ) : null}
        {qrImg ? <img className="qr" src={qrImg} alt="Scan untuk mulai" /> : <p className="muted">Menyiapkan QR...</p>}
        <div className="steps">
          <span>1. Scan QR</span>
          <span>2. Upload dokumen</span>
          <span>3. Bayar QRIS</span>
          <span>4. Ambil hasil</span>
        </div>
        <p className="muted">
          Hitam-putih {formatRupiah(s.prices.bw)}/sisi · Warna {formatRupiah(s.prices.color)}/sisi · Bolak-balik lebih hemat
          <br />
          Hasil konversi Word/PowerPoint bisa sedikit berbeda. Untuk hasil paling akurat, upload PDF.
        </p>
      </>
    );
  }

  return (
    <div className="kiosk">
      {body}
      {err && <div className="muted">Koneksi bermasalah, mencoba lagi...</div>}
    </div>
  );
}
