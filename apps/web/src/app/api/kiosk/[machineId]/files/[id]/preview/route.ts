import { BUCKET, db } from "@/lib/db";
import { HttpError, handler, ok } from "@/lib/http";
import { kioskDraft, requireKiosk } from "@/lib/kiosk-order";

export const dynamic = "force-dynamic";

/** URL bertanda tangan berumur pendek untuk preview di layar kiosk (PDF / hasil konversi). */
export const GET = handler(async (req: Request, { params }: { params: { machineId: string; id: string } }) => {
  requireKiosk(req, params.machineId);
  const order = await kioskDraft(params.machineId);
  const { data: file } = await db().from("order_files").select("*").eq("id", params.id).eq("order_id", order.id).maybeSingle();
  if (!file || file.status !== "ready" || order.files_deleted_at) throw new HttpError(404, "Preview tidak tersedia.");
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(file.converted_path ?? file.storage_path, 300);
  if (error || !data) throw new HttpError(500, "Gagal menyiapkan preview.");
  return ok({ url: data.signedUrl });
});
