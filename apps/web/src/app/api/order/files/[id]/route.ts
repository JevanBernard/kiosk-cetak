import { BUCKET, db } from "@/lib/db";
import { HttpError, handler, ok } from "@/lib/http";
import { removeFile, touchOrder } from "@/lib/kiosk-order";
import { logEvent, refreshDraftStatus } from "@/lib/orders";
import { requireSession } from "@/lib/session";
import { requireDraft } from "@/lib/user-order";

/** HP hanya mengunggah dan menghapus file. Pengaturan cetak dilakukan di layar kiosk. */

/** Konfirmasi unggahan selesai: file masuk antrean proses agent (konversi + hitung halaman). */
export const POST = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const order = await requireDraft(session);
  const { data: file } = await db().from("order_files").select("*").eq("id", params.id).eq("order_id", order.id).maybeSingle();
  if (!file) throw new HttpError(404, "File tidak ditemukan.");
  if (file.status !== "pending") return ok();
  const { data: head } = await db().storage.from(BUCKET).list(`${order.id}/${file.id}`, { limit: 1 });
  if (!head || !head.length) throw new HttpError(400, "File belum terunggah. Coba unggah ulang.");
  await db().from("order_files").update({ status: "uploaded" }).eq("id", file.id);
  await refreshDraftStatus(order.id);
  await touchOrder(order.id);
  await logEvent(order.id, "FILE_UPLOADED", file.kind);
  return ok();
});

export const DELETE = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const order = await requireDraft(session);
  await removeFile(order, params.id);
  return ok();
});
