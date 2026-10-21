"use client";
import { useCallback, useRef, useState } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./admin.css";

export const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta", display: "swap" });

export type Machine = any;
export type Overview = {
  admin: string;
  machines: Machine[];
  today: { orders: number; revenue: number };
  active: any[];
  refunds: any[];
  alerts: any[];
  lastTick: string | null;
};

export const A = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  ticket: "M4 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h16v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H4zM14 6v12",
  tune: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6",
  terminal: "M4 17l6-6-6-6M12 19h8",
  print: "M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  bell: "M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 0 0 4 0",
  logout: "M9 4H5v16h4M16 8l4 4-4 4M20 12H9",
  sync: "M5 12a7 7 0 0 1 12-4.9M19 12a7 7 0 0 1-12 4.9M17 3v4h-4M7 21v-4h4",
  paper: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  ink: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2",
  unlock: "M7 11V8a5 5 0 0 1 9.5-2M5 11h14v10H5z",
  key: "M15 7a4 4 0 1 1-3.6 5.7L4 20v-3h3v-3h3l1.3-1.3A4 4 0 0 1 15 7zM16 9h.01",
  build: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z",
  check: "M5 13l4 4L19 7",
  checkCircle: "M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  alert: "M12 8v5M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  money: "M3 6h18v12H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 9v.01M18 15v.01",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4",
  cloud: "M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5 4 4 0 0 1 17.5 18zM9 14l2 2 4-4",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  copy: "M9 9h10v11H9zM5 15V4h10",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  plus: "M12 5v14M5 12h14",
  chart: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3",
  store: "M4 9l1-5h14l1 5M4 9v11h16V9M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M10 20v-5h4v5",
  eco: "M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19c2-5 5-8 9-10",
  extern: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  chat: "M4 5h16v11H9l-5 4zM8 10h8",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  hourglass: "M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  duplex: "M7 7h13l-4-4M17 17H4l4 4",
  cpu: "M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
};

export function AIcon({ d, size = 20, className = "a-ico" }: { d: string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "-");
export const fmtDay = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Kelas warna lencana per status order. */
export function statusTone(s: string): "ok" | "warn" | "bad" | "info" | "mute" {
  if (["SELESAI", "DIREFUND"].includes(s)) return "ok";
  if (["MENUNGGU_BAYAR", "CETAK_ULANG"].includes(s)) return "warn";
  if (["GAGAL_CETAK", "MENUNGGU_REFUND"].includes(s)) return "bad";
  if (["LUNAS", "MENCETAK", "DIUPLOAD", "DIATUR", "DIBUAT"].includes(s)) return "info";
  return "mute";
}
export const availTone = (s: string) => (s === "available" ? "ok" : s === "busy" ? "warn" : "bad");
export const availLabel = (s: string) => (s === "available" ? "Online & Siap" : s === "busy" ? "Sedang Dipakai" : "Tidak Tersedia");

export function useToast() {
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((text: string, bad = false) => {
    setToast({ text, bad });
    clearTimeout(t.current);
    t.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const node = (
    <div className={`a-toast${toast ? " on" : ""}${toast?.bad ? " bad" : ""}`} role="status">
      <AIcon d={toast?.bad ? A.alert : A.checkCircle} size={18} />
      <span>{toast?.text}</span>
    </div>
  );
  return [node, show] as const;
}

export function Meter({ pct, tone = "primary" }: { pct: number; tone?: "primary" | "ok" | "warn" | "bad" | "cyan" | "ink" }) {
  return (
    <div className="a-meter"><i className={tone} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
  );
}

export function PageHead({ kicker, title, sub, right }: { kicker: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="a-head">
      <div>
        <div className="a-kicker">{kicker}</div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {right && <div className="a-head-r">{right}</div>}
    </div>
  );
}
