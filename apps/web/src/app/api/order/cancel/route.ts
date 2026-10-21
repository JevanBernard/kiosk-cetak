import { db } from "@/lib/db";
import { HttpError, handler, ok } from "@/lib/http";
import { deleteOrderFiles, releaseMachine, setOrderStatus } from "@/lib/orders";
import { requireSession } from "@/lib/session";
import { DRAFT, latestOrder } from "@/lib/user-order";

/** Pembatalan hanya sebelum pembayaran masuk (FR-PAY-08). */
export const POST = handler(async () => {
  const session = await requireSession();
  const order = await latestOrder(session);
  if (!order || ![...DRAFT, "MENUNGGU_BAYAR"].includes(order.status)) {
    throw new HttpError(409, "Order tidak bisa dibatalkan.");
  }
  await db().from("payments").update({ status: "expired" }).eq("order_id", order.id).eq("status", "pending");
  await setOrderStatus(order.id, "DIBATALKAN");
  await releaseMachine(order.machine_id, order.id);
  await deleteOrderFiles(order.id);
  return ok();
});
