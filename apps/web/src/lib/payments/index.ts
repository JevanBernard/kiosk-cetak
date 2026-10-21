import { dokuProvider } from "./doku";
import { dokuCheckoutProvider } from "./doku-checkout";
import { mockProvider } from "./mock";

export interface CreateQrInput {
  orderId: string;
  code: string;
  amount: number;
  expiresAt: Date;
}

/** Mencari pembayaran milik kita berdasarkan referensi; dipakai agar notifikasi bisa dikonfirmasi ke penyedia. */
export type PaymentLookup = (providerRef: string) => Promise<{ amount: number; referenceNo?: string } | null>;

export interface PaymentProvider {
  name: string;
  createQr(input: CreateQrInput): Promise<{ providerRef: string; qrString: string; raw?: Record<string, any> }>;
  /** Memverifikasi notifikasi. Null bila tidak sah. Penyedia boleh mengonfirmasi ke API-nya sendiri. */
  parseWebhook(
    headers: Headers,
    rawBody: string,
    path: string,
    lookup?: PaymentLookup,
  ): Promise<{ providerRef: string; amount: number; paid: boolean } | null>;
  /** Rekonsiliasi (FR-PAY-06). `raw` = data yang disimpan saat createQr. */
  checkStatus(providerRef: string, raw?: Record<string, any> | null): Promise<{ paid: boolean; amount?: number }>;
}

// Logika bisnis hanya bergantung pada antarmuka ini, bukan pada SDK penyedia (NFR-SCL-03).
export function getProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER ?? "mock";
  if (name === "doku") return dokuProvider; // DOKU SNAP QRIS (butuh merchantId + kunci RSA; QRIS tidak ada di sandbox)
  if (name === "doku_checkout") return dokuCheckoutProvider; // halaman bayar DOKU, banyak metode
  if (name === "mock") return mockProvider;
  throw new Error(`PAYMENT_PROVIDER tidak dikenal: ${name}`);
}
