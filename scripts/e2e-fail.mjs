// Uji jalur gagal. Hentikan agent asli dulu; skrip ini berperan sebagai agent.
// MACHINE_ID=<id> node --env-file=apps/web/.env.local scripts/e2e-fail.mjs
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";

const BASE = "http://localhost:3001", MID = process.env.MACHINE_ID;
const AGENT = readFileSync("apps/agent/.env", "utf8").match(/AGENT_TOKEN=(.+)/)[1].trim();
const key = createHmac("sha256", process.env.CRON_SECRET).update("kiosk:" + MID).digest("hex").slice(0, 20);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cookie = "";
const log = (m) => console.log("•", m);
let bad = 0;
const check = (cond, msg) => { console.log(cond ? "  ✓" : "  ✗ GAGAL:", msg); if (!cond) bad++; };

async function j(p, i = {}, bearer) {
  const r = await fetch(BASE + p, { ...i, redirect: "manual", headers: { ...(bearer ? { authorization: "Bearer " + bearer } : { cookie }), ...(i.json ? { "content-type": "application/json" } : {}) }, body: i.json ? JSON.stringify(i.json) : i.body });
  const sc = r.headers.get("set-cookie"); if (sc && !bearer) cookie = sc.split(";")[0];
  return { s: r.status, d: await r.json().catch(() => ({})) };
}
const agent = (p, body) => j(p, body ? { method: "POST", json: body } : {}, AGENT);

async function heartbeat() { await agent("/api/agent/heartbeat", { printerState: "ready" }); }

/** Fake agent: proses satu tugas bila ada. */
async function agentTick(onPrint) {
  await heartbeat();
  const { d } = await agent("/api/agent/tasks");
  const t = d.task;
  if (!t) return null;
  if (t.type === "file") { await agent(`/api/agent/files/${t.fileId}/result`, { pages: 3, converted: false }); return "file"; }
  if (t.type === "print") { await onPrint(t); return "print"; }
}
async function pump(cond, label, onPrint = async () => {}, ms = 30000) {
  const t0 = Date.now();
  for (;;) { await agentTick(onPrint); if (await cond()) return; if (Date.now() - t0 > ms) throw new Error("timeout " + label); await sleep(500); }
}

async function newOrderUntilPay() {
  cookie = "";
  await heartbeat();
  const k = (await j(`/api/kiosk/${MID}?k=${key}`)).d;
  if (!k.qrUrl) throw new Error("mesin tidak tersedia: " + JSON.stringify(k.availability));
  await j("/s/" + k.qrUrl.split("/s/")[1]);
  const doc = await PDFDocument.create(); for (let i = 0; i < 3; i++) doc.addPage([595, 842]);
  const bytes = await doc.save();
  const slot = (await j("/api/order/files", { method: "POST", json: { name: "x.pdf", size: bytes.length, mime: "application/pdf" } })).d;
  const f = new FormData(); f.append("cacheControl", "3600"); f.append("", new Blob([bytes]));
  await fetch(slot.uploadUrl, { method: "PUT", body: f });
  await j(`/api/order/files/${slot.fileId}`, { method: "POST" });
  await pump(async () => (await j("/api/order")).d.view?.files[0]?.status === "ready", "ready");
  const p = await j("/api/order/pay", { method: "POST" });
  if (p.s !== 200) throw new Error("pay: " + JSON.stringify(p.d));
  return p.d.code;
}
const orderRow = async (code) => (await db.from("orders").select("*").eq("code", code).single()).data;
const machine = async () => (await db.from("machines").select("*").eq("id", MID).single()).data;

