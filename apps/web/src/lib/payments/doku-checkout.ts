import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PaymentProvider } from "./index";

/**
 * DOKU Checkout (non-SNAP): halaman pembayaran milik DOKU dengan banyak metode (VA, e-wallet, QRIS, kartu, dst).
 * Hanya butuh Client ID + Secret Key, tanpa merchantId dan tanpa kunci RSA.
 *
 *  - Buat sesi : POST /checkout/v1/payment            -> response.payment.url (halaman bayar)
 *  - Cek status: GET  /orders/v1/status/{invoice}
 *  - Signature : "HMACSHA256=" + base64(HMAC_SHA256(secret, komponen per baris))
 *                komponen: Client-Id, Request-Id, Request-Timestamp, Request-Target, [Digest = base64(sha256(body)) untuk POST]
 *
 * Nilai `qrString` pada penyedia ini berisi URL halaman bayar; layar kiosk menampilkannya sebagai QR dan
 * halaman HP menampilkannya sebagai tombol. Notifikasi webhook tidak dipercaya mentah: status dan nominal
 * selalu dikonfirmasi ulang lewat Check Status.
 */
const BASE = () => process.env.DOKU_BASE_URL ?? "https://api-sandbox.doku.com";
const CLIENT_ID = () => process.env.DOKU_CLIENT_ID ?? "";
const SECRET = () => process.env.DOKU_SECRET_KEY ?? "";
const APP_URL = () => (process.env.APP_URL ?? "").replace(/\/+$/, "");
/** Opsional: batasi metode, mis. "VIRTUAL_ACCOUNT_BCA,EMONEY_OVO,QRIS". Kosong = semua metode yang aktif di akun. */
const METHODS = () => (process.env.DOKU_PAYMENT_METHODS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function assertConfigured() {
  const missing: string[] = [];
  if (!CLIENT_ID()) missing.push("DOKU_CLIENT_ID");
  if (!SECRET()) missing.push("DOKU_SECRET_KEY");
  if (missing.length) throw new Error(`Konfigurasi DOKU Checkout belum lengkap: ${missing.join(", ")}`);
}

/** Format DOKU Checkout: UTC, YYYY-MM-DDTHH:mm:ssZ. */
const utcStamp = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export function sign(opts: { clientId: string; requestId: string; timestamp: string; target: string; body?: string; secret: string }): string {
  const lines = [`Client-Id:${opts.clientId}`, `Request-Id:${opts.requestId}`, `Request-Timestamp:${opts.timestamp}`, `Request-Target:${opts.target}`];
  if (opts.body !== undefined) lines.push(`Digest:${createHash("sha256").update(opts.body).digest("base64")}`);
  return "HMACSHA256=" + createHmac("sha256", opts.secret).update(lines.join("\n")).digest("base64");
}

async function request(method: "GET" | "POST", path: string, payload?: unknown): Promise<{ status: number; json: any }> {
  assertConfigured();
  const requestId = randomUUID();
  const timestamp = utcStamp();
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const signature = sign({ clientId: CLIENT_ID(), requestId, timestamp, target: path, body, secret: SECRET() });
  const res = await fetch(BASE() + path, {
    method,
    headers: {
      "content-type": "application/json",
      "Client-Id": CLIENT_ID(),
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      Signature: signature,
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.round(n) : undefined;
};

async function status(invoice: string): Promise<{ paid: boolean; amount?: number; state?: string }> {
  const { status: http, json } = await request("GET", `/orders/v1/status/${encodeURIComponent(invoice)}`);
  if (http === 404) return { paid: false, state: "NOT_FOUND" };
  if (http >= 400) throw new Error(`DOKU status gagal (${http} ${json?.error_messages?.join?.("; ") ?? ""})`);
  const state = String(json?.transaction?.status ?? json?.status ?? "").toUpperCase();
  return { paid: state === "SUCCESS", amount: num(json?.order?.amount ?? json?.transaction?.amount), state };
}

export const dokuCheckoutProvider: PaymentProvider = {
  name: "doku_checkout",

  async createQr({ code, amount, expiresAt }) {
    // Satu invoice per percobaan: bila pembuatan sesi sempat berhasil tapi gagal dicatat, percobaan ulang tidak bentrok.
    const invoice = `${code}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const app = APP_URL();
    const minutes = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60_000));
    const methods = METHODS();
    const body = {
      order: {
        amount: Math.round(amount),
        invoice_number: invoice,
        auto_redirect: true,
        ...(app ? { callback_url: `${app}/status/${code}`, callback_url_result: `${app}/status/${code}` } : {}),
      },
      payment: { payment_due_date: minutes, ...(methods.length ? { payment_method_types: methods } : {}) },
      // Alamat webhook dikirim per transaksi sehingga tidak perlu diatur satu per satu di Back Office.
      ...(app ? { additional_info: { override_notification_url: `${app}/api/webhooks/payment` } } : {}),
    };
    const { status: http, json } = await request("POST", "/checkout/v1/payment", body);
    const url: string | undefined = json?.response?.payment?.url;
    if (http >= 400 || !url) {
      throw new Error(`DOKU Checkout gagal (${http}): ${JSON.stringify(json?.error_messages ?? json?.message ?? json).slice(0, 200)}`);
    }
    return { providerRef: invoice, qrString: url, raw: { tokenId: json.response.payment.token_id, expiredDate: json.response.payment.expired_date } };
  },

  /**
   * Notifikasi HTTP DOKU memuat order.invoice_number dan transaction.status. Signature diperiksa dan
   * ketidakcocokan hanya dicatat; yang menentukan adalah Check Status ke DOKU, jadi notifikasi palsu tidak bisa melunasi order.
   */
  async parseWebhook(headers, rawBody, path, lookup) {
    let b: any;
    try {
      b = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const invoice: string | undefined = b?.order?.invoice_number;
    if (!invoice || !lookup) return null;

    const got = headers.get("signature") ?? "";
    if (got && SECRET()) {
      const want = sign({ clientId: headers.get("client-id") ?? "", requestId: headers.get("request-id") ?? "", timestamp: headers.get("request-timestamp") ?? "", target: path, body: rawBody, secret: SECRET() });
      const a = Buffer.from(got);
      const w = Buffer.from(want);
      if (a.length !== w.length || !timingSafeEqual(a, w)) console.warn("[webhook] signature DOKU tidak cocok; mengandalkan Check Status");
    }

    const known = await lookup(invoice);
    if (!known) return null;
    const s = await status(invoice);
    return { providerRef: invoice, amount: s.amount ?? known.amount, paid: s.paid };
  },

  async checkStatus(providerRef) {
    const s = await status(providerRef);
    return { paid: s.paid, amount: s.amount };
  },
};
