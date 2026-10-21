import { db } from "@/lib/db";
import { HttpError, handler, ok, readJson } from "@/lib/http";

/** Simulasi pembayaran. Hanya aktif untuk penyedia "mock" dan bukan produksi (kecuali ALLOW_MOCK_PAY=1). */
export const POST = handler(async (req: Request) => {
  const enabled = process.env.PAYMENT_PROVIDER === "mock" && (process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_PAY === "1");
  if (!enabled) throw new HttpError(404, "Tidak tersedia.");
  const { code } = await readJson<{ code: string }>(req);
  const { data: order } = await db().from("orders").select("id").eq("code", String(code)).maybeSingle();
  if (!order) throw new HttpError(404, "Order tidak ditemukan.");
  const { data: pay } = await db().from("payments").select("provider_ref, amount").eq("order_id", order.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!pay) throw new HttpError(409, "Tidak ada pembayaran yang menunggu.");
  const { data } = await db().rpc("confirm_payment", { p_ref: pay.provider_ref, p_amount: pay.amount, p_raw: { via: "mock" } });
  return ok({ result: data });
});
