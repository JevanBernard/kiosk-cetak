"use client";
import { useState } from "react";
import { formatRupiah } from "@kioskcetak/shared";
import { STATUS_LABEL, api } from "@/lib/client";
import { A, AIcon, Meter, PageHead, availLabel, availTone, fmt, statusTone, type Machine, type Overview } from "./ui";

type Toast = (text: string, bad?: boolean) => void;

const ago = (iso: string | null) => {
  if (!iso) return "belum pernah";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} dtk lalu` : s < 3600 ? `${Math.round(s / 60)} mnt lalu` : `${Math.round(s / 3600)} jam lalu`;
};

export default function Monitoring({ ov, reload, toast, go }: { ov: Overview; reload: () => void; toast: Toast; go: (tab: string) => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const refundSum = ov.refunds.reduce((n, r) => n + (r.amount ?? 0), 0);
  const ready = ov.machines.filter((m) => m.availability.state === "available").length;

  const act = async (id: string, action: string, ok: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    try {
      const r = await api<{ agentToken?: string }>(`/api/admin/machines/${id}`, { method: "POST", json: { action } });
      if (r.agentToken) setToken(r.agentToken);
      toast(ok);
      reload();
    } catch (e: any) {
      toast(e.message, true);
    }
  };

  return (
    <>
      <PageHead
        kicker="Operasional Hardware"
        title="Monitoring & Telemetri Kiosk"
        sub="Pantau status mesin, bahan habis pakai, dan order yang sedang berjalan. Diperbarui otomatis setiap 5 detik."
        right={
          <>
            <button className="a-btn" onClick={() => { reload(); toast("Data diperbarui dari server."); }}><AIcon d={A.sync} size={16} />Sinkron Ulang</button>
            <button className="a-btn pri" onClick={() => setAdding((v) => !v)}><AIcon d={A.plus} size={16} />Tambah Mesin</button>
          </>
        }
      />

      <div className="a-g4">
        <div className="a-card sm a-kpi">
          <div className="top"><span className="lab"><AIcon d={A.money} size={18} />Pendapatan Hari Ini</span></div>
          <div className="val a-num">{formatRupiah(ov.today.revenue)}</div>
          <div className="foot">Dari {ov.today.orders} order yang sudah dibayar</div>
        </div>
        <div className="a-card sm a-kpi">
          <div className="top"><span className="lab"><AIcon d={A.checkCircle} size={18} />Order Dibayar Hari Ini</span></div>
          <div className="val a-num">{ov.today.orders}</div>
          <div className="foot">{ov.active.length} order sedang berjalan sekarang</div>
        </div>
        <div className="a-card sm a-kpi">
          <div className="top"><span className="lab"><AIcon d={A.store} size={18} />Mesin Tersedia</span><span className={`a-badge ${ready === ov.machines.length && ready > 0 ? "ok" : "warn"}`}>{ready === ov.machines.length ? "Normal" : "Perlu cek"}</span></div>
          <div className="val a-num">{ready} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--a-muted)" }}>/ {ov.machines.length} mesin</span></div>
          <div className="foot">Siap menerima order baru</div>
        </div>
        <div className="a-card sm a-kpi" style={ov.refunds.length ? { boxShadow: "0 0 0 1px var(--a-error-c), var(--a-shadow)" } : undefined}>
          <div className="top"><span className="lab" style={ov.refunds.length ? { color: "var(--a-error)" } : undefined}><AIcon d={A.alert} size={18} />Antrean Refund</span>{ov.refunds.length > 0 && <span className="a-badge bad">Perlu Tindakan</span>}</div>
          <div className="val a-num" style={ov.refunds.length ? { color: "var(--a-error)" } : undefined}>{ov.refunds.length} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--a-muted)" }}>tiket</span></div>
          <div className="a-row foot"><span>Nilai klaim: <b style={{ color: "var(--a-ink)" }}>{formatRupiah(refundSum)}</b></span>{ov.refunds.length > 0 && <button className="a-btn sm" onClick={() => go("tiket")}>Proses</button>}</div>
        </div>
      </div>

      {token && (
        <div className="a-tok">
          <b>Token agent baru (hanya tampil sekali, simpan sekarang):</b>
          <code className="a-mono">{token}</code>
          <div className="a-gap">
            <button className="a-btn sm" onClick={() => { navigator.clipboard?.writeText(token).then(() => toast("Token disalin.")).catch(() => {}); }}><AIcon d={A.copy} size={14} />Salin</button>
            <button className="a-btn sm" onClick={() => setToken(null)}>Sembunyikan</button>
          </div>
        </div>
      )}

      {(adding || ov.machines.length === 0) && <CreateMachine reload={reload} toast={toast} done={() => setAdding(false)} onToken={setToken} />}

      {ov.machines.map((m) => <MachineCard key={m.id} m={m} act={act} toast={toast} />)}

      <div className="a-split">
        <section className="a-card a-c7">
          <div className="a-row">
            <h2 className="a-h2"><AIcon d={A.receipt} size={22} />Order Aktif<span className="a-dot" /></h2>
            <span className="a-sub">{ov.active.length} order berjalan</span>
          </div>
          <div className="a-tw">
            <table className="a-table">
              <thead><tr><th>Kode</th><th>Status</th><th>Total</th><th>Dibuat</th></tr></thead>
              <tbody>
                {ov.active.map((o) => (
                  <tr key={o.id}>
                    <td className="main a-mono">{o.code}</td>
                    <td><span className={`a-badge ${statusTone(o.status)}`}>{STATUS_LABEL[o.status] ?? o.status}</span></td>
                    <td className="a-num">{formatRupiah(o.total)}</td>
                    <td className="mut">{fmt(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ov.active.length === 0 && <div className="a-empty">Tidak ada order aktif.</div>}
          </div>
        </section>
        <section className="a-card a-c5">
          <h2 className="a-h2"><AIcon d={A.bell} size={22} />Alert Terbaru</h2>
          <div className="a-gap" style={{ flexDirection: "column", alignItems: "stretch" }}>
            {ov.alerts.map((a) => (
              <div key={a.id} className="a-log">
                <div className="l"><AIcon d={A.alert} size={18} /><div><b>{a.message}</b><span>{a.sent ? "Terkirim ke Telegram" : "Belum terkirim"}</span></div></div>
                <time>{fmt(a.created_at)}</time>
              </div>
            ))}
            {ov.alerts.length === 0 && <div className="a-empty">Belum ada alert.</div>}
          </div>
        </section>
      </div>
    </>
  );
}

function MachineCard({ m, act, toast }: { m: Machine; act: (id: string, action: string, ok: string, c?: string) => void; toast: Toast }) {
  const s = m.settings;
  const paperLeft = s ? Math.max(0, s.paper_capacity - m.sheets_since_refill) : 0;
  const paperPct = s ? Math.round((paperLeft / Math.max(1, s.paper_capacity)) * 100) : 0;
  const bw = s ? Math.max(0, Math.round(100 - (m.sides_bw_since_refill / s.ink_bw_capacity) * 100)) : 0;
  const col = s ? Math.max(0, Math.round(100 - (m.sides_color_since_refill / s.ink_color_capacity) * 100)) : 0;
  const tone = availTone(m.availability.state);
  const low = (p: number, warn: number) => (p <= warn ? "bad" : p <= warn * 2 ? "warn" : "ok");
  const inkWarn = s?.ink_warn_pct ?? 15;
  const paperWarn = s ? Math.round((s.paper_warn / Math.max(1, s.paper_capacity)) * 100) : 12;

  return (
    <section className="a-card md">
      <div className="a-mach-top">
        <div className="a-mach-l">
          <div className="a-mach-ico"><AIcon d={A.print} size={28} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="id">{m.code ? `Node Kiosk #${m.code}` : "Node Kiosk"}</div>
            <h2>{m.name}</h2>
            <span className="a-sub">{m.location ?? "Lokasi belum diisi (atur di Pengaturan & Harga)"}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className={`a-badge ${tone}`} style={{ fontSize: 12, padding: "4px 12px" }}><span className={`a-dot ${tone === "ok" ? "" : tone}`} />{availLabel(m.availability.state).toUpperCase()}</span>
          <div className="a-sub" style={{ marginTop: 4 }}>Heartbeat: {ago(m.last_heartbeat)}</div>
        </div>
      </div>

      {m.availability.reason && m.availability.state !== "available" && <div className={`a-banner ${m.availability.state === "busy" ? "warn" : ""}`}><AIcon d={A.alert} size={18} /><span>{m.availability.reason}</span></div>}

      <div className="a-state">
        <div><small>Status Sesi Kiosk</small><b><span className={`a-dot ${m.active_order_id ? "warn" : ""}`} />{m.active_order_id ? "Order Berjalan" : "Idle / Standby"}</b><span>{m.active_order_id ? "Mesin terkunci untuk 1 order" : "Menampilkan QR standby"}</span></div>
        <div><small>Kunci Mesin</small><b><AIcon d={m.active_order_id ? A.lock : A.unlock} size={18} />{m.active_order_id ? "Terkunci" : "Terbuka"}</b><span>{m.maintenance ? "Mode perawatan aktif" : m.fault ? "Status gangguan aktif" : "Operasional normal"}</span></div>
        <div><small>Printer</small><b><AIcon d={A.cpu} size={18} />{m.printer_state}</b><span>Nozzle: {m.nozzle_result ? `${m.nozzle_result} (${fmt(m.last_nozzle_check)})` : "belum dicek"}</span></div>
      </div>

      <div className="a-g2">
        <div className="a-card low sm a-cons">
          <div className="a-row"><span className="a-lab a-gap"><AIcon d={A.paper} size={20} />Baki Kertas</span><span className={`a-badge ${low(paperPct, paperWarn)}`}>{paperPct}% Tersisa</span></div>
          <div className="h"><span className="big a-num">{paperLeft} <span>/ {s?.paper_capacity ?? "-"} lembar</span></span></div>
          <Meter pct={paperPct} tone={low(paperPct, paperWarn)} />
          <button className="a-btn" onClick={() => act(m.id, "refill", "Isi ulang tercatat. Estimasi kertas dan tinta di-reset.", "Reset estimasi kertas/tinta dan aktifkan mesin?")}><AIcon d={A.plus} size={16} />Isi Ulang Selesai</button>
        </div>
        <div className="a-card low sm a-cons">
          <div className="a-row"><span className="a-lab a-gap"><AIcon d={A.ink} size={20} />Perkiraan Tinta</span><span className="a-sub">Estimasi dari jumlah sisi tercetak</span></div>
          <div className="a-inks">
            <div className="a-ink"><div className="m"><span>Hitam-putih</span><span className="a-num">{bw}%</span></div><Meter pct={bw} tone={low(bw, inkWarn) === "ok" ? "ink" : low(bw, inkWarn)} /></div>
            <div className="a-ink"><div className="m"><span>Warna</span><span className="a-num">{col}%</span></div><Meter pct={col} tone={low(col, inkWarn) === "ok" ? "cyan" : low(col, inkWarn)} /></div>
          </div>
          <span className="a-sub">Peringatan saat ≤ {inkWarn}%. Perkiraan, bukan sensor tinta langsung.</span>
        </div>
      </div>

      <div className="a-row">
        <span className="a-sub a-gap"><AIcon d={A.shield} size={16} />Setiap tindakan admin dicatat di Log Sistem.</span>
        <div className="a-gap">
          <button className="a-btn" disabled={!m.active_order_id} onClick={() => act(m.id, "unlock", "Kunci mesin dilepas.", "Lepas kunci mesin? Order yang sedang berjalan tidak lagi memblokir mesin.")}><AIcon d={A.key} size={16} />Lepas Kunci Manual</button>
          {m.maintenance ? (
            <button className="a-btn ok" onClick={() => act(m.id, "maintenance-off", "Mode perawatan dimatikan.")}><AIcon d={A.check} size={16} />Selesai Perawatan</button>
          ) : (
            <button className="a-btn" onClick={() => act(m.id, "maintenance-on", "Mode perawatan aktif. Kiosk menolak order baru.", "Aktifkan mode perawatan? Kiosk tidak menerima order baru.")}><AIcon d={A.build} size={16} />Mode Perawatan</button>
          )}
          {m.fault && <button className="a-btn danger" onClick={() => act(m.id, "clear-fault", "Status gangguan dihapus.")}><AIcon d={A.alert} size={16} />Hapus Status Gangguan</button>}
        </div>
      </div>

      <details className="a-details">
        <summary><AIcon d={A.terminal} size={16} />Layar kiosk &amp; token agent</summary>
        <div className="a-box" style={{ marginTop: 8 }}>
          <div className="a-field"><label>URL layar kiosk (buka di Chrome mode kiosk pada mesin)</label>
            <div className="a-gap" style={{ flexWrap: "nowrap" }}>
              <input className="a-in mono" readOnly value={m.kioskUrl} onFocus={(e) => e.target.select()} />
              <button className="a-btn" onClick={() => { navigator.clipboard?.writeText(m.kioskUrl).then(() => toast("URL kiosk disalin.")).catch(() => toast("Gagal menyalin.", true)); }}><AIcon d={A.copy} size={16} />Salin</button>
            </div>
          </div>
          <div className="a-gap">
            <button className="a-btn sm" onClick={() => act(m.id, "rotate-token", "Token agent baru dibuat.", "Buat token agent baru? Token lama langsung tidak berlaku.")}><AIcon d={A.key} size={14} />{m.hasAgentToken ? "Ganti Token Agent" : "Buat Token Agent"}</button>
            {m.hasAgentToken && <button className="a-btn sm danger" onClick={() => act(m.id, "revoke-token", "Token agent dicabut.", "Cabut token agent? Agent akan berhenti bekerja.")}>Cabut Token</button>}
            <a className="a-btn sm" href={m.kioskUrl} target="_blank" rel="noreferrer"><AIcon d={A.extern} size={14} />Buka Layar Kiosk</a>
          </div>
        </div>
      </details>
    </section>
  );
}

