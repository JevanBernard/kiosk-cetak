// Uji alur penuh lewat HTTP seperti HP pengguna. Jalankan dari root repo:
// node --env-file=apps/web/.env.local <path>/e2e.mjs
import { createHmac } from "node:crypto";
import { PDFDocument } from "pdf-lib";

const BASE = "http://localhost:3001";
const MID = process.env.MACHINE_ID;
const key = createHmac("sha256", process.env.CRON_SECRET).update("kiosk:" + MID).digest("hex").slice(0, 20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cookie = "";
const step = (m) => console.log("•", m);
async function j(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, redirect: "manual", headers: { ...(init.json ? { "content-type": "application/json" } : {}), cookie, ...init.headers }, body: init.json ? JSON.stringify(init.json) : init.body });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, res };
}
async function until(fn, label, ms = 60000) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error("timeout: " + label); await sleep(1000); }
}

// 0. mesin harus Tersedia
let k = await until(async () => { const r = await j(`/api/kiosk/${MID}?k=${key}`); return r.data.availability?.state === "available" ? r.data : null; }, "mesin tersedia");
step("kiosk tersedia, QR: " + k.qrUrl);

// 1. scan QR
const tok = k.qrUrl.split("/s/")[1];
let r = await j(`/s/${tok}`);
step(`scan -> ${r.status} ${r.res.headers.get("location")}`);
r = await j(`/s/${tok}`); // token sekali pakai
step(`scan ulang token yang sama -> ${r.res.headers.get("location")} (harus ?e=qr)`);
r = await j("/api/order");
step(`GET /api/order -> ${r.status} mesin=${r.data.machine?.availability?.state}`);

// 2. buat PDF 6 halaman, upload
const doc = await PDFDocument.create();
for (let i = 0; i < 6; i++) { const p = doc.addPage([595, 842]); p.drawText("Halaman " + (i + 1), { x: 50, y: 700, size: 30 }); }
const bytes = await doc.save();
r = await j("/api/order/files", { method: "POST", json: { name: "tugas.pdf", size: bytes.length, mime: "application/pdf" } });
if (r.status !== 200) throw new Error("slot: " + JSON.stringify(r.data));
const { fileId, uploadUrl } = r.data;
const form = new FormData(); form.append("cacheControl", "3600"); form.append("", new Blob([bytes]));
const up = await fetch(uploadUrl, { method: "PUT", body: form });
step(`upload ke Storage -> ${up.status}`);
r = await j(`/api/order/files/${fileId}`, { method: "POST" });
step(`konfirmasi upload -> ${r.status}`);

// 3. tunggu agent memproses
const ready = await until(async () => { const v = (await j("/api/order")).data.view; return v?.files[0]?.status === "ready" ? v : v?.files[0]?.status === "error" ? (() => { throw new Error(v.files[0].error); })() : null; }, "file ready");
step(`file ready: ${ready.files[0].pages} halaman, status order ${ready.order.status}`);

// 4. opsi: halaman 1-5, 2-up, bolak-balik, 2 salinan
r = await j(`/api/order/files/${fileId}`, { method: "PUT", json: { color: false, duplex: true, copies: 2, range: "1-5", orientation: "portrait", nup: 2 } });
step(`opsi -> ${r.status} ${JSON.stringify(r.data)}  (ekspektasi: 3 sisi x 400 x 2 = 2400)`);
r = await j("/api/order/files/" + fileId, { method: "PUT", json: { copies: 99 } });
step(`salinan 99 ditolak -> ${r.status} ${r.data.error}`);
const view = (await j("/api/order")).data.view;
step(`total: ${JSON.stringify(view.totals)} status=${view.order.status}`);

// 5. bayar
r = await j("/api/order/pay", { method: "POST" });
step(`bayar -> ${r.status} ${r.status === 200 ? r.data.qrString : JSON.stringify(r.data)}`);
if (r.status !== 200) process.exit(1);
const code = r.data.code;
const r2 = await j("/api/order/pay", { method: "POST" });
step(`bayar ulang idempoten -> sama QR: ${r2.data.qrString === r.data.qrString}`);
k = (await j(`/api/kiosk/${MID}?k=${key}`)).data;
step(`kiosk saat menunggu bayar: ${k.order?.status}, mesin=${k.availability.state}`);

// 6. mesin terkunci untuk user lain
const saved = cookie; cookie = "";
const k2 = (await j(`/api/kiosk/${MID}?k=${key}`)).data;
step(`user lain: QR tersedia? ${!!k2.qrUrl} (harus false, mesin sedang dipakai)`);
cookie = saved;

// 7. simulasi bayar + webhook ganda
r = await j("/api/dev/mock-pay", { method: "POST", json: { code } });
step(`mock-pay -> ${JSON.stringify(r.data)}`);
r = await j("/api/dev/mock-pay", { method: "POST", json: { code } });
step(`mock-pay kedua -> ${r.status} ${JSON.stringify(r.data)}`);

// 8. tunggu tercetak
const done = await until(async () => { const v = (await j("/api/order")).data.view; return v.order.status === "SELESAI" ? v : null; }, "SELESAI", 90000);
step("order SELESAI, kode " + done.order.code);
const st = (await j(`/api/status/${code}`)).data;
step(`halaman status: ${st.order.status}, total ${st.order.total}, refund=${JSON.stringify(st.refund)}`);
k = (await j(`/api/kiosk/${MID}?k=${key}`)).data;
step(`kiosk setelah selesai: finished=${JSON.stringify(k.finished)} mesin=${k.availability.state}`);
console.log("\nSELESAI. Cek folder apps/agent/data/dry-run");
