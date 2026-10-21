import {
  DEFAULT_OPTIONS,
  estimateSeconds,
  orderTotal,
  priceFile,
  type PrintOptions,
} from "@kioskcetak/shared";
import { BUCKET, db } from "./db";
import { toPriceConfig } from "./settings";

export async function logEvent(orderId: string, type: string, detail?: string) {
  await db().from("order_events").insert({ order_id: orderId, type, detail: detail ?? null });
}

export async function setOrderStatus(orderId: string, status: string, extra: Record<string, unknown> = {}) {
  await db()
    .from("orders")
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq("id", orderId);
  await logEvent(orderId, "STATUS", status);
}

/** Menghapus semua file order dari Storage (FR-DAT-02, FR-PRT-07). Tidak mengubah baris order_files. */
export async function deleteOrderFiles(orderId: string) {
  const { data: files } = await db().from("order_files").select("storage_path, converted_path").eq("order_id", orderId);
  const paths = (files ?? []).flatMap((f) => [f.storage_path, f.converted_path]).filter(Boolean) as string[];
  if (paths.length) await db().storage.from(BUCKET).remove(paths);
  await db().from("orders").update({ files_deleted_at: new Date().toISOString() }).eq("id", orderId);
  await logEvent(orderId, "FILES_DELETED", `${paths.length} file`);
}

export async function releaseMachine(machineId: string, orderId: string) {
  await db().rpc("release_machine", { p_machine: machineId, p_order: orderId });
}

/** Menetapkan status DIBUAT/DIUPLOAD/DIATUR dari kondisi file. Hanya untuk order yang belum masuk pembayaran. */
export async function refreshDraftStatus(orderId: string) {
  const { data: order } = await db().from("orders").select("status").eq("id", orderId).single();
  if (!order || !["DIBUAT", "DIUPLOAD", "DIATUR"].includes(order.status)) return;
  const { data: files } = await db().from("order_files").select("status").eq("order_id", orderId);
  let next = "DIBUAT";
  if (files && files.length) next = files.every((f) => f.status === "ready") ? "DIATUR" : "DIUPLOAD";
  if (next !== order.status) await setOrderStatus(orderId, next);
}

export function defaultOptionsFor(kind: string, allowColor: boolean): PrintOptions {
  // Gambar dihitung warna kecuali user memilih hitam-putih (PRD bagian 9).
  return { ...DEFAULT_OPTIONS, color: kind === "image" && allowColor };
}

export async function buildOrderView(orderId: string) {
  const { data: order } = await db().from("orders").select("*").eq("id", orderId).single();
  if (!order) return null;
  const { data: files } = await db().from("order_files").select("*").eq("order_id", orderId).order("position");
  const { data: settings } = await db().from("machine_settings").select("*").eq("machine_id", order.machine_id).single();
  const cfg = toPriceConfig(order.price_snapshot ?? settings ?? {});

  const items = (files ?? []).map((f) => {
    let sides: number | null = null;
    let price: number | null = null;
    let optionError: string | null = null;
    if (f.status === "ready" && f.options && f.pages) {
      const r = priceFile(f.options as PrintOptions, f.pages, cfg);
      if ("error" in r) optionError = r.error;
      else {
        sides = r.sides;
        price = r.total;
      }
    }
    return {
      id: f.id,
      name: f.original_name,
      kind: f.kind,
      status: f.status as string,
      error: f.error as string | null,
      pages: f.pages as number | null,
      options: (f.options as PrintOptions | null) ?? null,
      sides,
      price,
      optionError,
    };
  });

  const priced = items.filter((i) => i.price !== null);
  const totals = orderTotal(priced.map((i) => i.price as number), cfg);
  const seconds = estimateSeconds(
    priced.map((i) => ({ sides: i.sides as number, copies: i.options!.copies, color: i.options!.color })),
  );
  const ready = items.length > 0 && items.every((i) => i.status === "ready" && i.price !== null);

  return {
    order: {
      id: order.id as string,
      code: order.code as string,
      status: order.status as string,
      machine_id: order.machine_id as string,
      pay_expires_at: order.pay_expires_at as string | null,
      paid_at: order.paid_at as string | null,
      printed_at: order.printed_at as string | null,
      created_at: order.created_at as string,
      total: (order.status === "DIBUAT" || order.status === "DIUPLOAD" || order.status === "DIATUR" ? totals.total : order.total) as number,
    },
    files: items,
    totals,
    estimateSeconds: seconds,
    ready,
    minTotal: settings?.min_total ?? 0,
  };
}
