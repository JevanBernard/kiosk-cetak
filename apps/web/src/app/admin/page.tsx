"use client";
import { useCallback, useEffect, useState } from "react";
import { formatRupiah } from "@kioskcetak/shared";
import { ApiError, STATUS_LABEL, api } from "@/lib/client";

type Machine = any;
type Overview = {
  machines: Machine[];
  today: { orders: number; revenue: number };
  active: any[];
  refunds: any[];
  alerts: any[];
  lastTick: string | null;
};

const TABS = ["Ringkasan", "Tindakan", "Transaksi", "Laporan", "Pengaturan"] as const;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "-");

export default function AdminPage() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Ringkasan");

  const load = useCallback(async () => {
    try {
      setOv(await api<Overview>("/api/admin/overview"));
      setNeedLogin(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedLogin(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (needLogin) return <Login onDone={load} />;
  if (!ov) return <main className="wrap"><p className="muted">Memuat...</p></main>;

  const actionCount = ov.refunds.length;
  const tickStale = !ov.lastTick || Date.now() - new Date(ov.lastTick).getTime() > 5 * 60_000;

  return (
    <main className="wrap wide">
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Dashboard KioskCetak</h1>
        <button className="small" onClick={async () => { await api("/api/admin/logout", { method: "POST" }); load(); }}>Keluar</button>
      </div>
      {tickStale && <div className="banner bad">Pekerjaan terjadwal (kedaluwarsa, hapus file, rekonsiliasi) tidak berjalan sejak {fmt(ov.lastTick)}. Periksa cron dan agent.</div>}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t}{t === "Tindakan" && actionCount > 0 ? ` (${actionCount})` : ""}
          </button>
        ))}
      </div>
      {tab === "Ringkasan" && <Summary ov={ov} reload={load} />}
      {tab === "Tindakan" && <Actions ov={ov} reload={load} />}
      {tab === "Transaksi" && <Orders />}
      {tab === "Laporan" && <Report />}
      {tab === "Pengaturan" && <Settings ov={ov} reload={load} />}
    </main>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  return (
    <main className="wrap">
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/api/admin/login", { method: "POST", json: { email, password } });
            onDone();
          } catch (x: any) {
            setErr(x.message);
          }
        }}
      >
        <h1>Login admin</h1>
        <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></div>
        <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></div>
        {err && <div className="err">{err}</div>}
        <button className="primary block" type="submit">Masuk</button>
      </form>
    </main>
  );
}

function stateClass(s: string) {
  return s === "available" ? "ok" : s === "busy" ? "warn" : "bad";
}

