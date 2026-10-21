import { createHash, createHmac } from "node:crypto";
import { randomToken, safeEqual } from "../crypto";
import type { PaymentProvider } from "./index";

/**
 * Penyedia DOKU (QRIS dinamis).
 *
 * PERHATIAN: ini kerangka yang mengikuti skema tanda tangan HMAC "non-SNAP" DOKU
 * (Client-Id, Request-Id, Request-Timestamp, Request-Target, Digest). Akun QRIS merchant
 * belum aktif saat kode ini ditulis (PRD bagian 5), jadi path endpoint dan bentuk body di bawah
 * HARUS dicocokkan dengan dokumentasi DOKU terbaru (apakah memakai SNAP QRIS atau tidak) dan diuji
 * di sandbox sebelum dipakai. Path dapat diubah lewat env tanpa mengubah kode.
 */
const BASE = () => process.env.DOKU_BASE_URL ?? "https://api-sandbox.doku.com";
const CLIENT_ID = () => process.env.DOKU_CLIENT_ID ?? "";
const SECRET = () => process.env.DOKU_SECRET_KEY ?? "";
const GENERATE_PATH = () => process.env.DOKU_QRIS_GENERATE_PATH ?? "/qris/v1/generate"; // TODO(verify)
const STATUS_PATH = () => process.env.DOKU_QRIS_STATUS_PATH ?? "/qris/v1/status"; // TODO(verify)

function digestOf(body: string) {
  return createHash("sha256").update(body).digest("base64");
}

function sign(requestId: string, timestamp: string, target: string, body: string) {
  const component =
    `Client-Id:${CLIENT_ID()}\nRequest-Id:${requestId}\nRequest-Timestamp:${timestamp}\n` +
    `Request-Target:${target}` +
    (body ? `\nDigest:${digestOf(body)}` : "");
  return "HMACSHA256=" + createHmac("sha256", SECRET()).update(component).digest("base64");
}

async function call(path: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const requestId = randomToken(12);
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const res = await fetch(BASE() + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Client-Id": CLIENT_ID(),
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      Signature: sign(requestId, timestamp, path, body),
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`DOKU ${path} gagal (${res.status})`);
  return json as Record<string, any>;
}

export const dokuProvider: PaymentProvider = {
  name: "doku",
  async createQr({ orderId, code, amount, expiresAt }) {
    const providerRef = `KC-${code}`;
    const json = await call(GENERATE_PATH(), {
      order: { invoice_number: providerRef, amount },
      qr: { expired_time: Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000)) },
      additional_info: { order_id: orderId },
    });
    const qrString = json.qr_string ?? json.qrContent ?? json.response?.qr_string;
    if (!qrString) throw new Error("DOKU tidak mengembalikan string QR");
    return { providerRef, qrString, raw: { id: json.id ?? null } };
  },
  parseWebhook(headers, rawBody, path) {
    const clientId = headers.get("client-id") ?? "";
    const requestId = headers.get("request-id") ?? "";
    const timestamp = headers.get("request-timestamp") ?? "";
    const given = headers.get("signature") ?? "";
    if (!clientId || clientId !== CLIENT_ID() || !given) return null;
    if (!safeEqual(given, sign(requestId, timestamp, path, rawBody))) return null;
    const b = JSON.parse(rawBody);
    const ref = b.order?.invoice_number ?? b.invoice_number;
    const amount = Number(b.order?.amount ?? b.amount);
    const status = String(b.transaction?.status ?? b.status ?? "").toUpperCase();
    if (!ref || !Number.isFinite(amount)) return null;
    return { providerRef: ref, amount, paid: status === "SUCCESS" || status === "PAID" };
  },
  async checkStatus(providerRef) {
    const json = await call(STATUS_PATH(), { invoice_number: providerRef });
    const status = String(json.transaction?.status ?? json.status ?? "").toUpperCase();
    return { paid: status === "SUCCESS" || status === "PAID", amount: Number(json.order?.amount ?? json.amount) || undefined };
  },
};
