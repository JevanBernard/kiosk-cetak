import { db } from "@/lib/db";
import { requireAgent } from "@/lib/agent-auth";
import { HttpError, handler, ok, readJson } from "@/lib/http";
import { defaultOptionsFor, logEvent, refreshDraftStatus } from "@/lib/orders";

/** Hasil proses file dari agent: halaman terhitung dan apakah ada PDF hasil konversi. */
export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const machine = await requireAgent(req);
  const b = await readJson<{ pages?: number; converted?: boolean; error?: string }>(req);
  const { data: file } = await db().from("order_files").select("*, orders!inner(machine_id)").eq("id", params.id).maybeSingle();
  if (!file || file.orders.machine_id !== machine.id) throw new HttpError(404, "File tidak ditemukan.");
  if (file.status !== "processing") return ok({ ignored: true });

  if (b.error || !b.pages || b.pages < 1) {
    await db().from("order_files").update({ status: "error", error: String(b.error ?? "File tidak dapat diproses.").slice(0, 300) }).eq("id", file.id);
    await logEvent(file.order_id, "FILE_ERROR", file.kind);
  } else {
    const { data: s } = await db().from("machine_settings").select("allow_color").eq("machine_id", machine.id).single();
    await db()
      .from("order_files")
      .update({
        status: "ready",
        error: null,
        pages: Math.trunc(b.pages),
        converted_path: b.converted ? `${file.order_id}/${file.id}/converted.pdf` : null,
        options: defaultOptionsFor(file.kind, !!s?.allow_color),
      })
      .eq("id", file.id);
    await logEvent(file.order_id, "FILE_READY", `${b.pages} halaman`);
  }
  await refreshDraftStatus(file.order_id);
  return ok();
});
