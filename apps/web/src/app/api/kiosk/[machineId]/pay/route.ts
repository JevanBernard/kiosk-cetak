import { HttpError, handler, ok } from "@/lib/http";
import { kioskOrder, requireKiosk, startPayment } from "@/lib/kiosk-order";
import { loadMachine } from "@/lib/machine";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Tombol "Bayar" di layar kiosk. Idempoten: order yang sudah menunggu bayar mengembalikan QR yang sama. */
export const POST = handler(async (req: Request, { params }: { params: { machineId: string } }) => {
  requireKiosk(req, params.machineId);
  rateLimit("kpay:" + params.machineId, 10, 60_000);
  const { machine } = await loadMachine(params.machineId);
  const order = await kioskOrder(machine);
  if (!order) throw new HttpError(409, "Belum ada order.");
  return ok(await startPayment(order));
});
