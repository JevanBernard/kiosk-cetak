"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import QRCode from "qrcode";
import { KIOSK_TOKEN_ROTATE_SECONDS, MAX_FILE_BYTES, formatRupiah, type PriceConfig } from "@kioskcetak/shared";
import "../kiosk.css";
import { DraftScreen, PayScreen, type KioskView } from "./Draft";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta", display: "swap" });

type KioskState = {
  name: string;
  code: string | null;
  location: string | null;
  availability: { state: "available" | "busy" | "unavailable"; reason: string | null };
  hardware: { paperLeft: number; paperCapacity: number; inkBw: number; inkColor: number; duplex: boolean; color: boolean };
  adminWhatsapp: string | null;
  qrUrl: string | null;
  qrRotatesAt: string | null;
  phoneConnected: boolean;
  order: { status: string; code: string; payExpiresAt: string | null; total: number } | null;
  view: KioskView | null;
  config: PriceConfig;
  capabilities: { duplex: boolean; color: boolean };
  qr: { qrString: string; amount: number } | null;
  progress: { status: string; attempt: number } | null;
  finished: { code: string } | null;
  prices: { bw: number; bwDuplex: number; color: number; colorDuplex: number };
};

const ICONS = {
  print: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z",
  check: "M5 13l4 4L19 7",
  checkCircle: "M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  alert: "M12 8v5M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  scan: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16",
  terminal: "M4 17l6-6-6-6M12 19h8",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  paper: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  ink: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  duplex: "M7 7h13l-4-4M17 17H4l4 4",
  unlock: "M7 11V8a5 5 0 0 1 9.5-2M5 11h14v10H5z",
  refresh: "M20 11a8 8 0 0 0-14.5-3M4 5v3.5h3.5M4 13a8 8 0 0 0 14.5 3M20 19v-3.5h-3.5",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4",
  sync: "M5 12a7 7 0 0 1 12-4.9M19 12a7 7 0 0 1-12 4.9M17 3v4h-4M7 21v-4h4",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  tv: "M3 5h18v12H3zM8 21h8M12 17v4",
  support: "M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1v-4zM20 14h-3v5h2a1 1 0 0 0 1-1v-4zM17 19c0 1.5-2 2-5 2",
  clockSm: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
};

