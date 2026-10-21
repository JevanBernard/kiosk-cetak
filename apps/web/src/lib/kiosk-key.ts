import { hmacHex } from "./crypto";

/**
 * Kunci layar kiosk: URL layar mesin berbentuk /kiosk/<id>?k=<kunci>. Tanpa kunci ini, orang
 * di luar lokasi tidak bisa membuka layar dan mengambil QR dinamis dari jauh (NFR-SEC-12).
 */
export function kioskKey(machineId: string): string {
  const secret = process.env.CRON_SECRET || "dev-secret";
  return hmacHex(secret, "kiosk:" + machineId).slice(0, 20);
}
