import { db } from "@/lib/db";
import { fail, handler, ok } from "@/lib/http";
import { getProvider } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Webhook pembayaran. Signature wajib valid (FR-PAY-03); notifikasi ganda tidak mencetak ganda (FR-PAY-04). */
export const POST = handler(async (req: Request) => {
  const raw = await req.text();
  let parsed;
  try {
    parsed = await getProvider().parseWebhook(req.headers, raw, new URL(req.url).pathname, async (ref) => {
      const { data: p } = await db().from("payments").select("amount, raw").eq("provider_ref", ref).maybeSingle();
      return p ? { amount: p.amount, referenceNo: p.raw?.referenceNo } : null;
    });
  } catch (e) {
    console.error("[webhook]", e);
    parsed = null;
  }
  // Format balasan notifikasi SNAP: 2005200 = sukses diterima
  const snap = { responseCode: "2005200", responseMessage: "Successful" };
  if (!parsed) return fail(401, "Notifikasi tidak sah.");
  if (!parsed.paid) return ok({ ignored: true, ...snap });
  const { data, error } = await db().rpc("confirm_payment", { p_ref: parsed.providerRef, p_amount: parsed.amount, p_raw: { received: true } });
  if (error) {
    console.error("[webhook]", error);
    return fail(500, "Gagal memproses pembayaran."); // penyedia akan mencoba lagi
  }
  return ok({ result: data, ...snap });
});
