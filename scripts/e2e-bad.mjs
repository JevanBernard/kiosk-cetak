// Uji file palsu: berekstensi DOCX tetapi isinya bukan dokumen Word.
import { createHmac } from "node:crypto";
const BASE = "http://localhost:3001", MID = process.env.MACHINE_ID;
const key = createHmac("sha256", process.env.CRON_SECRET).update("kiosk:" + MID).digest("hex").slice(0, 20);
let cookie = "";
const j = async (p, i = {}) => { const r = await fetch(BASE + p, { ...i, redirect: "manual", headers: { cookie, ...(i.json ? { "content-type": "application/json" } : {}) }, body: i.json ? JSON.stringify(i.json) : i.body }); const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0]; return { s: r.status, d: await r.json().catch(() => ({})) }; };
const k = (await j(`/api/kiosk/${MID}?k=${key}`)).d;
await j("/s/" + k.qrUrl.split("/s/")[1]);
const bytes = Buffer.from("PK\x03\x04 ini bukan dokumen word asli");
const slot = (await j("/api/order/files", { method: "POST", json: { name: "palsu.docx", size: bytes.length, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } })).d;
const f = new FormData(); f.append("cacheControl", "3600"); f.append("", new Blob([bytes]));
await fetch(slot.uploadUrl, { method: "PUT", body: f });
await j(`/api/order/files/${slot.fileId}`, { method: "POST" });
for (let i = 0; i < 30; i++) { const v = (await j("/api/order")).d.view; const x = v.files[0]; if (x.status === "error") { console.log("ditolak:", x.error); await j(`/api/order/files/${slot.fileId}`, { method: "DELETE" }); await j("/api/order/cancel", { method: "POST" }); process.exit(0); } await new Promise(r => setTimeout(r, 1000)); }
console.log("TIDAK ditolak"); process.exit(1);
