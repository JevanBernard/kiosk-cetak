import { createHash, createHmac, createSign, randomInt } from "node:crypto";
import type { PaymentProvider } from "./index";

/**
 * DOKU SNAP QRIS (host-to-host).
 *  - Token B2B : POST /authorization/v1/access-token/b2b (signature RSA-SHA256 "clientId|timestamp") [dari standar SNAP, tidak ada di dokumen yang ditempel: verifikasi di sandbox]
 *  - Generate  : POST /snap-adapter/b2b/v1.0/qr/qr-mpm-generate
 *  - Query     : POST /snap-adapter/b2b/v1.0/qr/qr-mpm-query (serviceCode 47)
 *  - Signature request bisnis: base64(HMAC_SHA512(clientSecret, "POST:path:accessToken:sha256hex(body):timestamp"))
 *
 * Notifikasi pembayaran dikonfirmasi dengan memanggil Query QRIS, sehingga webhook palsu tidak bisa
 * melunasi order walau signature notifikasi tidak diverifikasi.
 */
const BASE = () => process.env.DOKU_BASE_URL ?? "https://api-sandbox.doku.com";
const CLIENT_ID = () => process.env.DOKU_CLIENT_ID ?? "";
const SECRET = () => process.env.DOKU_SECRET_KEY ?? "";
const MERCHANT_ID = () => process.env.DOKU_MERCHANT_ID ?? "";
const TERMINAL_ID = () => process.env.DOKU_TERMINAL_ID ?? "T0001";
const POSTAL = () => process.env.DOKU_POSTAL_CODE ?? "10110";
const PRIVATE_KEY = () => (process.env.DOKU_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
const TOKEN_PATH = "/authorization/v1/access-token/b2b";

/** Format SNAP: YYYY-MM-DDTHH:mm:ss+07:00 (WIB). */
function wib(d = new Date()): string {
  const s = new Date(d.getTime() + 7 * 3600_000).toISOString().replace(/\.\d{3}Z$/, "");
  return s + "+07:00";
}

const rupiah = (n: number) => `${n}.00`;
const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

let cached: { token: string; exp: number } | null = null;

/** Gagal lebih awal dengan pesan jelas (hanya NAMA variabel, tidak pernah nilainya) bila konfigurasi DOKU belum lengkap. */
function assertConfigured() {
  const missing: string[] = [];
  if (!CLIENT_ID()) missing.push("DOKU_CLIENT_ID");
  if (!SECRET()) missing.push("DOKU_SECRET_KEY");
  if (!MERCHANT_ID()) missing.push("DOKU_MERCHANT_ID");
  if (!PRIVATE_KEY()) missing.push("DOKU_PRIVATE_KEY");
  else if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(PRIVATE_KEY())) missing.push("DOKU_PRIVATE_KEY (format bukan PEM; baris baru harus ditulis \n)");
  if (missing.length) throw new Error(`Konfigurasi DOKU belum lengkap: ${missing.join(", ")}`);
}

async function accessToken(): Promise<string> {
  assertConfigured();
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;
  const timestamp = wib();
  const signature = createSign("RSA-SHA256").update(`${CLIENT_ID()}|${timestamp}`).sign(PRIVATE_KEY(), "base64");
  const res = await fetch(BASE() + TOKEN_PATH, {
    method: "POST",
    headers: { "content-type": "application/json", "X-CLIENT-KEY": CLIENT_ID(), "X-TIMESTAMP": timestamp, "X-SIGNATURE": signature },
    body: JSON.stringify({ grantType: "client_credentials" }),
    signal: AbortSignal.timeout(20_000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.accessToken) throw new Error(`DOKU token gagal (${res.status} ${json.responseCode ?? ""} ${json.responseMessage ?? ""})`);
  cached = { token: json.accessToken, exp: Date.now() + (Number(json.expiresIn) || 900) * 1000 };
  return cached.token;
}

async function call(path: string, payload: unknown): Promise<any> {
  const token = await accessToken();
  const body = JSON.stringify(payload); // JSON.stringify tanpa spasi = minify
  const timestamp = wib();
  const stringToSign = `POST:${path}:${token}:${sha256Hex(body)}:${timestamp}`;
  const signature = createHmac("sha512", SECRET()).update(stringToSign).digest("base64");
  const res = await fetch(BASE() + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-PARTNER-ID": CLIENT_ID(),
      "X-EXTERNAL-ID": `${Date.now()}${String(randomInt(1000)).padStart(3, "0")}`,
      "X-TIMESTAMP": timestamp,
      "X-SIGNATURE": signature,
      "CHANNEL-ID": "H2H",
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok && !json.responseCode) throw new Error(`DOKU ${path} gagal (${res.status})`);
  return json;
}

async function query(partnerRef: string, referenceNo: string) {
  const json = await call("/snap-adapter/b2b/v1.0/qr/qr-mpm-query", {
    originalReferenceNo: referenceNo,
    originalPartnerReferenceNo: partnerRef,
    serviceCode: "47",
    merchantId: MERCHANT_ID(),
  });
  // latestTransactionStatus "00" = sukses (SNAP)
  const paid = json.latestTransactionStatus === "00";
  const amount = Number.parseFloat(json.amount?.value ?? "");
  return { paid, amount: Number.isFinite(amount) ? Math.round(amount) : undefined };
}

export const dokuProvider: PaymentProvider = {
  name: "doku",
  async createQr({ code, amount, expiresAt }) {
    const providerRef = `KC-${code}`; // partnerReferenceNo (maks 64)
    const json = await call("/snap-adapter/b2b/v1.0/qr/qr-mpm-generate", {
      partnerReferenceNo: providerRef,
      amount: { value: rupiah(amount), currency: "IDR" },
      merchantId: MERCHANT_ID(),
      terminalId: TERMINAL_ID(),
      validityPeriod: wib(expiresAt),
      additionalInfo: { postalCode: POSTAL(), feeType: "1" },
    });
    // 2004700 = sukses generate
    if (json.responseCode !== "2004700" || !json.qrContent) {
      throw new Error(`DOKU generate gagal: ${json.responseCode} ${json.responseMessage}`);
    }
    return { providerRef, qrString: json.qrContent, raw: { referenceNo: json.referenceNo } };
  },

  /**
   * Notifikasi DOKU memuat originalPartnerReferenceNo. Isinya tidak dipercaya mentah: status dan
   * nominal diambil ulang dari Query QRIS.
   */
  async parseWebhook(_headers, rawBody, _path, lookup) {
    let b: any;
    try {
      b = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const partnerRef: string | undefined = b.originalPartnerReferenceNo ?? b.partnerReferenceNo;
    if (!partnerRef || !lookup) return null;
    const known = await lookup(partnerRef);
    if (!known) return null;
    const q = await query(partnerRef, known.referenceNo ?? b.originalReferenceNo ?? "");
    return { providerRef: partnerRef, amount: q.amount ?? known.amount, paid: q.paid };
  },

  async checkStatus(providerRef, raw) {
    return query(providerRef, raw?.referenceNo ?? "");
  },
};