// ========== A. Gagal cetak 3x -> refund ==========
log("A. cetak gagal berulang");
let code = await newOrderUntilPay();
await j("/api/dev/mock-pay", { method: "POST", json: { code } });
const attempts = [];
await pump(async () => (await orderRow(code)).status === "MENUNGGU_REFUND", "refund", async (t) => {
  attempts.push(t.attempt);
  await agent(`/api/agent/jobs/${t.jobId}`, { status: "failed", error: "Kertas macet (uji)" });
});
check(attempts.join(",") === "1,2,3", `percobaan cetak = ${attempts.join(",")} (harus 1,2,3: 1 awal + 2 ulang)`);
let o = await orderRow(code), m = await machine();
check(o.status === "MENUNGGU_REFUND", "order MENUNGGU_REFUND");
check(m.fault === true && !m.active_order_id, "mesin ditandai gangguan dan kunci dilepas");
const k = (await j(`/api/kiosk/${MID}?k=${key}`)).d;
check(k.availability.state === "unavailable", "mesin Tidak tersedia setelah gagal: " + k.availability.reason);
let st = (await j(`/api/status/${code}`)).d;
check(st.refund?.status === "needs_info" && st.refund.amount === o.total, "refund menunggu data user, nominal penuh");
let r = await j(`/api/status/${code}`, { method: "POST", json: { name: "A", destination: "x" } });
check(r.s === 400, "data refund terlalu pendek ditolak");
r = await j(`/api/status/${code}`, { method: "POST", json: { name: "Budi Uji", destination: "DANA 0812345678" } });
check(r.s === 200, "data refund diterima");
st = (await j(`/api/status/${code}`)).d;
check(st.refund?.status === "pending", "refund siap diproses admin");
const alerts = (await db.from("alerts").select("kind").eq("kind", "print_failed")).data;
check(alerts.length >= 1, "alert print_failed tercatat");
await db.from("machines").update({ fault: false, fault_reason: null }).eq("id", MID);

// ========== B. Order kedaluwarsa ==========
log("B. pembayaran kedaluwarsa");
code = await newOrderUntilPay();
o = await orderRow(code);
check((await machine()).active_order_id === o.id, "mesin terkunci oleh order ini");
await db.from("orders").update({ pay_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", o.id);
r = await j("/api/cron/tick", { method: "POST" }, process.env.CRON_SECRET);
check(r.s === 200, "cron tick berjalan " + JSON.stringify(r.d));
o = await orderRow(code);
check(o.status === "KEDALUWARSA", "order KEDALUWARSA");
check(!(await machine()).active_order_id, "kunci mesin dilepas");
check(!!o.files_deleted_at, "file dihapus");
r = await j("/api/cron/tick", { method: "POST" }, "salah");
check(r.s === 401, "cron tanpa secret ditolak");

// ========== C. Bayar setelah kedaluwarsa ==========
log("C. pembayaran terlambat");
const pay = (await db.from("payments").select("provider_ref, amount").eq("order_id", o.id).single()).data;
const sig = (b) => createHmac("sha256", process.env.MOCK_PAYMENT_SECRET).update(b).digest("hex");
const body = JSON.stringify({ ref: pay.provider_ref, amount: pay.amount });
let wh = await fetch(BASE + "/api/webhooks/payment", { method: "POST", body, headers: { "x-mock-signature": "salah" } });
check(wh.status === 401, "webhook signature palsu ditolak");
wh = await fetch(BASE + "/api/webhooks/payment", { method: "POST", body, headers: { "x-mock-signature": sig(body) } });
check((await wh.json()).result === "late", "pembayaran terlambat ditandai 'late'");
const rf = (await db.from("refunds").select("status,amount").eq("order_id", o.id)).data;
check(rf.length === 1 && rf[0].status === "needs_info", "masuk antrean refund");
check((await db.from("print_jobs").select("id").eq("order_id", o.id)).data.length === 0, "tidak ada job cetak untuk pembayaran terlambat");

// ========== D. Nominal tidak cocok ==========
log("D. nominal webhook tidak cocok");
code = await newOrderUntilPay();
o = await orderRow(code);
const pay2 = (await db.from("payments").select("provider_ref, amount").eq("order_id", o.id).single()).data;
const body2 = JSON.stringify({ ref: pay2.provider_ref, amount: pay2.amount - 100 });
wh = await fetch(BASE + "/api/webhooks/payment", { method: "POST", body: body2, headers: { "x-mock-signature": sig(body2) } });
check((await wh.json()).result === "mismatch", "nominal kurang ditandai mismatch");
check((await orderRow(code)).status === "MENUNGGU_BAYAR", "order tidak dilunasi dan tidak dicetak");
// bersihkan
await j("/api/order/cancel", { method: "POST" });

console.log(bad ? `\n${bad} PENGECEKAN GAGAL` : "\nSEMUA LULUS");
process.exit(bad ? 1 : 0);
