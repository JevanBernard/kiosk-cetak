import {
  DEFAULT_OPTIONS,
  NUP_VALUES,
  priceFile,
  type NUp,
  type PrintOptions,
} from "@kioskcetak/shared";
import { BUCKET, db } from "@/lib/db";
import { HttpError, handler, ok, readJson } from "@/lib/http";
import { logEvent, refreshDraftStatus } from "@/lib/orders";
import { requireSession } from "@/lib/session";
import { toPriceConfig } from "@/lib/settings";
import { requireDraft } from "@/lib/user-order";

async function ownFile(orderId: string, id: string) {
  const { data } = await db().from("order_files").select("*").eq("id", id).eq("order_id", orderId).maybeSingle();
  if (!data) throw new HttpError(404, "File tidak ditemukan.");
  return data as Record<string, any>;
}

/** Konfirmasi unggahan selesai: file masuk antrean proses agent (konversi + hitung halaman). */
export const POST = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const order = await requireDraft(session);
  const file = await ownFile(order.id, params.id);
  if (file.status !== "pending") return ok();
  const { data: head } = await db().storage.from(BUCKET).list(`${order.id}/${file.id}`, { limit: 1 });
  if (!head || !head.length) throw new HttpError(400, "File belum terunggah. Coba unggah ulang.");
  await db().from("order_files").update({ status: "uploaded" }).eq("id", file.id);
  await refreshDraftStatus(order.id);
  await logEvent(order.id, "FILE_UPLOADED", file.kind);
  return ok();
});

export const DELETE = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const order = await requireDraft(session);
  const file = await ownFile(order.id, params.id);
  const paths = [file.storage_path, file.converted_path].filter(Boolean);
  if (paths.length) await db().storage.from(BUCKET).remove(paths);
  await db().from("order_files").delete().eq("id", file.id);
  await refreshDraftStatus(order.id);
  return ok();
});

/** Menyimpan opsi cetak. Harga dihitung di server dari konfigurasi mesin (FR-PRC-05). */
export const PUT = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const order = await requireDraft(session);
  const file = await ownFile(order.id, params.id);
  if (file.status !== "ready" || !file.pages) throw new HttpError(409, "File belum siap diatur.");
  const body = await readJson<Partial<PrintOptions>>(req);

  const nup = Number(body.nup ?? 1) as NUp;
  const opts: PrintOptions = {
    color: Boolean(body.color),
    duplex: Boolean(body.duplex),
    copies: Math.trunc(Number(body.copies ?? 1)),
    range: String(body.range ?? "").slice(0, 200),
    orientation: body.orientation === "landscape" ? "landscape" : "portrait",
    nup: NUP_VALUES.includes(nup) ? nup : DEFAULT_OPTIONS.nup,
  };
  const { data: settings } = await db().from("machine_settings").select("*").eq("machine_id", order.machine_id).single();
  const priced = priceFile(opts, file.pages, toPriceConfig(settings!));
  if ("error" in priced) throw new HttpError(400, priced.error);

  await db().from("order_files").update({ options: opts, sides: priced.sides, price: priced.total }).eq("id", file.id);
  return ok({ sides: priced.sides, price: priced.total });
});
