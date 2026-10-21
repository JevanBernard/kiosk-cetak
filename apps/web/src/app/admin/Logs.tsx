"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { A, AIcon, PageHead, fmtDay } from "./ui";

const LABEL: Record<string, string> = {
  login: "Login admin",
  "settings.update": "Pengaturan diubah",
  "machine.create": "Mesin dibuat",
  "machine.refill": "Isi ulang tercatat",
  "machine.unlock": "Kunci mesin dilepas",
  "machine.maintenance-on": "Mode perawatan aktif",
  "machine.maintenance-off": "Mode perawatan dimatikan",
  "machine.clear-fault": "Status gangguan dihapus",
  "machine.token": "Token agent diganti",
  "machine.revoke-token": "Token agent dicabut",
  "refund.done": "Refund diselesaikan",
  "refund.reprint": "Cetak ulang order",
};

function brief(d: unknown) {
  if (!d || typeof d !== "object") return "";
  const s = JSON.stringify(d);
  return s.length > 140 ? s.slice(0, 140) + "…" : s;
}

export default function Logs() {
  const [data, setData] = useState<{ audit: any[]; alerts: any[] } | null>(null);
  const [tab, setTab] = useState<"audit" | "alerts">("audit");
  useEffect(() => { api<{ audit: any[]; alerts: any[] }>("/api/admin/log").then(setData).catch(() => setData({ audit: [], alerts: [] })); }, []);
  const rows = tab === "audit" ? data?.audit : data?.alerts;
  return (
    <>
      <PageHead kicker="Sistem" title="Log Sistem" sub="Jejak audit tindakan admin dan alert operasional. Menampilkan 100 entri terbaru." />
      <section className="a-card md">
        <div className="a-seg" style={{ alignSelf: "flex-start" }}>
          <button className={tab === "audit" ? "on" : ""} onClick={() => setTab("audit")}>Audit Tindakan Admin</button>
          <button className={tab === "alerts" ? "on" : ""} onClick={() => setTab("alerts")}>Alert Operasional</button>
        </div>
        {!data && <div className="a-empty">Memuat...</div>}
        <div className="a-gap" style={{ flexDirection: "column", alignItems: "stretch" }}>
          {tab === "audit" && data?.audit.map((a) => (
            <div key={a.id} className="a-log">
              <div className="l"><AIcon d={A.shield} size={18} /><div><b>{LABEL[a.action] ?? a.action}</b><span>Oleh: {a.actor}{brief(a.detail) ? ` · ${brief(a.detail)}` : ""}</span></div></div>
              <time>{fmtDay(a.created_at)}</time>
            </div>
          ))}
          {tab === "alerts" && data?.alerts.map((a) => (
            <div key={a.id} className="a-log">
              <div className="l"><AIcon d={A.bell} size={18} /><div><b>{a.message}</b><span>{a.kind} · {a.sent ? "terkirim ke Telegram" : "belum terkirim"}</span></div></div>
              <time>{fmtDay(a.created_at)}</time>
            </div>
          ))}
        </div>
        {data && rows?.length === 0 && <div className="a-empty">Belum ada catatan.</div>}
      </section>
    </>
  );
}