function Icon({ d, size = 24, className = "k-ico" }: { d: string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Layar sentuh kiosk. HP pengguna hanya dipakai untuk mengunggah dokumen (FR-KSK-03), membayar QRIS lewat
 * aplikasi e-wallet, dan mengunduh nota. Preview, pengaturan cetak, ringkasan harga, dan QRIS ada di layar ini.
 */
export default function KioskPage({ params }: { params: { machineId: string } }) {
  const [s, setS] = useState<KioskState | null>(null);
  const [qrImg, setQrImg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState<string | null>(null); // kode transaksi yang layar "Selesai"-nya sudah ditutup

  const [keyRaw, setKey] = useState<string | null>(null); // null = belum dibaca dari URL
  useEffect(() => setKey(new URLSearchParams(window.location.search).get("k") ?? ""), []);
  const key = keyRaw ?? "";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk/${params.machineId}?k=${encodeURIComponent(key)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setS(json);
      setErr(null);
    } catch (e: any) {
      setErr(e.message || "Tidak terhubung ke server");
    }
  }, [params.machineId, key]);

  useEffect(() => {
    if (keyRaw === null) return;
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh, keyRaw]);

  async function cancel() {
    await fetch(`/api/kiosk/${params.machineId}/cancel?k=${encodeURIComponent(key)}`, { method: "POST" }).catch(() => {});
    await refresh();
  }

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

  const clock = new Date(now).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":");
  const termLabel = s?.code ? `Terminal #${s.code}` : s?.name ?? "Kiosk";
  const hw = s?.hardware;
  const paperPct = hw ? Math.round((hw.paperLeft / Math.max(1, hw.paperCapacity)) * 100) : 0;
  const state = s?.availability.state;
  const online = state && !(state === "unavailable" && s?.availability.reason === "Mesin offline");

  const header = (
    <header className="k-header">
      <div className="k-header-in">
        <div className="k-left">
          <div className="k-brand">
            <div className="k-logo"><Icon d={ICONS.print} size={24} /></div>
            <div><b>KioskCetak</b><small>Layanan Cetak Mandiri</small></div>
          </div>
          {s && (
            <div className="k-term">
              <Icon d={ICONS.terminal} size={18} />
              <span>{termLabel}</span>
              {s.location && (<><span className="sep">•</span><Icon className="k-ico m" d={ICONS.pin} size={16} /><span className="loc">{s.location}</span></>)}
            </div>
          )}
        </div>
        <div className="k-right">
          {s && hw && (
            <div className="k-hw">
              <span style={{ color: online ? "var(--k-tertiary-c)" : "var(--k-bad)" }}><span className="k-dot" /><span style={{ color: "var(--k-ink)" }}>{online ? "Online" : "Offline"}</span></span>
              <span className="div">|</span>
              <span className="mut"><Icon d={ICONS.paper} size={16} />A4 {paperPct}%</span>
              <span className="div">|</span>
              <span className="mut"><Icon d={ICONS.ink} size={16} />Tinta {Math.min(hw.inkBw, hw.inkColor)}%</span>
            </div>
          )}
          <div className="k-clock k-num"><Icon d={ICONS.clockSm} size={18} />{clock} WIB</div>
        </div>
      </div>
    </header>
  );

  const footer = (
    <footer className="k-foot">
      <div className="k-foot-in">
        <span><Icon d={ICONS.shield} size={18} />Transaksi aman terenkripsi QRIS{s?.code ? ` • Kiosk ID: KCK-${s.code}` : ""}</span>
        <span>© {new Date(now).getFullYear()} KioskCetak</span>
      </div>
    </footer>
  );

  const shell = (children: React.ReactNode) => (
    <div className={`k-root ${jakarta.variable}`}>
      {header}
      {children}
      {footer}
      {err && s && <div className="k-reconnect">Koneksi bermasalah, mencoba lagi...</div>}
    </div>
  );
  const center = (children: React.ReactNode) => (
    <main className="k-main"><div className="k-center">{children}</div></main>
  );

  if (err && !s) {
    return shell(center(
      <>
        <div className="k-hero-icon bad"><Icon d={ICONS.alert} size={56} /></div>
        <h1 className="k-title">Layar belum dapat dipakai</h1>
        <p className="k-sub">{err}</p>
      </>,
    ));
  }
  if (!s) return shell(center(<><div className="k-spin" /><h1 className="k-title">Memuat...</h1></>));

  const st = s.order?.status;
  const left = s.order?.payExpiresAt ? (new Date(s.order.payExpiresAt).getTime() - now) / 1000 : 0;

  if (st === "MENUNGGU_BAYAR") {
    return shell(<PayScreen qrString={s.qr?.qrString ?? null} amount={s.order!.total} code={s.order!.code} left={left} onCancel={cancel} />);
  }
  if (st && ["DIBUAT", "DIUPLOAD", "DIATUR"].includes(st)) {
    return shell(
      <DraftScreen machineId={params.machineId} kioskKey={key} refresh={refresh} view={s.view} config={s.config} caps={s.capabilities ?? { duplex: false, color: false }} onCancel={cancel} />,
    );
  }
  if (st && ["LUNAS", "MENCETAK", "CETAK_ULANG"].includes(st)) {
    const title = st === "LUNAS" ? "Pembayaran diterima" : st === "CETAK_ULANG" ? "Mencoba mencetak ulang..." : "Sedang mencetak...";
    return shell(center(
      <>
        {st === "LUNAS" ? (
          <div className="k-hero-icon ok"><Icon d={ICONS.check} size={56} /></div>
        ) : (
          <div className="k-spin"><Icon d={ICONS.print} size={40} /></div>
        )}
        <h1 className="k-title">{title}</h1>
        <p className="k-sub">Mohon tunggu, kertas akan keluar di nampan.</p>
      </>,
    ));
  }
  if (s.finished && s.finished.code !== dismissed) {
    return shell(center(
      <>
        <div className="k-hero-icon ok"><Icon d={ICONS.check} size={56} /></div>
        <h1 className="k-title">Selesai! <em>Ambil dokumen</em> di nampan</h1>
        <p className="k-sub">Kode transaksi</p>
        <div className="k-card md k-code k-num">{s.finished.code}</div>
        <button className="k-btn primary k-done" onClick={() => setDismissed(s.finished!.code)}>Selesai</button>
        <p className="k-sub" style={{ fontSize: "1rem" }}>Layar kembali otomatis dalam beberapa detik.</p>
      </>,
    ));
  }
  if (state === "unavailable") {
    return shell(center(
      <>
        <div className="k-hero-icon bad"><Icon d={ICONS.alert} size={56} /></div>
        <h1 className="k-title">Mesin belum bisa dipakai</h1>
        <p className="k-sub">{s.availability.reason}</p>
        <p className="k-sub" style={{ fontSize: "1rem" }}>Mohon maaf. Silakan coba lagi nanti.</p>
      </>,
    ));
  }
  if (state === "busy") {
    return shell(center(
      <>
        <div className="k-spin"><Icon d={ICONS.print} size={40} /></div>
        <h1 className="k-title">Mesin sedang dipakai</h1>
        <p className="k-sub">Tunggu sebentar, layar akan kembali otomatis.</p>
      </>,
    ));
  }

  // Beranda: mesin siap dipakai
  const rotSec = s.qrRotatesAt ? Math.max(0, Math.ceil((new Date(s.qrRotatesAt).getTime() - now) / 1000)) : 0;
  const rotPct = Math.min(100, (rotSec / KIOSK_TOKEN_ROTATE_SECONDS) * 100);
  const saving = s.prices.bw > 0 ? Math.round((1 - s.prices.bwDuplex / s.prices.bw) * 100) : 0;
  const waText = encodeURIComponent(`Halo Petugas, saya butuh bantuan di ${termLabel}${s.location ? ` (${s.location})` : ""}`);
  const steps: [string, string][] = [
    ["Scan QR dari HP", "Buka kamera atau pemindai QR. Tanpa download aplikasi ataupun instalasi."],
    ["Unggah Dokumen dari HP", "Pilih PDF, DOCX, PPTX, atau gambar dari HP Anda."],
    ["Atur Cetak di Layar Ini", "Lihat preview, pilih warna, bolak-balik, dan jumlah salinan."],
    ["Bayar QRIS, Ambil Hasil", "Scan QRIS di layar dengan e-wallet. Nota bisa diunduh di HP."],
  ];

  return shell(
    <main className="k-page">
      {/* Identitas mesin */}
      <section className="k-card k-id">
        <div className="k-id-l">
          <div className="k-id-ico"><Icon d={ICONS.print} size={28} /></div>
          <div>
            <h2>
              Terminal Kiosk{s.code ? ` #${s.code}` : ""}
              {s.location && (<><span className="sep">•</span><span className="loc">{s.location}</span></>)}
            </h2>
            <div className="k-id-badges">
              <span className="k-badge"><span className="k-dot" />Mesin Siap &amp; Tersedia</span>
              <span className="k-id-sub">{s.name}</span>
            </div>
          </div>
        </div>
        <div className="k-chips">
          {hw && (
            <>
              <div className="k-hwchip">
                <Icon d={ICONS.paper} size={20} />
                <div><small>Kertas Baki 1</small><b>A4 (~{hw.paperLeft} lbr)</b></div>
              </div>
              <div className="k-hwchip">
                <Icon d={ICONS.ink} size={20} />
                <div><small>Tinta Cetak</small><b className="k-num">Hitam {hw.inkBw}% · Warna {hw.inkColor}%</b></div>
              </div>
              <div className="k-hwchip">
                <Icon d={ICONS.duplex} size={20} />
                <div><small>Kemampuan</small><b>{hw.duplex ? "Auto-Duplex Aktif" : "Satu Sisi"}{hw.color ? " • Warna" : ""}</b></div>
              </div>
            </>
          )}
          <div className="k-hwchip hi">
            <Icon d={ICONS.unlock} size={20} />
            <div><small>Akses</small><b>Tanpa Login • Mandiri</b></div>
          </div>
        </div>
      </section>

      <div className="k-grid">
        {/* Hero QR */}
        <section className="k-card md k-hero">
          <span className="k-glow a" />
          <span className="k-glow b" />
          <div className="k-copy">
            <div className="k-toprow">
              <div className="l">
                <span className="k-pill fixed"><Icon d={ICONS.scan} size={16} />Sesi QR Aman</span>
              </div>
              <span className="k-pill high">
                <Icon className="k-spinicon" d={ICONS.refresh} size={18} />
                Berotasi: <b className="k-num">00:{pad(rotSec)}</b>
              </span>
            </div>
            <h1 className="k-h1">Scan QR Menggunakan Kamera HP Anda</h1>
            <p className="k-lead">Tanpa perlu unduh aplikasi atau mendaftar. Scan QR di bawah, unggah dokumen dari HP, lalu atur cetak dan bayar langsung di layar ini.</p>
          </div>

          <div className="k-scanbox">
            <div className="k-qrcol">
              <div className="k-qrwrap">
                <i /><i /><i /><i />
                {qrImg ? <img className="k-qr" src={qrImg} alt="Scan untuk mulai" /> : <div className="k-qr-ph">Menyiapkan QR...</div>}
                {qrImg && <span className="k-scanline" />}
                {s.phoneConnected && (
                  <div className="k-linked">
                    <div className="k-hero-icon ok" style={{ width: "5rem", height: "5rem" }}><Icon d={ICONS.check} size={40} /></div>
                    <b>HP terhubung</b>
                    <p>Unggah dokumen di HP kamu.</p>
                  </div>
                )}
              </div>
              <div className="k-cycle">
                <div className="k-bar"><i style={{ width: `${rotPct}%` }} /></div>
                <div className="t"><span>Refresh Otomatis</span><span>Siklus {KIOSK_TOKEN_ROTATE_SECONDS} Detik</span></div>
              </div>
            </div>
          </div>

          <div className="k-privacy">
            <div className="ic"><Icon d={ICONS.shield} size={20} /></div>
            <div>
              <b>Privasi Terjamin</b>
              <p>Dokumen Anda tidak dibaca orang lain dan otomatis dihapus segera setelah pencetakan selesai.</p>
            </div>
          </div>
        </section>

        {/* Kolom kanan */}
        <div className="k-side">
          <section className="k-card k-panel">
            <div className="k-panel-h">
              <h2><Icon d={ICONS.sync} size={22} />Status Sesi Kiosk</h2>
              <span className={`k-pill ${s.phoneConnected ? "" : "high"}`} style={s.phoneConnected ? { background: "#ecfdf5", color: "#047857" } : undefined}>
                <span className="k-dot" style={{ width: ".5rem", height: ".5rem", color: s.phoneConnected ? "var(--k-ok)" : "var(--k-cyan)" }} />
                {s.phoneConnected ? "HP Terhubung" : "Menunggu Pengguna..."}
              </span>
            </div>
            <div className="k-sync">
              <div className="ic"><Icon d={ICONS.phone} size={24} /></div>
              <div>
                <b>Sinkronisasi Realtime Display</b>
                <p>Begitu QR di-scan, layar ini otomatis menandai bahwa HP Anda sudah terhubung dan mesin dikunci khusus untuk sesi Anda.</p>
              </div>
            </div>
          </section>

          <section className="k-card k-panel" style={{ flex: 1 }}>
            <div className="k-panel-h">
              <h2>Cara Cetak Mandiri</h2>
              <span className="tag">Cepat &amp; Praktis</span>
            </div>
            <div className="k-steps">
              {steps.map(([t, d], i) => (
                <div key={t} className={`k-step${i === 0 ? " on" : i === steps.length - 1 ? " end" : ""}`}>
                  <div className="n">{i + 1}</div>
                  <div><b>{t}</b><span>{d}</span></div>
                </div>
              ))}
            </div>
          </section>

          <section className="k-card k-panel">
            <div className="k-panel-h">
              <span className="k-tarif-h">Transparansi Tarif &amp; Dokumen</span>
              {saving > 0 && <span className="k-save">Hemat {saving}% Duplex</span>}
            </div>
            <div className="k-prices">
              <div className="k-price"><small>Hitam Putih (B&amp;W)</small><b className="k-num">{formatRupiah(s.prices.bw)} <span>/ sisi</span></b></div>
              <div className="k-price c"><small>Warna Penuh (Color)</small><b className="k-num">{formatRupiah(s.prices.color)} <span>/ sisi</span></b></div>
              <div className="k-price"><small>B&amp;W Bolak-balik</small><b className="k-num">{formatRupiah(s.prices.bwDuplex)} <span>/ sisi</span></b></div>
              <div className="k-price c"><small>Warna Bolak-balik</small><b className="k-num">{formatRupiah(s.prices.colorDuplex)} <span>/ sisi</span></b></div>
            </div>
            <div className="k-formats">
              <span><Icon d={ICONS.checkCircle} size={16} />Format: <strong>PDF, DOCX, PPTX, JPG, PNG</strong> (Maks {Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)</span>
              <span style={{ fontSize: ".625rem", fontWeight: 700 }}>Upload PDF untuk hasil paling akurat</span>
            </div>
          </section>
        </div>
      </div>

      <section className="k-card k-bottom">
        <div className="info">
          <div className="ic"><Icon d={ICONS.tv} size={20} /></div>
          <p><strong>Info Layar:</strong> HP dipakai untuk mengunggah dokumen. Pengaturan cetak, preview, dan pembayaran dilakukan di layar ini.</p>
        </div>
        {s.adminWhatsapp && (
          <a className="k-help" href={`https://wa.me/${s.adminWhatsapp}?text=${waText}`} target="_blank" rel="noopener noreferrer">
            <Icon d={ICONS.support} size={18} />Bantuan Petugas Kiosk
          </a>
        )}
      </section>
    </main>,
  );
}
