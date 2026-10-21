import { db } from "@/lib/db";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { HttpError, handler, ok, readJson } from "@/lib/http";
import { deleteOrderFiles, logEvent, setOrderStatus } from "@/lib/orders";

/**
 * Penanganan refund manual (FR-FAIL-05/06):
 *  - done: tandai sudah ditransfer (boleh set kind=partial + amount untuk refund proporsional)
 *  - reprint: cetak ulang order (selama file belum terhapus) lalu batalkan refund
 */
export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const b = await readJson<{ action: string; note?: string; kind?: "full" | "partial"; amount?: number }>(req);
  const { data: refund } = await db().from("refunds").select("*, orders(*)").eq("id", params.id).maybeSingle();
  if (!refund) throw new HttpError(404, "Refund tidak ditemukan.");
  const order = refund.orders;

  if (b.action === "done") {
    if (refund.status === "done") return ok();
    const patch: Record<string, unknown> = { status: "done", done_at: new Date().toISOString(), admin_note: String(b.note ?? "").slice(0, 300) || null };
    if (b.kind === "partial") {
      const amount = Math.trunc(Number(b.amount));
      if (!(amount > 0 && amount < refund.amount)) throw new HttpError(400, "Nominal refund sebagian harus lebih kecil dari total dan lebih dari 0.");
      patch.kind = "partial";
      patch.amount = amount;
    }
    await db().from("refunds").update(patch).eq("id", refund.id);
    if (["MENUNGGU_REFUND", "GAGAL_CETAK", "KEDALUWARSA", "DIBATALKAN"].includes(order.status)) await setOrderStatus(order.id, "DIREFUND");
    else await logEvent(order.id, "REFUND_DONE", String(patch.amount ?? refund.amount));
    if (!order.files_deleted_at) await deleteOrderFiles(order.id);
    await audit(admin, "refund.done", { id: refund.id, order: order.code });
    return ok();
  }

  if (b.action === "reprint") {
    if (order.files_deleted_at) throw new HttpError(409, "File sudah dihapus, cetak ulang tidak mungkin.");
    const { data: job } = await db().from("print_jobs").select("id").eq("order_id", order.id).maybeSingle();
    if (!job) throw new HttpError(409, "Order ini belum pernah dibayar.");
    const { data: locked } = await db().rpc("lock_machine", { p_machine: order.machine_id, p_order: order.id });
    if (!locked) throw new HttpError(409, "Mesin sedang dipakai. Coba lagi nanti.");
    await db().from("print_jobs").update({ status: "queued", attempt: 0, error: null, finished_at: null }).eq("id", job.id);
    await setOrderStatus(order.id, "CETAK_ULANG");
    await db().from("refunds").update({ status: "cancelled", admin_note: "Dicetak ulang oleh admin" }).eq("id", refund.id);
    await audit(admin, "refund.reprint", { order: order.code });
    return ok();
  }
  throw new HttpError(400, "Aksi tidak dikenal.");
});
