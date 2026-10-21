import { HttpError, handler, ok } from "@/lib/http";
import { cancelOrder } from "@/lib/kiosk-order";
import { requireSession } from "@/lib/session";
import { latestOrder } from "@/lib/user-order";

export const POST = handler(async () => {
  const session = await requireSession();
  const order = await latestOrder(session);
  if (!order) throw new HttpError(409, "Order tidak bisa dibatalkan.");
  await cancelOrder(order);
  return ok();
});