function CreateMachine({ reload, toast, done, onToken }: { reload: () => void; toast: Toast; done: () => void; onToken: (t: string) => void }) {
  const [name, setName] = useState("Mesin 1");
  const [location, setLocation] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="a-card md">
      <h2 className="a-h2"><AIcon d={A.plus} size={22} />Tambah Mesin</h2>
      <div className="a-g3">
        <div className="a-field"><label>Nama mesin</label><input className="a-in" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="a-field"><label>Kode mesin (kosong = otomatis 001, 002, ...)</label><input className="a-in" value={code} maxLength={8} placeholder="001" onChange={(e) => setCode(e.target.value)} /></div>
        <div className="a-field"><label>Lokasi</label><input className="a-in" value={location} placeholder="Perpustakaan Pusat Lt. 1" onChange={(e) => setLocation(e.target.value)} /></div>
      </div>
      <div className="a-gap">
        <button className="a-btn pri" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ agentToken: string }>("/api/admin/machines", { method: "POST", json: { name, location, code } });
            onToken(r.agentToken);
            toast("Mesin dibuat. Simpan token agent yang tampil.");
            reload();
            done();
          } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
        }}><AIcon d={A.check} size={16} />Buat Mesin</button>
        <button className="a-btn ghost" onClick={done}>Batal</button>
      </div>
    </section>
  );
}
