import { BUCKET, db } from "@/lib/db";
import { HttpError, handler, ok } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { latestOrder } from "@/lib/user-order";

export const dynamic = "force-dynamic";

/** URL bertanda tangan berumur pendek untuk preview di browser (hanya PDF/hasil konversi). */
export const GET = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const order = await latestOrder(session);
  if (!order) throw new HttpError(404, "Order tidak ditemukan.");
  const { data: file } = await db().from("order_files").select("*").eq("id", params.id).eq("order_id", order.id).maybeSingle();
  if (!file || file.status !== "ready" || order.files_deleted_at) throw new HttpError(404, "Preview tidak tersedia.");
  const path = file.converted_path ?? file.storage_path;
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw new HttpError(500, "Gagal menyiapkan preview.");
  return ok({ url: data.signedUrl });
});
