// Uji DOKU Checkout dari komputer Anda, tanpa deploy. Membuat sesi bayar Rp 3.000 dan menampilkan URL-nya.
// Jalankan dari root repo (isi DOKU_CLIENT_ID dan DOKU_SECRET_KEY di apps/web/.env.local lebih dulu):
//   node --env-file=apps/web/.env.local node_modules/tsx/dist/cli.mjs scripts/doku-checkout-test.mts
// Lalu buka URL yang tercetak di browser dan bayar lewat simulator DOKU: https://sandbox.doku.com/integration/simulator/
import { dokuCheckoutProvider as p } from "../apps/web/src/lib/payments/doku-checkout.ts";

try {
  const r = await p.createQr({ orderId: "uji", code: "UJI" + Date.now().toString(36).toUpperCase().slice(-6), amount: 3000, expiresAt: new Date(Date.now() + 5 * 60_000) });
  console.log("Sesi dibuat. Invoice:", r.providerRef);
  console.log("Buka URL ini untuk memilih metode bayar:\n ", r.qrString);
  console.log("Status sekarang:", JSON.stringify(await p.checkStatus(r.providerRef)));
} catch (e) {
  console.error("GAGAL:", (e as Error).message);
  process.exitCode = 1;
}
