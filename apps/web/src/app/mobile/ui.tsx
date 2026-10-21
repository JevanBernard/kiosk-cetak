"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./m.css";

export const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta", display: "swap" });

export const I = {
  print: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z",
  check: "M5 13l4 4L19 7",
  checkCircle: "M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  upload: "M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5M12 12v8M9 15l3-3 3 3",
  plus: "M12 5v14M5 12h14",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
  slides: "M3 4h18v12H3zM12 16v4M8 20h8M8 9l3 2-3 2z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  info: "M12 11v5M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2",
  timer: "M12 8v5l3 2M9 2h6M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
  hourglass: "M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  copy: "M9 9h10v11H9zM5 15V4h10",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  share: "M12 3v12M8 7l4-4 4 4M5 13v7h14v-7",
  chat: "M4 5h16v11H9l-5 4zM8 10h8",
  help: "M12 17h.01M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  sync: "M5 12a7 7 0 0 1 12-4.9M19 12a7 7 0 0 1-12 4.9M17 3v4h-4M7 21v-4h4",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  paper: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  ink: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  duplex: "M7 7h13l-4-4M17 17H4l4 4",
  alert: "M12 8v5M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  qr: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16",
  cancel: "M15 9l-6 6M9 9l6 6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  tray: "M3 14l3-8h12l3 8v5H3zM3 14h5l1 2h6l1-2h5",
};

export function MIcon({ d, size = 20, className = "m-ico" }: { d: string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export type MachineInfo = { name: string; code: string | null; location: string | null };

/** Label singkat mesin: "Kiosk #001 · Perpustakaan". */
export const machineLabel = (m: MachineInfo | null | undefined) =>
  m ? `${m.code ? `Kiosk #${m.code}` : m.name}${m.location ? ` · ${m.location}` : ""}` : "KioskCetak";

const STEPS = ["Unggah", "Opsi", "Bayar", "Ambil"];

/** `step` 1-4 = langkah aktif; 5 = semua selesai. */
export function Stepper({ step }: { step: number }) {
  return (
    <div className="m-card m-stepper">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={label} className="m-step-wrap">
            <div className={`m-step${done ? " done" : active ? " active" : ""}`}>
              <span className="c">{done ? <MIcon d={I.check} size={16} /> : n}</span>
              <span className="l">{n}. {label}</span>
            </div>
            {n < 4 && <i className={`m-step-line${done ? " done" : ""}`} />}
          </div>
        );
      })}
    </div>
  );
}

export function useCountdown(iso: string | null | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return iso ? Math.max(0, (new Date(iso).getTime() - now) / 1000) : null;
}

export const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 2400);
  }, []);
  const node = (
    <div className={`m-toast${msg ? " on" : ""}`} role="status">
      <MIcon d={I.checkCircle} size={18} />
      <span>{msg}</span>
    </div>
  );
  return [node, show] as const;
}

/** Kerangka halaman HP: header tetap, konten terpusat, dock bawah opsional. */
export function Shell({
  tag, machine, sessionLeft, children, dock,
}: {
  tag: string;
  machine?: MachineInfo | null;
  sessionLeft?: number | null;
  children: React.ReactNode;
  dock?: React.ReactNode;
}) {
  return (
    <div className={`m-root ${jakarta.variable}`}>
      <header className="m-header">
        <div className="m-header-in">
          <a className="m-brand" href="/" aria-label="KioskCetak">
            <div className="m-logo"><MIcon d={I.print} size={20} /></div>
            <div className="m-brand-t">
              <div className="r"><b>KioskCetak</b><span className="m-tag">{tag}</span></div>
              <div className="s"><span className="m-dot" /><span>{machineLabel(machine)}</span></div>
            </div>
          </a>
          {sessionLeft != null && (
            <div className={`m-chip${sessionLeft < 60 ? " warn" : ""}`} title="Sisa waktu sesi">
              <MIcon d={I.timer} size={14} />
              <span className="m-num">{mmss(sessionLeft)}</span>
            </div>
          )}
        </div>
      </header>
      <main className={`m-main${dock ? " has-dock" : ""}`}>{children}</main>
      {dock && <div className="m-dock"><div className="m-dock-in">{dock}</div></div>}
    </div>
  );
}
