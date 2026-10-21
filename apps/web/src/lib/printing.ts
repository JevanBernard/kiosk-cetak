import { MAX_PRINT_ATTEMPTS } from "@kioskcetak/shared";
import { db } from "./db";
import { deleteOrderFiles, logEvent, releaseMachine, setOrderStatus } from "./orders";
import { raiseAlert } from "./telegram";

export type JobReport = {
  status: "printing" | "done" | "failed";
  error?: string;
  final?: boolean;
  progress?: { file: number; of: number };
  sidesBw?: number;
  sidesColor?: number;
  /** Lembar fisik terpakai (bolak-balik = 1 lembar untuk 2 sisi). */
  sheets?: number;
};

/** Menerapkan laporan agent ke job/order. Idempoten terhadap laporan ganda (job yang sudah selesai diabaikan). */
export async function applyJobReport(machine: Record<string, any>, jobId: string, r: JobReport) {
  const { data: job } = await db().from("print_jobs").select("*").eq("id", jobId).eq("machine_id", machine.id).maybeSingle();
  if (!job) return { ignored: true };
  if (job.status === "done" || job.status === "failed") return { ignored: true };
  const { data: order } = await db().from("orders").select("*").eq("id", job.order_id).single();
  if (!order) return { ignored: true };

  if (r.status === "printing") {
    await db()
      .from("print_jobs")
      .update({ status: "printing", progress: r.progress ?? null, started_at: job.started_at ?? new Date().toISOString() })
      .eq("id", job.id);
    if (order.status !== "MENCETAK") await setOrderStatus(order.id, "MENCETAK");
    return { ok: true };
  }

  if (r.status === "done") {
    const bw = r.sidesBw ?? 0;
    const color = r.sidesColor ?? 0;
    await db().from("print_jobs").update({ status: "done", finished_at: new Date().toISOString(), error: null }).eq("id", job.id);
    await setOrderStatus(order.id, "SELESAI", { printed_at: new Date().toISOString() });
    await db()
      .from("machines")
      .update({
        sides_bw_since_refill: machine.sides_bw_since_refill + bw,
        sides_color_since_refill: machine.sides_color_since_refill + color,
        sheets_since_refill: machine.sheets_since_refill + (r.sheets ?? bw + color),
      })
      .eq("id", machine.id);
    await releaseMachine(machine.id, order.id);
    await deleteOrderFiles(order.id);
    return { ok: true };
  }

  // gagal
  await logEvent(order.id, "PRINT_ERROR", `percobaan ${job.attempt}: ${r.error ?? "tidak diketahui"}`);
  // final = hasil cetak tidak pasti (mis. agent mati di tengah cetak): tidak dicetak ulang otomatis
  if (!r.final && job.attempt < MAX_PRINT_ATTEMPTS) {
    await db().from("print_jobs").update({ status: "queued", error: r.error ?? null }).eq("id", job.id);
    await setOrderStatus(order.id, "CETAK_ULANG");
    return { retry: true };
  }

  await db().from("print_jobs").update({ status: "failed", error: r.error ?? null, finished_at: new Date().toISOString() }).eq("id", job.id);
  await setOrderStatus(order.id, "GAGAL_CETAK");
  await db().from("refunds").insert({ order_id: order.id, status: "needs_info", kind: "full", amount: order.total, reason: "Gagal cetak: " + (r.error ?? "") });
  await setOrderStatus(order.id, "MENUNGGU_REFUND");
  // Mesin otomatis Tidak tersedia sampai admin menekan "Isi ulang selesai" (FR-FAIL-03)
  await db().from("machines").update({ fault: true, fault_reason: "Gagal cetak berulang, menunggu admin" }).eq("id", machine.id);
  await releaseMachine(machine.id, order.id);
  await raiseAlert("print_failed", machine.id, `Gagal cetak order ${order.code} di ${machine.name}: ${r.error ?? "?"}. Refund perlu diproses.`, `fail:${order.id}`);
  return { failed: true };
}
