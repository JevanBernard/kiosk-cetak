import { HttpError, handler, ok } from "@/lib/http";
import { cancelOrder, kioskOrder, requireKiosk } from "@/lib/kiosk-order";
import { loadMachine } from "@/lib/machine";

export const POST = handler(async (req: Request, { params }: { params: { machineId: string } }) => {
  requireKiosk(req, params.machineId);
  const { machine } = await loadMachine(params.machineId);
  const order = await kioskOrder(machine);
  if (!order) throw new HttpError(409, "Order tidak bisa dibatalkan.");
  await cancelOrder(order);
  return ok();
});