function Summary({ ov, reload }: { ov: Overview; reload: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const act = async (id: string, action: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    try {
      const r = await api<{ agentToken?: string }>(`/api/admin/machines/${id}`, { method: "POST", json: { action } });
      if (r.agentToken) setToken(r.agentToken);
      reload();
    } catch (e: any) {
      alert(e.message);
    }
  };
  return (
    <div className="stack">
      <div className="grid2">
        <div className="card"><div className="muted">Order dibayar hari ini</div><div className="big">{ov.today.orders}</div></div>
        <div className="card"><div className="muted">Pendapatan hari ini</div><div className="big">{formatRupiah(ov.today.revenue)}</div></div>
      </div>
      {token && (
        <div className="banner warn">
          <b>Token agent baru (hanya tampil sekali, simpan sekarang):</b>
          <div style={{ wordBreak: "break-all", fontFamily: "monospace" }}>{token}</div>
          <button className="small" onClick={() => setToken(null)}>Sembunyikan</button>
        </div>
      )}
      {ov.machines.map((m) => {
        const s = m.settings;
        const paperLeft = s ? Math.max(0, s.paper_capacity - m.sheets_since_refill) : 0;
        const bw = s ? Math.max(0, Math.round(100 - (m.sides_bw_since_refill / s.ink_bw_capacity) * 100)) : 0;
        const col = s ? Math.max(0, Math.round(100 - (m.sides_color_since_refill / s.ink_color_capacity) * 100)) : 0;
        return (
          <div className="card stack" key={m.id}>
            <div className="row between">
              <h2 style={{ margin: 0 }}>{m.name}</h2>
              <span className={`pill ${stateClass(m.availability.state)}`}>{m.availability.state === "available" ? "Tersedia" : m.availability.state === "busy" ? "Dipakai" : "Tidak tersedia"}</span>
            </div>
            {m.availability.reason && <div className="muted">{m.availability.reason}</div>}
            <div className="grid2 muted">
              <div>Heartbeat: {fmt(m.last_heartbeat)}</div>
              <div>Printer: {m.printer_state}</div>
              <div>Perkiraan kertas: ±{paperLeft} lembar</div>
              <div>Tinta hitam ±{bw}% · warna ±{col}%</div>
              <div>Nozzle check: {m.nozzle_result ? `${m.nozzle_result} (${fmt(m.last_nozzle_check)})` : "-"}</div>
              <div>Order aktif: {m.active_order_id ? "ya" : "tidak"}</div>
            </div>
            <div className="row">
              <button onClick={() => act(m.id, "refill", "Reset estimasi kertas/tinta dan aktifkan mesin?")}>Isi ulang selesai</button>
              <button onClick={() => act(m.id, "unlock", "Lepas kunci mesin? Order yang sedang berjalan tidak lagi memblokir mesin.")} disabled={!m.active_order_id}>Lepas kunci</button>
              {m.maintenance ? <button onClick={() => act(m.id, "maintenance-off")}>Selesai perawatan</button> : <button onClick={() => act(m.id, "maintenance-on")}>Mode perawatan</button>}
              {m.fault && <button onClick={() => act(m.id, "clear-fault")}>Hapus status gangguan</button>}
            </div>
            <details>
              <summary className="muted">Layar kiosk &amp; agent</summary>
              <div className="stack" style={{ marginTop: 8 }}>
                <div>URL layar kiosk (buka di Chrome mode kiosk pada mesin):</div>
                <input readOnly value={m.kioskUrl} onFocus={(e) => e.target.select()} />
                <div className="row">
                  <button className="small" onClick={() => act(m.id, "rotate-token", "Buat token agent baru? Token lama langsung tidak berlaku.")}>{m.hasAgentToken ? "Ganti token agent" : "Buat token agent"}</button>
                  {m.hasAgentToken && <button className="small danger" onClick={() => act(m.id, "revoke-token", "Cabut token agent? Agent akan berhenti bekerja.")}>Cabut token</button>}
                </div>
              </div>
            </details>
          </div>
        );
      })}
      {ov.machines.length === 0 && <CreateMachine reload={reload} />}
      <div className="card">
        <h2>Order aktif</h2>
        {ov.active.length === 0 ? <div className="muted">Tidak ada.</div> : (
          <table><tbody>{ov.active.map((o) => <tr key={o.id}><td>{o.code}</td><td>{STATUS_LABEL[o.status]}</td><td>{formatRupiah(o.total)}</td><td>{fmt(o.created_at)}</td></tr>)}</tbody></table>
        )}
      </div>
      <div className="card">
        <h2>Alert terbaru</h2>
        {ov.alerts.length === 0 ? <div className="muted">Belum ada.</div> : (
          <table><tbody>{ov.alerts.map((a) => <tr key={a.id}><td>{fmt(a.created_at)}</td><td>{a.message}</td><td>{a.sent ? "terkirim" : "belum"}</td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  );
}

function CreateMachine({ reload }: { reload: () => void }) {
  const [name, setName] = useState("Mesin 1");
  const [location, setLocation] = useState("");
  return (
    <div className="card stack">
      <h2>Tambah mesin</h2>
      <div className="field"><label>Nama</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>Lokasi</label><input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
      <button className="primary" onClick={async () => {
        try {
          const r = await api<{ agentToken: string }>("/api/admin/machines", { method: "POST", json: { name, location } });
          alert("Token agent (simpan, hanya tampil sekali):\n\n" + r.agentToken);
          reload();
        } catch (e: any) { alert(e.message); }
      }}>Buat mesin</button>
    </div>
  );
}

function Actions({ ov, reload }: { ov: Overview; reload: () => void }) {
  const call = async (id: string, body: any) => {
    try {
      await api(`/api/admin/refunds/${id}`, { method: "POST", json: body });
      reload();
    } catch (e: any) {
      alert(e.message);
    }
  };
  if (!ov.refunds.length) return <div className="card muted">Tidak ada tindakan yang menunggu.</div>;
  return (
    <div className="stack">
      {ov.refunds.map((r) => (
        <div className="card stack" key={r.id}>
          <div className="row between">
            <b>{r.orders?.code}</b>
            <span className={`pill ${r.status === "pending" ? "warn" : "bad"}`}>{r.status === "pending" ? "Siap ditransfer" : "Menunggu data user"}</span>
          </div>
          <div className="muted">{r.reason}</div>
          <div>Nominal: <b>{formatRupiah(r.amount)}</b></div>
          {r.status === "pending" ? (
            <div>Transfer ke: <b>{r.holder_name}</b> · {r.destination}</div>
          ) : (
            <div className="muted">User belum mengisi data. Minta dia membuka halaman status dengan kode di atas.</div>
          )}
          <div className="row">
            {r.status === "pending" && (
              <>
                <button className="primary" onClick={() => {
                  const note = prompt("Catatan / bukti transfer (mis. nomor referensi):") ?? "";
                  call(r.id, { action: "done", note });
                }}>Tandai sudah ditransfer</button>
                <button onClick={() => {
                  const v = prompt(`Refund proporsional: nominal yang dikembalikan (kurang dari ${r.amount}):`);
                  if (v) call(r.id, { action: "done", kind: "partial", amount: Number(v), note: "Refund sebagian" });
                }}>Refund sebagian</button>
              </>
            )}
            {!r.orders?.files_deleted_at && <button onClick={() => confirm("Cetak ulang order ini?") && call(r.id, { action: "reprint" })}>Cetak ulang</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Orders() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
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
    <div className="card stack">
      <div className="grid2">
        <div className="field"><label>Cari kode</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="field"><label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field"><label>Dari</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label>Sampai</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Kode</th><th>Waktu</th><th>Mesin</th><th>File (metadata)</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>{o.code}</td>
                <td>{fmt(o.created_at)}</td>
                <td>{o.machines?.name}</td>
                <td>{(o.order_files ?? []).map((f: any, i: number) => <div key={i}>{f.original_name} <span className="muted">({f.pages ?? "?"} hal)</span></div>)}</td>
                <td>{STATUS_LABEL[o.status] ?? o.status}</td>
                <td className="price">{formatRupiah(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <div className="muted">Tidak ada data.</div>}
    </div>
  );
}

function Report() {
  const [group, setGroup] = useState<"day" | "month">("day");
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<any[]>([]);
  const qs = `group=${group}&from=${from}&to=${to}`;
  useEffect(() => { api<{ rows: any[] }>(`/api/admin/report?${qs}`).then((r) => setRows(r.rows)).catch(() => {}); }, [qs]);
  const sum = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, refunded: a.refunded + r.refunded, orders: a.orders + r.orders, sheets: a.sheets + r.sheets }), { revenue: 0, refunded: 0, orders: 0, sheets: 0 });
  return (
    <div className="card stack">
      <div className="grid2">
        <div className="field"><label>Per</label><select value={group} onChange={(e) => setGroup(e.target.value as any)}><option value="day">Hari</option><option value="month">Bulan</option></select></div>
        <div />
        <div className="field"><label>Dari</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label>Sampai</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <table>
        <thead><tr><th>Periode</th><th>Order</th><th>Lembar</th><th>Pendapatan</th><th>Refund</th><th>Bersih</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.period}><td>{r.period}</td><td>{r.orders}</td><td>{r.sheets}</td><td className="price">{formatRupiah(r.revenue)}</td><td>{formatRupiah(r.refunded)}</td><td className="price">{formatRupiah(r.revenue - r.refunded)}</td></tr>)}
          <tr><th>Total</th><th>{sum.orders}</th><th>{sum.sheets}</th><th>{formatRupiah(sum.revenue)}</th><th>{formatRupiah(sum.refunded)}</th><th>{formatRupiah(sum.revenue - sum.refunded)}</th></tr>
        </tbody>
      </table>
      <a className="btn" href={`/api/admin/report?${qs}&format=csv`}>Unduh CSV</a>
    </div>
  );
}

const NUM_FIELDS: [string, string][] = [
  ["price_bw_single", "Harga hitam-putih 1 sisi (per sisi)"],
  ["price_bw_duplex", "Harga hitam-putih bolak-balik (per sisi)"],
  ["price_color_single", "Harga warna 1 sisi (per sisi)"],
  ["price_color_duplex", "Harga warna bolak-balik (per sisi)"],
  ["min_total", "Total minimal order"],
  ["max_copies", "Maks salinan per file"],
  ["paper_capacity", "Kapasitas kertas (lembar) per isi ulang"],
  ["paper_warn", "Peringatkan saat sisa kertas ≤"],
  ["ink_bw_capacity", "Perkiraan sisi hitam-putih per isi ulang tinta"],
  ["ink_color_capacity", "Perkiraan sisi warna per isi ulang tinta"],
  ["ink_warn_pct", "Peringatkan tinta saat ≤ (%)"],
  ["offline_alert_minutes", "Alert jika offline lebih dari (menit)"],
];

function Settings({ ov, reload }: { ov: Overview; reload: () => void }) {
  return <div className="stack">{ov.machines.map((m) => <SettingsForm key={m.id} m={m} reload={reload} />)}</div>;
}

function SettingsForm({ m, reload }: { m: Machine; reload: () => void }) {
  const [v, setV] = useState<Record<string, any>>({ ...m.settings });
  const [msg, setMsg] = useState("");
  if (!m.settings) return null;
  const set = (k: string, val: any) => setV((x) => ({ ...x, [k]: val }));
  return (
    <div className="card stack">
      <h2>{m.name}</h2>
      <div className="grid2">
        {NUM_FIELDS.map(([k, label]) => (
          <div className="field" key={k}><label>{label}</label><input type="number" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value === "" ? "" : Number(e.target.value))} /></div>
        ))}
        <div className="field"><label>Pembulatan total</label><select value={v.rounding} onChange={(e) => set("rounding", Number(e.target.value))}><option value={100}>Rp 100</option><option value={500}>Rp 500</option></select></div>
        <div className="field"><label>WhatsApp admin (628xxx) untuk "Laporkan masalah"</label><input value={v.admin_whatsapp ?? ""} onChange={(e) => set("admin_whatsapp", e.target.value)} /></div>
      </div>
      <div className="row">
        {(["allow_color", "allow_duplex", "allow_nup"] as const).map((k) => (
          <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ink)" }}>
            <input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={!!v[k]} onChange={(e) => set(k, e.target.checked)} />
            {k === "allow_color" ? "Warna aktif" : k === "allow_duplex" ? "Bolak-balik aktif" : "Banyak halaman per lembar aktif"}
          </label>
        ))}
      </div>
      <div className="muted">Perubahan harga tidak memengaruhi order yang sudah menampilkan QR pembayaran.</div>
      <button className="primary" onClick={async () => {
        try {
          const { machine_id, ...patch } = v;
          await api(`/api/admin/machines/${m.id}`, { method: "PATCH", json: patch });
          setMsg("Tersimpan.");
          reload();
        } catch (e: any) { setMsg(e.message); }
      }}>Simpan</button>
      {msg && <div className="muted">{msg}</div>}
    </div>
  );
}
