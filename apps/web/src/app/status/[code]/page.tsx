"use client";
import { useCallback, useEffect, useState } from "react";
import { formatRupiah } from "@kioskcetak/shared";
import { ApiError, STATUS_LABEL, api } from "@/lib/client";

type Status = {
  order: { code: string; status: string; total: number; created_at: string; paid_at: string | null; printed_at: string | null };
  files: { name: string; pages: number | null; sides: number | null; price: number | null; options: any }[];
  totals: { subtotal: number; total: number; rounding: number };
  machine: { name: string; location: string | null } | null;
  whatsapp: string | null;
  refund: { status: string; kind: string; amount: number } | null;
  payment: { provider: string; status: string } | null;
};

const FINAL = ["SELESAI", "KEDALUWARSA", "DIBATALKAN", "DIREFUND"];
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");

export default function StatusPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code).toUpperCase();
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dest, setDest] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setS(await api<Status>(`/api/status/${code}`));
      setErr(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Gagal memuat.");
    }
  }, [code]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (!s || !FINAL.includes(s.order.status)) load();
    }, 3000);
    return () => clearInterval(t);
  }, [load, s]);

  async function submitRefund(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/status/${code}`, { method: "POST", json: { name, destination: dest } });
      setMsg("Terima kasih. Admin akan mentransfer dana dan statusnya tampil di halaman ini.");
      await load();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  if (err) {
    return (
      <main className="wrap stack">
        <h1>Status transaksi</h1>
        <div className="banner bad">{err}</div>
        <a href="/">Kembali</a>
      </main>
    );
  }
  if (!s) return <main className="wrap"><p className="muted">Memuat...</p></main>;

  const st = s.order.status;
  const wa = s.whatsapp ? `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(`Halo, saya mau lapor masalah cetak. Kode transaksi: ${s.order.code}`)}` : null;
  const paid = s.order.paid_at !== null;

  return (
    <main className="wrap stack">
      <div className="hide-print"><a href="/">KioskCetak</a></div>
      <div className="card receipt stack">
        <div className="row between">
          <h1 style={{ margin: 0 }}>{paid ? "Struk" : "Status"}</h1>
          <span className={`pill ${st === "SELESAI" || st === "DIREFUND" ? "ok" : ["MENUNGGU_REFUND", "GAGAL_CETAK"].includes(st) ? "bad" : "warn"}`}>{STATUS_LABEL[st] ?? st}</span>
        </div>
        <div className="muted">Kode transaksi</div>
        <div className="big">{s.order.code}</div>
        <div className="muted">
          {s.machine?.name}{s.machine?.location ? ` · ${s.machine.location}` : ""}<br />
          Dibuat: {fmt(s.order.created_at)}<br />
          {paid && <>Dibayar: {fmt(s.order.paid_at)} ({s.payment?.provider === "mock" ? "simulasi" : "QRIS"})<br /></>}
          {s.order.printed_at && <>Tercetak: {fmt(s.order.printed_at)}</>}
        </div>
        <table>
          <thead><tr><th>File</th><th>Sisi</th><th style={{ textAlign: "right" }}>Harga</th></tr></thead>
          <tbody>
            {s.files.map((f, i) => (
              <tr key={i}>
                <td>{f.name}<div className="muted">{f.pages ?? "?"} hal · {f.options?.color ? "warna" : "hitam-putih"} · {f.options?.duplex ? "bolak-balik" : "1 sisi"} · ×{f.options?.copies ?? 1}</div></td>
                <td>{f.sides ?? "-"}</td>
                <td style={{ textAlign: "right" }} className="price">{f.price !== null ? formatRupiah(f.price) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.totals.rounding > 0 && <div className="row between muted"><span>Pembulatan</span><span>{formatRupiah(s.totals.rounding)}</span></div>}
        <div className="row between"><b>Total</b><b className="price">{formatRupiah(s.order.total || s.totals.total)}</b></div>
        <div className="muted">Isi dokumen tidak disimpan dan tidak ditampilkan di sini.</div>
      </div>

      {st === "SELESAI" && <div className="banner ok">Dokumen sudah tercetak. Ambil di nampan mesin.</div>}
      {["LUNAS", "MENCETAK", "CETAK_ULANG"].includes(st) && <div className="banner">Sedang diproses. Halaman ini diperbarui otomatis.</div>}
      {st === "MENUNGGU_BAYAR" && <div className="banner warn">Menunggu pembayaran. Scan QRIS yang tampil di layar mesin dengan aplikasi e-wallet atau m-banking.</div>}

      {(st === "MENUNGGU_REFUND" || s.refund) && s.refund && (
        <div className="card stack hide-print">
          <h2>Pengembalian dana</h2>
          {s.refund.status === "needs_info" && (
            <form className="stack" onSubmit={submitRefund}>
              <p>Maaf atas kendalanya. Isi data berikut agar admin bisa mentransfer {formatRupiah(s.refund.amount)}. Data hanya dipakai untuk refund dan dihapus setelah 6 bulan.</p>
              <div className="field"><label>Nama pemilik rekening/e-wallet</label><input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></div>
              <div className="field"><label>Tujuan transfer (contoh: DANA 0812xxxx / BCA 1234xxxx)</label><input value={dest} onChange={(e) => setDest(e.target.value)} required minLength={5} /></div>
              <button className="primary block" type="submit">Kirim</button>
            </form>
          )}
          {s.refund.status === "pending" && <div className="banner">Data diterima. Admin akan mentransfer {formatRupiah(s.refund.amount)} (target &lt; 24 jam).</div>}
          {s.refund.status === "done" && <div className="banner ok">Dana {formatRupiah(s.refund.amount)} sudah ditransfer{s.refund.kind === "partial" ? " (refund sebagian)" : ""}.</div>}
          {s.refund.status === "cancelled" && <div className="banner ok">Dokumenmu dicetak ulang oleh admin.</div>}
          {msg && <div className="muted">{msg}</div>}
        </div>
      )}

      <div className="row hide-print">
        {paid && <button onClick={() => window.print()}>Unduh nota (PDF)</button>}
        {wa && <a className="btn" href={wa} target="_blank" rel="noreferrer">Laporkan masalah</a>}
      </div>
    </main>
  );
}
