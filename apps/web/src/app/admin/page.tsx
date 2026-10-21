"use client";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/client";
import { Brand } from "../brand";
import Logs from "./Logs";
import Monitoring from "./Monitoring";
import Pricing from "./Pricing";
import Reports from "./Reports";
import Tickets from "./Tickets";
import { A, AIcon, fmt, jakarta, useToast, type Overview } from "./ui";

const NAV = [
  { key: "dashboard", label: "Dashboard & Monitoring", icon: A.grid },
  { key: "riwayat", label: "Riwayat & Laporan", icon: A.receipt },
  { key: "tiket", label: "Antrean & Tiket", icon: A.ticket },
  { key: "harga", label: "Pengaturan & Harga", icon: A.tune },
  { key: "log", label: "Log Sistem", icon: A.terminal },
] as const;
type Tab = (typeof NAV)[number]["key"];

export default function AdminPage() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    try {
      setOv(await api<Overview>("/api/admin/overview"));
      setLoadedAt(Date.now());
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
  if (!ov) {
    return (
      <div className={`a-root ${jakarta.variable}`}>
        <div className="a-login"><div className="a-card md" style={{ alignItems: "center" }}><div className="a-sub">Memuat dashboard...</div></div></div>
      </div>
    );
  }

  const tickets = ov.refunds.length;
  const ready = ov.machines.filter((m) => m.availability.state === "available").length;
  const allReady = ov.machines.length > 0 && ready === ov.machines.length;
  const tickStale = !ov.lastTick || Date.now() - new Date(ov.lastTick).getTime() > 5 * 60_000;
  const go = (t: string) => { setTab(t as Tab); setOpen(false); };

  return (
    <div className={`a-root ${jakarta.variable}`}>
      <div className={`a-scrim${open ? " open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`a-side${open ? " open" : ""}`}>
        <div className="a-side-top">
          <div className="a-brand"><Brand size={36} tagline="Admin Console" /></div>
          <div className="a-cluster">
            <span className="l"><span className={`a-dot${allReady ? "" : ov.machines.length ? " warn" : " bad"}`} />{ready} / {ov.machines.length} Kiosk Siap</span>
            <span className={`r${allReady ? "" : " bad"}`}>{allReady ? "Normal" : "Cek"}</span>
          </div>
          <nav className="a-nav">
            {NAV.map((n) => (
              <button key={n.key} className={tab === n.key ? "on" : ""} onClick={() => go(n.key)}>
                <span className="t"><AIcon d={n.icon} size={20} />{n.label}</span>
                {n.key === "tiket" && tickets > 0 && <span className="bdg">{tickets}</span>}
              </button>
            ))}
          </nav>
        </div>
        <div className="a-side-bot">
          <div className={`a-gate${tickStale ? " bad" : ""}`}>
            <AIcon d={A.cloud} size={18} />
            <div><small>Pekerjaan Terjadwal</small><b>{tickStale ? `Berhenti sejak ${fmt(ov.lastTick)}` : "Berjalan normal"}</b></div>
          </div>
        </div>
      </aside>

      <div className="a-body">
        <header className="a-top">
          <button className="a-burger" onClick={() => setOpen(true)} aria-label="Buka menu"><AIcon d={A.menu} size={20} /></button>
          <form className="a-search" onSubmit={(e) => { e.preventDefault(); setSearchQ(q.trim()); go("riwayat"); }}>
            <AIcon d={A.search} size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode transaksi..." />
          </form>
          <div className="a-top-r">
            <div className="a-live"><span className="a-dot" />Diperbarui {loadedAt ? new Date(loadedAt).toLocaleTimeString("id-ID") : "-"}</div>
            <button className="a-ibtn" onClick={() => go("tiket")} aria-label="Antrean tiket" title={tickets ? `${tickets} tiket menunggu` : "Tidak ada tiket"}>
              <AIcon d={A.bell} size={20} />{tickets > 0 && <span className="dot" />}
            </button>
            <div className="a-user">
              <div className="a-avatar"><AIcon d={A.user} size={18} /></div>
              <div><b>Admin</b><small>{ov.admin}</small></div>
            </div>
            <button className="a-ibtn" aria-label="Keluar" title="Keluar" onClick={async () => { await api("/api/admin/logout", { method: "POST" }); load(); }}><AIcon d={A.logout} size={20} /></button>
          </div>
        </header>

        <main className="a-main">
          <div className="a-wrap">
            {tickStale && (
              <div className="a-banner"><AIcon d={A.alert} size={18} /><span>Pekerjaan terjadwal (kedaluwarsa, hapus file, rekonsiliasi) tidak berjalan sejak {fmt(ov.lastTick)}. Periksa cron dan agent.</span></div>
            )}
            {tab === "dashboard" && <Monitoring ov={ov} reload={load} toast={showToast} go={go} />}
            {tab === "riwayat" && <Reports initialQ={searchQ} />}
            {tab === "tiket" && <Tickets ov={ov} reload={load} toast={showToast} />}
            {tab === "harga" && <Pricing ov={ov} reload={load} toast={showToast} />}
            {tab === "log" && <Logs />}
          </div>
        </main>
      </div>
      {toast}
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className={`a-root ${jakarta.variable}`}>
      <div className="a-login">
        <form
          className="a-card md"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr("");
            try {
              await api("/api/admin/login", { method: "POST", json: { email, password } });
              onDone();
            } catch (x: any) {
              setErr(x.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="a-brand" style={{ padding: 0, height: "auto" }}><Brand size={48} tagline="Admin Console" /></div>
          <div><h1 className="a-h2">Masuk sebagai admin</h1><p className="a-sub" style={{ marginTop: 4 }}>Gunakan akun admin yang terdaftar. Sesi berakhir otomatis.</p></div>
          <div className="a-field"><label>Email</label><input className="a-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></div>
          <div className="a-field"><label>Password</label><input className="a-in" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></div>
          {err && <div className="a-err">{err}</div>}
          <button className="a-btn pri block" type="submit" disabled={busy} style={{ minHeight: "3rem" }}>{busy ? "Memeriksa..." : "Masuk"}</button>
        </form>
      </div>
    </div>
  );
}
