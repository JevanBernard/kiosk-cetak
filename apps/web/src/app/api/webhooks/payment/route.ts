import { db } from "@/lib/db";
import { fail, handler, ok } from "@/lib/http";
import { getProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Webhook pembayaran. Signature wajib valid (FR-PAY-03); notifikasi ganda tidak mencetak ganda (FR-PAY-04). */
export const POST = handler(async (req: Request) => {
  const raw = await req.text();
  let parsed;
  try {
    parsed = getProvider().parseWebhook(req.headers, raw, new URL(req.url).pathname);
  } catch {
    parsed = null;
  }
  if (!parsed) return fail(401, "Signature tidak valid.");
  if (!parsed.paid) return ok({ ignored: true });
  const { data, error } = await db().rpc("confirm_payment", { p_ref: parsed.providerRef, p_amount: parsed.amount, p_raw: { received: true } });
  if (error) {
    console.error("[webhook]", error);
    return fail(500, "Gagal memproses pembayaran."); // penyedia akan mencoba lagi
  }
  return ok({ result: data });
});
