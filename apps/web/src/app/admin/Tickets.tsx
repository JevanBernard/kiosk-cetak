"use client";
import { useState } from "react";
import { formatRupiah } from "@kioskcetak/shared";
import { api } from "@/lib/client";
import { A, AIcon, PageHead, fmt, type Overview } from "./ui";

type Toast = (text: string, bad?: boolean) => void;

export default function Tickets({ ov, reload, toast }: { ov: Overview; reload: () => void; toast: Toast }) {
  const sum = ov.refunds.reduce((n, r) => n + (r.amount ?? 0), 0);
  const ready = ov.refunds.filter((r) => r.status === "pending").length;
  return (
    <>
      <PageHead
        kicker="Operasional Hardware / Gagal Cetak"
        title="Antrean Refund & Tiket Masalah"
        sub="Selesaikan pengembalian dana manual dan cetak ulang untuk order yang gagal dicetak. Data rekening dihapus otomatis setelah 6 bulan."
        right={ov.refunds.length > 0 ? <span className="a-badge bad" style={{ fontSize: 12, padding: "4px 12px" }}>{ov.refunds.length} Butuh Tindakan</span> : <span className="a-badge ok" style={{ fontSize: 12, padding: "4px 12px" }}>Tidak Ada Antrean</span>}
      />

      <div className="a-card low sm" style={{ flexDirection: "row", alignItems: "center", gap: "1rem" }}>
        <div className="a-logo" style={{ width: "2.5rem", height: "2.5rem", flex: "none" }}><AIcon d={A.shield} size={22} /></div>
        <div>
          <div className="a-lab">Alur gagal cetak</div>
          <p className="a-sub" style={{ marginTop: 4 }}>Sistem mencoba mencetak ulang otomatis. Jika tetap gagal, mesin dikunci dan pengguna mengisi data rekening/e-wallet di halaman status. Admin mentransfer manual (target &lt; 24 jam) lalu menandai selesai, atau mencetak ulang selama file belum terhapus.</p>
        </div>
      </div>

      <div className="a-g3">
        <div className="a-card sm a-kpi"><div className="top"><span className="lab"><AIcon d={A.alert} size={18} />Menunggu Tindakan</span></div><div className="val a-num" style={{ color: ov.refunds.length ? "var(--a-error)" : undefined }}>{ov.refunds.length}</div><div className="foot">{ready} siap ditransfer · {ov.refunds.length - ready} menunggu data pengguna</div></div>
        <div className="a-card sm a-kpi"><div className="top"><span className="lab"><AIcon d={A.money} size={18} />Total Nominal Tertahan</span></div><div className="val a-num">{formatRupiah(sum)}</div><div className="foot">Akan dikembalikan ke pengguna</div></div>
        <div className="a-card sm a-kpi"><div className="top"><span className="lab"><AIcon d={A.clock} size={18} />Target Penyelesaian</span></div><div className="val">&lt; 24 jam</div><div className="foot">Sejak pengguna mengisi data</div></div>
      </div>

      {ov.refunds.length === 0 && <div className="a-card"><div className="a-empty"><AIcon d={A.checkCircle} size={32} /><div style={{ marginTop: 8 }}>Tidak ada tindakan yang menunggu. Semua order tercetak dengan baik.</div></div></div>}
      {ov.refunds.map((r) => <Case key={r.id} r={r} reload={reload} toast={toast} />)}
    </>
  );
}

