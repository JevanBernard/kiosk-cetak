import { BUCKET, db } from "@/lib/db";
import { requireAgent } from "@/lib/agent-auth";
import { handler, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Agent mengambil satu tugas: cetak (prioritas) atau proses file (konversi + hitung halaman). */
export const GET = handler(async (req: Request) => {
  const machine = await requireAgent(req);
  const storage = db().storage.from(BUCKET);

  // 1. Job cetak
  const { data: job } = await db().from("print_jobs").select("*").eq("machine_id", machine.id).eq("status", "queued").order("created_at").limit(1).maybeSingle();
  if (job) {
    const { data: claimed } = await db()
      .from("print_jobs")
      .update({ status: "claimed", attempt: job.attempt + 1 })
      .eq("id", job.id)
      .eq("status", "queued")
      .select("id, attempt")
      .maybeSingle();
    if (claimed) {
      const { data: order } = await db().from("orders").select("code").eq("id", job.order_id).single();
      const { data: files } = await db().from("order_files").select("*").eq("order_id", job.order_id).order("position");
      const out = [];
      for (const f of files ?? []) {
        const { data: signed } = await storage.createSignedUrl(f.converted_path ?? f.storage_path, 3600);
        out.push({ name: f.original_name, kind: f.kind, pages: f.pages, options: f.options, url: signed?.signedUrl });
      }
      return ok({ task: { type: "print", jobId: job.id, code: order?.code, attempt: claimed.attempt, files: out } });
    }
  }

  // 2. File yang menunggu diproses. File 'processing' yang menggantung > 3 menit dikembalikan ke antrean.
  const stale = new Date(Date.now() - 3 * 60_000).toISOString();
  await db().from("order_files").update({ status: "uploaded" }).eq("status", "processing").lt("processing_since", stale);

  const { data: pending } = await db()
    .from("order_files")
    .select("*, orders!inner(machine_id, status)")
    .eq("status", "uploaded")
    .eq("orders.machine_id", machine.id)
    .in("orders.status", ["DIBUAT", "DIUPLOAD", "DIATUR"])
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (pending) {
    const { data: claimed } = await db()
      .from("order_files")
      .update({ status: "processing", processing_since: new Date().toISOString() })
      .eq("id", pending.id)
      .eq("status", "uploaded")
      .select("id")
      .maybeSingle();
    if (claimed) {
      const { data: down } = await storage.createSignedUrl(pending.storage_path, 600);
      const convertedPath = `${pending.order_id}/${pending.id}/converted.pdf`;
      const { data: up } = await storage.createSignedUploadUrl(convertedPath, { upsert: true });
      return ok({
        task: {
          type: "file",
          fileId: pending.id,
          kind: pending.kind,
          mime: pending.mime,
          name: pending.original_name,
          sizeBytes: pending.size_bytes,
          downloadUrl: down?.signedUrl,
          uploadUrl: up?.signedUrl,
        },
      });
    }
  }
  return ok({ task: null });
});
