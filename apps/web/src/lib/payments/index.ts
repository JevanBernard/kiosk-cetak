import { dokuProvider } from "./doku";
import { mockProvider } from "./mock";

export interface CreateQrInput {
  orderId: string;
  code: string;
  amount: number;
  expiresAt: Date;
}

export interface PaymentProvider {
  name: string;
  createQr(input: CreateQrInput): Promise<{ providerRef: string; qrString: string; raw?: unknown }>;
  /** Memverifikasi signature webhook. Mengembalikan data pembayaran, atau null bila tidak sah/bukan pembayaran sukses. */
  parseWebhook(headers: Headers, rawBody: string, path: string): { providerRef: string; amount: number; paid: boolean } | null;
  /** Rekonsiliasi (FR-PAY-06). */
  checkStatus(providerRef: string): Promise<{ paid: boolean; amount?: number }>;
}

// Logika bisnis hanya bergantung pada antarmuka ini, bukan pada SDK penyedia (NFR-SCL-03).
export function getProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER ?? "mock";
  if (name === "doku") return dokuProvider;
  if (name === "mock") return mockProvider;
  throw new Error(`PAYMENT_PROVIDER tidak dikenal: ${name}`);
}