function Case({ r, reload, toast }: { r: any; reload: () => void; toast: Toast }) {
  const [kind, setKind] = useState<"full" | "partial">("full");
  const [part, setPart] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = r.status === "pending";
  const amount = kind === "partial" ? Number(part) || 0 : r.amount;

  const call = async (body: any, ok: string) => {
    setBusy(true);
    try {
      await api(`/api/admin/refunds/${r.id}`, { method: "POST", json: body });
      toast(ok);
      reload();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const done = () => {
    if (kind === "partial" && !(amount > 0 && amount < r.amount)) return toast(`Nominal refund sebagian harus lebih dari 0 dan kurang dari ${formatRupiah(r.amount)}.`, true);
    call({ action: "done", note, ...(kind === "partial" ? { kind: "partial", amount } : {}) }, "Refund ditandai selesai. Tiket ditutup.");
  };

  return (
    <section className="a-card md">
      <div className="a-case-h">
        <div className="l">
          <div className={`a-case-ico${pending ? "" : " wait"}`}><AIcon d={pending ? A.alert : A.hourglass} size={26} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="a-gap">
              <span className="a-h2 a-mono" style={{ fontSize: 18 }}>{r.orders?.code}</span>
              <span className={`a-badge ${pending ? "bad" : "warn"}`}>{pending ? "SIAP DITRANSFER" : "MENUNGGU DATA PENGGUNA"}</span>
            </div>
            <div className="a-sub" style={{ marginTop: 4 }}>{r.reason}{r.created_at ? ` · Dibuat ${fmt(r.created_at)}` : ""}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}><div className="a-cap">Nominal</div><div className="a-h2 a-num" style={{ justifyContent: "flex-end", color: "var(--a-error)" }}>{formatRupiah(r.amount)}</div></div>
      </div>

      <div className="a-split">
        <div className="a-c7" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="a-info">
            <span className="a-lab a-gap"><AIcon d={A.user} size={18} />Rekening / e-Wallet Penerima</span>
            {pending ? (
              <div className="a-g2">
                <div className="cell"><small>Nama Pemilik</small><b>{r.holder_name}</b></div>
                <div className="cell"><small>Tujuan Transfer</small><b className="a-mono">{r.destination}</b></div>
              </div>
            ) : (
              <p className="a-sub">Pengguna belum mengisi data. Minta mereka membuka halaman status dengan kode <b className="a-mono">{r.orders?.code}</b>.</p>
            )}
          </div>
          <div className="a-gap">
            <a className="a-btn" href={`/status/${r.orders?.code}`} target="_blank" rel="noreferrer"><AIcon d={A.extern} size={16} />Lihat Halaman Status</a>
            {!r.orders?.files_deleted_at ? (
              <button className="a-btn" disabled={busy} onClick={() => confirm("Cetak ulang order ini? Tiket refund akan dibatalkan.") && call({ action: "reprint" }, "Cetak ulang dikirim ke mesin.")}><AIcon d={A.print} size={16} />Cetak Ulang</button>
            ) : (
              <span className="a-sub a-gap"><AIcon d={A.trash} size={16} />File sudah dihapus, cetak ulang tidak tersedia.</span>
            )}
          </div>
        </div>

        <div className="a-c5 a-box" style={{ gap: "1rem" }}>
          <div className="a-row"><h3 className="a-lab a-gap"><AIcon d={A.money} size={20} />Form Penyelesaian Refund</h3><span className="a-badge pri">MANUAL</span></div>
          {pending ? (
            <>
              <div className="a-g2" style={{ gap: ".5rem" }}>
                <label className="a-opt"><div className="t"><span>Refund Penuh</span><input type="radio" name={`k-${r.id}`} checked={kind === "full"} onChange={() => setKind("full")} /></div><span className="d">Kembalikan seluruh pembayaran</span><span className="p a-num">{formatRupiah(r.amount)}</span></label>
                <label className="a-opt"><div className="t"><span>Refund Sebagian</span><input type="radio" name={`k-${r.id}`} checked={kind === "partial"} onChange={() => setKind("partial")} /></div><span className="d">Sebagian sudah tercetak</span><span className="p a-num">{kind === "partial" ? formatRupiah(amount) : "Nominal bebas"}</span></label>
              </div>
              {kind === "partial" && <div className="a-field"><label>Nominal yang dikembalikan (kurang dari {formatRupiah(r.amount)})</label><input className="a-in" type="number" inputMode="numeric" value={part} onChange={(e) => setPart(e.target.value)} placeholder="Contoh: 3900" /></div>}
              <div className="a-field"><label>Nomor referensi / catatan transfer</label><input className="a-in" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: GP-20261021-988231" /></div>
              <div className="a-row"><span className="a-sub">Nominal yang akan dikirim:</span><b className="a-h2 a-num" style={{ color: "var(--a-primary)" }}>{formatRupiah(amount)}</b></div>
              <button className="a-btn pri block" disabled={busy} onClick={done}><AIcon d={A.checkCircle} size={18} />Tandai Sudah Ditransfer</button>
              <span className="a-sub" style={{ textAlign: "center" }}>Setelah ditandai, file dokumen dihapus dan data rekening terkunci dalam retensi 6 bulan.</span>
            </>
          ) : (
            <p className="a-sub">Form transfer terbuka setelah pengguna mengisi data rekening. Anda tetap bisa mencetak ulang order ini jika file belum terhapus.</p>
          )}
        </div>
      </div>
    </section>
  );
}
