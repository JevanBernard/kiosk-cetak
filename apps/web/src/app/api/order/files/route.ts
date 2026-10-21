import { MAX_FILE_BYTES, kindFromMime } from "@kioskcetak/shared";
import { BUCKET, db } from "@/lib/db";
import { HttpError, clientIp, handler, ok, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";
import { ensureDraft } from "@/lib/user-order";
import { logEvent } from "@/lib/orders";

const MAX_FILES = 10;

/** Membuat slot file + URL unggah bertanda tangan. File diunggah langsung ke Storage (FR-UP-03). */
export const POST = handler(async (req: Request) => {
  const session = await requireSession();
  rateLimit("upload:" + clientIp(req), 40, 60_000);
  rateLimit("upload-s:" + session.id, 20, 60_000);
  const body = await readJson<{ name: string; size: number; mime: string }>(req);

  const kind = kindFromMime(String(body.mime));
  if (!kind) throw new HttpError(400, "Format tidak didukung. Gunakan PDF, DOCX, PPTX, JPG, atau PNG.");
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) throw new HttpError(400, "File kosong.");
  if (size > MAX_FILE_BYTES) throw new HttpError(400, "File lebih dari 50 MB.");
  const name = String(body.name ?? "dokumen").slice(0, 120);

  const order = await ensureDraft(session);
  const { count } = await db().from("order_files").select("id", { count: "exact", head: true }).eq("order_id", order.id);
  if ((count ?? 0) >= MAX_FILES) throw new HttpError(400, `Maksimal ${MAX_FILES} file per order.`);

  const { data: file, error } = await db()
    .from("order_files")
    .insert({
      order_id: order.id,
      position: count ?? 0,
      original_name: name,
      mime: body.mime,
      kind,
      size_bytes: size,
      storage_path: "pending",
    })
    .select("id")
    .single();
  if (error || !file) throw new HttpError(500, "Gagal membuat slot file.");

  // Nama file asli tidak dipakai dalam path (menghindari karakter berbahaya)
  const path = `${order.id}/${file.id}/original`;
  await db().from("order_files").update({ storage_path: path }).eq("id", file.id);
  const { data: signed, error: sErr } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (sErr || !signed) throw new HttpError(500, "Gagal menyiapkan unggahan.");
  await logEvent(order.id, "FILE_SLOT", `${kind} ${size}B`);
  return ok({ fileId: file.id, uploadUrl: signed.signedUrl });
});
