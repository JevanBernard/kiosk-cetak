"use client";
import { useCallback, useEffect, useState } from "react";
import { formatRupiah } from "@kioskcetak/shared";
import { ApiError, STATUS_LABEL, api } from "@/lib/client";
import { I, MIcon, Shell, Stepper, useToast } from "../../mobile/ui";
import { Brand } from "../../brand";
import { renderReceiptPng } from "@/lib/receipt-canvas";

type Status = {
  order: { code: string; status: string; total: number; created_at: string; paid_at: string | null; printed_at: string | null };
  files: { name: string; pages: number | null; sides: number | null; price: number | null; options: any }[];
  totals: { subtotal: number; total: number; rounding: number };
  machine: { name: string; code?: string | null; location: string | null } | null;
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
  const [toast, showToast] = useToast();

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

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      showToast("Kode transaksi disalin!");
    } catch {
      showToast(`Kode transaksi: ${code}`);
    }
  }

  const paidNow = s?.order.paid_at != null;
  const imgKey = s ? [s.order.status, s.order.total, s.order.printed_at, s.files.length].join("|") : "";
  const [img, setImg] = useState<File | null>(null);

  // Gambar struk digambar di browser dari data yang sudah dimuat (tanpa server).
  const buildImage = useCallback(async () => {
    if (!s) return null;
    const fam = getComputedStyle(document.querySelector(".m-root") ?? document.body).fontFamily;
    const kiosk = s.machine ? `${s.machine.code ? `#${s.machine.code} ` : ""}${s.machine.name}${s.machine.location ? ` (${s.machine.location})` : ""}` : "-";
    const meta: [string, string][] = [["Kiosk", kiosk], ["Dibuat", fmt(s.order.created_at)]];
    if (s.order.paid_at) meta.push(["Dibayar", `${fmt(s.order.paid_at)} (${s.payment?.provider === "mock" ? "simulasi" : "QRIS"})`]);
    if (s.order.printed_at) meta.push(["Tercetak", fmt(s.order.printed_at)]);
    const blob = await renderReceiptPng({
      code: s.order.code,
      paid: s.order.paid_at !== null,
      statusLabel: STATUS_LABEL[s.order.status] ?? s.order.status,
      meta,
      files: s.files.filter((f) => f.price !== null).map((f) => ({
        name: f.name,
        detail: `${f.pages ?? "?"} hal · ${f.sides ?? "-"} sisi · ${f.options?.color ? "warna" : "hitam-putih"} · ${f.options?.duplex ? "bolak-balik" : "1 sisi"} · ×${f.options?.copies ?? 1}`,
        price: formatRupiah(f.price as number),
      })),
      rounding: s.totals.rounding > 0 ? formatRupiah(s.totals.rounding) : null,
      totalLabel: s.order.paid_at ? "Total Terbayar" : "Total Tagihan",
      total: formatRupiah(s.order.total || s.totals.total),
      family: fam,
    });
    return new File([blob], `struk-papermate-${s.order.code}.png`, { type: "image/png" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgKey]);

  // Siapkan lebih dulu agar tombol Bagikan langsung membuka menu bagikan (butuh gestur pengguna yang masih segar).
  useEffect(() => {
    if (!paidNow) return;
    let dead = false;
    buildImage().then((f) => { if (f && !dead) setImg(f); }).catch(() => {});
    return () => { dead = true; };
  }, [paidNow, buildImage]);

  async function getImage() {
    if (img) return img;
    try {
      return await buildImage();
    } catch {
      return null;
    }
  }

  async function saveImage() {
    const f = await getImage();
    if (!f) return showToast("Gambar struk belum bisa dibuat. Coba lagi.");
    const url = URL.createObjectURL(f);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast("Gambar struk disimpan.");
  }

  async function share() {
    const title = `Struk PaperMate ${code}`;
    const text = `${title}${s ? ` · ${formatRupiah(s.order.total || s.totals.total)}` : ""}`;
    const url = window.location.href;
    const file = await getImage();
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title, text: `${text}
${url}`, files: [file] });
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }
    if (navigator.share) {
      await navigator.share({ title, text, url }).catch(() => {});
    } else {
      try {
        await navigator.clipboard.writeText(url);
        showToast("Tautan struk disalin!");
      } catch {
        showToast("Salin tautan dari bilah alamat.");
      }
    }
  }

  if (err) {
    return (
      <Shell tag="Status">
        <div className="m-card m-live bad">
          <div className="m-live-in">
            <div className="ic"><MIcon d={I.alert} size={22} /></div>
            <div><div className="k">Tidak ditemukan</div><h2>Status transaksi</h2><p>{err}</p></div>
          </div>
        </div>
        <a className="m-btn soft block" href="/">Kembali</a>
      </Shell>
    );
  }
  if (!s) {
    return (
      <Shell tag="Status">
        <div className="m-card m-stack m-center" style={{ padding: "2rem" }}><span className="m-spin" /><p className="m-sm">Memuat...</p></div>
      </Shell>
    );
  }

  const st = s.order.status;
  const paid = s.order.paid_at !== null;
  const wa = s.whatsapp ? `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(`Halo, saya mau lapor masalah cetak. Kode transaksi: ${s.order.code}`)}` : null;
  const step = st === "SELESAI" ? 5 : ["LUNAS", "MENCETAK", "CETAK_ULANG", "MENUNGGU_REFUND", "GAGAL_CETAK"].includes(st) ? 4 : st === "MENUNGGU_BAYAR" ? 3 : FINAL.includes(st) ? 1 : 2;
  const bad = ["MENUNGGU_REFUND", "GAGAL_CETAK"].includes(st);
  const machine = s.machine ? { name: s.machine.name, code: s.machine.code ?? null, location: s.machine.location } : null;
  const live = st === "SELESAI" || st === "DIREFUND"
    ? { c: "ok", i: I.checkCircle, k: "Selesai", h: STATUS_LABEL[st], p: st === "SELESAI" ? "Dokumen sudah tercetak. Ambil di nampan mesin." : "Dana sudah dikembalikan." }
    : bad
      ? { c: "bad", i: I.alert, k: "Perlu tindakan", h: STATUS_LABEL[st], p: "Maaf atas kendalanya. Lihat bagian pengembalian dana di bawah." }
      : ["LUNAS", "MENCETAK", "CETAK_ULANG"].includes(st)
        ? { c: "", i: I.sync, k: "Status langsung", h: STATUS_LABEL[st], p: "Sedang diproses. Halaman ini diperbarui otomatis." }
        : st === "MENUNGGU_BAYAR"
          ? { c: "plain", i: I.hourglass, k: "Menunggu pembayaran", h: STATUS_LABEL[st], p: "Selesaikan pembayaran lewat halaman pembayaran (tombol di HP atau QR di layar mesin)." }
          : { c: "plain", i: I.info, k: "Status", h: STATUS_LABEL[st] ?? st, p: "Halaman ini diperbarui otomatis." };

  return (
    <Shell tag={paid ? "Struk" : "Status"} machine={machine}>
      <div className="m-hide-print"><Stepper step={step} /></div>

      {st !== "SELESAI" && (
      <div className={`m-card m-live m-hide-print ${live.c}`}>
        <div className="m-live-in">
          <div className={`ic${live.c === "" ? " spin" : ""}`}><MIcon d={live.i} size={22} /></div>
          <div><div className="k">{live.k}</div><h2>{live.h}</h2><p>{live.p}</p></div>
        </div>
      </div>
      )}

      <div className="m-card md m-stack">
        <div className="m-row">
          <Brand size={40} tagline="Struk Digital" />
          {paid && <span className="m-badge fix">Lunas</span>}
        </div>
        <div className="m-meta">
          <div className="r">
            <span>Kode Transaksi:</span>
            <div><span className="m-code">{s.order.code}</span><button className="m-mini m-hide-print" onClick={copyCode} title="Salin kode" aria-label="Salin kode"><MIcon d={I.copy} size={14} /></button></div>
          </div>
          <div className="r"><span>Dibuat:</span><span>{fmt(s.order.created_at)}</span></div>
          {paid && <div className="r"><span>Dibayar:</span><span>{fmt(s.order.paid_at)} ({s.payment?.provider === "mock" ? "simulasi" : "online"})</span></div>}
          {s.order.printed_at && <div className="r"><span>Tercetak:</span><span>{fmt(s.order.printed_at)}</span></div>}
          <div className="r"><span>Kiosk Terminal:</span><span>{s.machine ? `${s.machine.code ? `#${s.machine.code} ` : ""}${s.machine.name}${s.machine.location ? ` (${s.machine.location})` : ""}` : "-"}</span></div>
        </div>

        <div className="m-rows">
          {s.files.map((f, i) => (
            <div key={i} className="m-line">
              <div className="a">
                <div>
                  <b>{f.name}</b>
                  <span>{f.pages ?? "?"} hal · {f.sides ?? "-"} sisi · {f.options?.color ? "warna" : "hitam-putih"} · {f.options?.duplex ? "bolak-balik" : "1 sisi"} · ×{f.options?.copies ?? 1}</span>
                </div>
              </div>
              <span className="p m-num">{f.price !== null ? formatRupiah(f.price) : "-"}</span>
            </div>
          ))}
          {s.totals.rounding > 0 && <div className="m-line m-sm"><span>Pembulatan</span><span className="m-num">{formatRupiah(s.totals.rounding)}</span></div>}
        </div>
        <div className="m-meta"><div className="r tot"><span style={{ color: "var(--m-ink)", fontWeight: 600 }}>Total {paid ? "Terbayar" : "Tagihan"}:</span><b className="m-num" style={{ fontSize: 20, color: "var(--m-primary)" }}>{formatRupiah(s.order.total || s.totals.total)}</b></div></div>
        <p className="m-sm">Isi dokumen tidak disimpan dan tidak ditampilkan di sini.</p>

        {paid && (
          <div className="m-two m-hide-print">
            <button className="m-btn soft" onClick={() => window.print()}><MIcon d={I.download} size={18} />Unduh Struk</button>
            <button className="m-btn soft" onClick={share}><MIcon d={I.share} size={18} />Bagikan</button>
            <button className="m-btn soft" style={{ gridColumn: "1 / -1" }} onClick={saveImage}><MIcon d={I.image} size={18} />Simpan sebagai Gambar</button>
          </div>
        )}
      </div>

      {(st === "MENUNGGU_REFUND" || s.refund) && s.refund && (
        <div className="m-card m-stack m-hide-print">
          <div className="m-h2">Pengembalian dana</div>
          {s.refund.status === "needs_info" && (
            <form className="m-stack m-form" onSubmit={submitRefund}>
              <p className="m-sm">Maaf atas kendalanya. Isi data berikut agar admin bisa mentransfer <b>{formatRupiah(s.refund.amount)}</b>. Data hanya dipakai untuk refund dan dihapus setelah 6 bulan.</p>
              <div><label>Nama pemilik rekening/e-wallet</label><input className="m-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></div>
              <div><label>Tujuan transfer (contoh: DANA 0812xxxx / BCA 1234xxxx)</label><input className="m-input" value={dest} onChange={(e) => setDest(e.target.value)} required minLength={5} /></div>
              <button className="m-btn block" type="submit">Kirim</button>
            </form>
          )}
          {s.refund.status === "pending" && <p className="m-sm">Data diterima. Admin akan mentransfer {formatRupiah(s.refund.amount)} (target &lt; 24 jam).</p>}
          {s.refund.status === "done" && <p className="m-sm">Dana {formatRupiah(s.refund.amount)} sudah ditransfer{s.refund.kind === "partial" ? " (refund sebagian)" : ""}.</p>}
          {s.refund.status === "cancelled" && <p className="m-sm">Dokumenmu dicetak ulang oleh admin.</p>}
          {msg && <p className="m-sm"><b>{msg}</b></p>}
        </div>
      )}

      <div className="m-card m-stack m-hide-print">
        <div className="m-privacy">
          <div className="ic"><MIcon d={I.help} size={18} /></div>
          <div><b>Ada kendala kertas macet atau hasil bermasalah?</b><p>Hubungi admin dan sebutkan kode transaksi di atas.</p></div>
        </div>
        {wa && <a className="m-btn wa block" href={wa} target="_blank" rel="noreferrer"><MIcon d={I.chat} size={18} />Laporkan Masalah via WhatsApp Admin</a>}
      </div>
      <div className="m-links m-hide-print"><a href="/">PaperMate</a></div>
      {toast}
    </Shell>
  );
}
