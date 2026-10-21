import { randomToken } from "../crypto";
import { hmacHex, safeEqual } from "../crypto";
import type { PaymentProvider } from "./index";

/** Penyedia simulasi untuk pengembangan dan uji alur. Tidak memindahkan uang. */
export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

export function mockSign(body: string): string {
  return hmacHex(process.env.MOCK_PAYMENT_SECRET ?? "dev-secret", body);
}

export const mockProvider: PaymentProvider = {
  name: "mock",
  async createQr({ amount, code }) {
    const providerRef = `MOCK-${randomToken(9)}`;
    return { providerRef, qrString: `MOCKQRIS|${providerRef}|${amount}|${code}` };
  },
  parseWebhook(headers, rawBody) {
    const sig = headers.get(MOCK_SIGNATURE_HEADER) ?? "";
    if (!sig || !safeEqual(sig, mockSign(rawBody))) return null;
    const b = JSON.parse(rawBody) as { ref: string; amount: number };
    return { providerRef: b.ref, amount: b.amount, paid: true };
  },
  async checkStatus() {
    return { paid: false }; // pembayaran mock hanya masuk lewat webhook / tombol simulasi
  },
};
