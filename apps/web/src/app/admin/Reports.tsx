"use client";
import { useCallback, useEffect, useState } from "react";
import { formatRupiah } from "@kioskcetak/shared";
import { STATUS_LABEL, api } from "@/lib/client";
import { A, AIcon, PageHead, fmt, statusTone } from "./ui";

const day = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => day(new Date(Date.now() - n * 86_400_000));
const QUICK = ["SELESAI", "MENUNGGU_BAYAR", "MENCETAK", "MENUNGGU_REFUND", "DIREFUND", "KEDALUWARSA", "DIBATALKAN"];

export default function Reports({ initialQ }: { initialQ: string }) {
  return (
    <>
      <PageHead
        kicker="Keuangan & Audit"
        title="Riwayat Transaksi & Laporan"
        sub="Rekap pendapatan, refund, dan volume lembar per periode, serta daftar transaksi. Hanya metadata, isi dokumen tidak pernah disimpan."
      />
      <Report />
      <Orders key={initialQ} initialQ={initialQ} />
    </>
  );
}

function Report() {
  const [group, setGroup] = useState<"day" | "month">("day");
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(day(new Date()));
  const [rows, setRows] = useState<any[]>([]);
  const [preset, setPreset] = useState("30d");
  const qs = `group=${group}&from=${from}&to=${to}`;
  useEffect(() => { api<{ rows: any[] }>(`/api/admin/report?${qs}`).then((r) => setRows(r.rows)).catch(() => {}); }, [qs]);

  const pick = (p: string) => {
    setPreset(p);
    const today = day(new Date());
    if (p === "today") { setFrom(today); setTo(today); setGroup("day"); }
    if (p === "7d") { setFrom(daysAgo(6)); setTo(today); setGroup("day"); }
    if (p === "30d") { setFrom(daysAgo(30)); setTo(today); setGroup("day"); }
    if (p === "month") { setFrom(today.slice(0, 8) + "01"); setTo(today); setGroup("day"); }
  };

  const sum = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, refunded: a.refunded + r.refunded, orders: a.orders + r.orders, sheets: a.sheets + r.sheets }), { revenue: 0, refunded: 0, orders: 0, sheets: 0 });
  const max = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <section className="a-card md">
      <div className="a-row">
        <div className="a-seg">
          {[["today", "Hari Ini"], ["7d", "7 Hari"], ["30d", "30 Hari"], ["month", "Bulan Ini"], ["custom", "Kustom"]].map(([k, l]) => (
            <button key={k} className={preset === k ? "on" : ""} onClick={() => pick(k)}>{l}</button>
          ))}
        </div>
        <a className="a-btn pri" href={`/api/admin/report?${qs}&format=csv`}><AIcon d={A.download} size={16} />Unduh CSV</a>
      </div>
      <div className="a-g3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))" }}>
        <div className="a-field"><label>Per</label><select className="a-in" value={group} onChange={(e) => { setGroup(e.target.value as any); setPreset("custom"); }}><option value="day">Hari</option><option value="month">Bulan</option></select></div>
        <div className="a-field"><label>Dari</label><input className="a-in" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} /></div>
        <div className="a-field"><label>Sampai</label><input className="a-in" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} /></div>
      </div>

      <div className="a-g4">
        <div className="a-card low sm a-kpi"><div className="top"><span className="lab"><AIcon d={A.money} size={18} />Pendapatan Kotor</span></div><div className="val a-num">{formatRupiah(sum.revenue)}</div><div className="foot">{sum.orders} order dibayar</div></div>
        <div className="a-card low sm a-kpi"><div className="top"><span className="lab"><AIcon d={A.alert} size={18} />Refund</span></div><div className="val a-num" style={{ color: sum.refunded ? "var(--a-error)" : undefined }}>{sum.refunded ? "-" : ""}{formatRupiah(sum.refunded)}</div><div className="foot">Sudah ditransfer ke pengguna</div></div>
        <div className="a-card sm a-kpi dark"><div className="top"><span className="lab"><AIcon d={A.checkCircle} size={18} />Pendapatan Bersih</span></div><div className="val a-num">{formatRupiah(sum.revenue - sum.refunded)}</div><div className="foot">Kotor dikurangi refund</div></div>
        <div className="a-card low sm a-kpi"><div className="top"><span className="lab"><AIcon d={A.paper} size={18} />Lembar Tercetak</span></div><div className="val a-num">{sum.sheets}</div><div className="foot">Estimasi dari sisi dan duplex</div></div>
      </div>

      {rows.length > 0 && (
        <div>
          <div className="a-row" style={{ marginBottom: 4 }}><span className="a-lab a-gap"><AIcon d={A.chart} size={20} />Pendapatan per {group === "month" ? "Bulan" : "Hari"}</span><span className="a-sub">Puncak: {formatRupiah(max)}</span></div>
          <div className="a-bars">
            {rows.map((r) => (
              <div key={r.period} className="a-bar" title={`${r.period}: ${formatRupiah(r.revenue)} · ${r.orders} order`}>
                <i style={{ height: `${(r.revenue / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="a-axis"><span>{rows[0].period}</span>{rows.length > 2 && <span>{rows[Math.floor(rows.length / 2)].period}</span>}<span>{rows[rows.length - 1].period}</span></div>
        </div>
      )}

      <div className="a-tw">
        <table className="a-table">
          <thead><tr><th>Periode</th><th className="r">Order</th><th className="r">Lembar</th><th className="r">Pendapatan</th><th className="r">Refund</th><th className="r">Bersih</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period}><td className="main a-mono">{r.period}</td><td className="r a-num">{r.orders}</td><td className="r a-num">{r.sheets}</td><td className="r a-num">{formatRupiah(r.revenue)}</td><td className="r a-num">{formatRupiah(r.refunded)}</td><td className="r a-num main">{formatRupiah(r.revenue - r.refunded)}</td></tr>
            ))}
          </tbody>
          {rows.length > 0 && <tfoot><tr><td>Total</td><td className="r a-num">{sum.orders}</td><td className="r a-num">{sum.sheets}</td><td className="r a-num">{formatRupiah(sum.revenue)}</td><td className="r a-num">{formatRupiah(sum.refunded)}</td><td className="r a-num">{formatRupiah(sum.revenue - sum.refunded)}</td></tr></tfoot>}
        </table>
        {rows.length === 0 && <div className="a-empty">Belum ada transaksi pada rentang ini.</div>}
      </div>
    </section>
  );
}

function Orders({ initialQ }: { initialQ: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const search = useCallback(async () => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    setRows((await api<{ orders: any[] }>(`/api/admin/orders?${p}`)).orders);
  }, [q, status, from, to]);
  useEffect(() => { search(); }, [search]);

  return (
    <section className="a-card md">
      <div className="a-row">
        <h2 className="a-h2"><AIcon d={A.receipt} size={22} />Daftar Transaksi</h2>
        <span className="a-sub">Menampilkan hingga 200 transaksi terbaru</span>
      </div>
      <div className="a-row">
        <div className="a-search" style={{ maxWidth: "24rem" }}>
          <AIcon d={A.search} size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode transaksi..." />
        </div>
        <div className="a-gap">
          <div className="a-field" style={{ flexDirection: "row", alignItems: "center", gap: ".5rem" }}><label>Dari</label><input className="a-in" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: "auto" }} /></div>
          <div className="a-field" style={{ flexDirection: "row", alignItems: "center", gap: ".5rem" }}><label>Sampai</label><input className="a-in" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "auto" }} /></div>
        </div>
      </div>
      <div className="a-gap">
        <button className={`a-btn sm ${status === "" ? "pri" : "ghost"}`} onClick={() => setStatus("")}>Semua</button>
        {QUICK.map((s) => <button key={s} className={`a-btn sm ${status === s ? "pri" : "ghost"}`} onClick={() => setStatus(status === s ? "" : s)}>{STATUS_LABEL[s]}</button>)}
      </div>

      <div className="a-tw">
        <table className="a-table">
          <thead><tr><th>Waktu &amp; Kode</th><th>Berkas</th><th>Mesin</th><th>Status</th><th className="r">Total</th><th className="r">Nota</th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td><div className="main a-mono">{o.code}</div><div className="mut">{fmt(o.created_at)}</div></td>
                <td>{(o.order_files ?? []).map((f: any, i: number) => <div key={i} style={{ overflowWrap: "anywhere" }}>{f.original_name} <span className="mut">· {f.pages ?? "?"} hal</span></div>)}</td>
                <td>{o.machines?.name}</td>
                <td><span className={`a-badge ${statusTone(o.status)}`}>{STATUS_LABEL[o.status] ?? o.status}</span></td>
                <td className="r a-num main">{formatRupiah(o.total)}</td>
                <td className="r"><a className="a-btn sm" href={`/status/${o.code}`} target="_blank" rel="noreferrer"><AIcon d={A.receipt} size={14} />Struk</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="a-empty">Tidak ada transaksi yang cocok.</div>}
      </div>
    </section>
  );
}
