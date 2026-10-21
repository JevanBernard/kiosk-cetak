import { DEFAULT_OPTIONS, NUP_VALUES, PAY_WINDOW_SECONDS, priceFile, type NUp, type PrintOptions } from "@kioskcetak/shared";
import { BUCKET, db } from "./db";
import { HttpError } from "./http";
import { safeEqual } from "./crypto";
import { kioskKey } from "./kiosk-key";
import { availabilityOf, loadMachine } from "./machine";
import { buildOrderView, deleteOrderFiles, logEvent, refreshDraftStatus, releaseMachine, setOrderStatus } from "./orders";
import { getProvider } from "./payments";
import { toPriceConfig } from "./settings";
import { DRAFT } from "./user-order";

/** Draft yang tidak disentuh selama ini dilepas dari layar kiosk (file baru dihapus cron setelah 1 jam). */
export const KIOSK_IDLE_MS = 10 * 60_000;

export function requireKiosk(req: Request, machineId: string) {
  const k = new URL(req.url).searchParams.get("k") ?? "";
  if (!safeEqual(k, kioskKey(machineId))) throw new HttpError(403, "Kunci kiosk salah.");
}

export function freshSince() {
  return new Date(Date.now() - KIOSK_IDLE_MS).toISOString();
}

export async function touchOrder(orderId: string) {
  await db().from("orders").update({ updated_at: new Date().toISOString() }).eq("id", orderId);
}

/**
 * Order yang sedang dikendalikan layar kiosk: order aktif (menunggu bayar / dicetak), atau draft
 * terbaru yang masih segar. HP yang pertama mengunggah "mengklaim" layar (lihat ensureDraft).
 */
export async function kioskOrder(machine: Record<string, any>) {
  if (machine.active_order_id) {
    const { data } = await db().from("orders").select("*").eq("id", machine.active_order_id).maybeSingle();
    if (data) return data as Record<string, any>;
  }
  const { data } = await db()
    .from("orders")
    .select("*")
    .eq("machine_id", machine.id)
    .in("status", DRAFT)
    .gt("updated_at", freshSince())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Record<string, any> | null) ?? null;
}

export async function kioskDraft(machineId: string) {
  const { machine } = await loadMachine(machineId);
  const order = await kioskOrder(machine);
  if (!order || !DRAFT.includes(order.status)) throw new HttpError(409, "Tidak ada order yang bisa diubah.", { code: "NO_DRAFT" });
  return order;
}

async function ownFile(orderId: string, id: string) {
  const { data } = await db().from("order_files").select("*").eq("id", id).eq("order_id", orderId).maybeSingle();
  if (!data) throw new HttpError(404, "File tidak ditemukan.");
  return data as Record<string, any>;
}

/** Menyimpan opsi cetak. Harga dihitung di server dari konfigurasi mesin (FR-PRC-05). */
export async function saveFileOptions(order: Record<string, any>, fileId: string, body: Partial<PrintOptions>) {
  const file = await ownFile(order.id, fileId);
  if (file.status !== "ready" || !file.pages) throw new HttpError(409, "File belum siap diatur.");
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
  await touchOrder(order.id);
  return { sides: priced.sides, price: priced.total };
}

export async function removeFile(order: Record<string, any>, fileId: string) {
  const file = await ownFile(order.id, fileId);
  const paths = [file.storage_path, file.converted_path].filter(Boolean);
  if (paths.length) await db().storage.from(BUCKET).remove(paths);
  await db().from("order_files").delete().eq("id", file.id);
  await refreshDraftStatus(order.id);
  await touchOrder(order.id);
}

/**
 * Tombol "Bayar": mengunci mesin secara atomik, mengunci harga, lalu membuat QRIS (FR-LCK-02, FR-PRC-04).
 * Bila dipanggil ulang pada order yang sudah MENUNGGU_BAYAR, QR yang sama dikembalikan.
 */
export async function startPayment(order: Record<string, any>) {
  if (order.status === "MENUNGGU_BAYAR") {
    const { data: pay } = await db().from("payments").select("*").eq("order_id", order.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (pay) return { qrString: pay.qr_string as string, amount: pay.amount as number, expiresAt: order.pay_expires_at as string, code: order.code as string };
  }
  if (order.status !== "DIATUR") throw new HttpError(409, "Order belum siap dibayar.");

  const view = await buildOrderView(order.id);
  if (!view || !view.ready) throw new HttpError(409, "Masih ada file yang belum siap atau opsinya belum valid.");
  const { machine, settings } = await loadMachine(order.machine_id);
  if (view.totals.total < settings.min_total) {
    throw new HttpError(400, `Total minimal Rp ${settings.min_total.toLocaleString("id-ID")}. Tambah halaman atau salinan.`);
  }

  // Kunci atomik: hanya satu order aktif per mesin
  const { data: locked } = await db().rpc("lock_machine", { p_machine: machine.id, p_order: order.id });
  if (!locked) throw new HttpError(409, "Mesin baru saja dipakai pengguna lain. Tunggu sebentar lalu coba lagi.", { code: "MACHINE_BUSY" });

  const fresh = await loadMachine(machine.id);
  const avail = availabilityOf({ ...fresh.machine, active_order_id: null }); // lock milik kita sendiri
  if (avail.state !== "available") {
    await releaseMachine(machine.id, order.id);
    throw new HttpError(409, avail.reason ?? "Mesin tidak tersedia.", { code: "MACHINE_UNAVAILABLE" });
  }

  const expiresAt = new Date(Date.now() + PAY_WINDOW_SECONDS * 1000);
  try {
    const provider = getProvider();
    const qr = await provider.createQr({ orderId: order.id, code: order.code, amount: view.totals.total, expiresAt });
    const cfg = toPriceConfig(settings);
    const { error: payErr } = await db().from("payments").insert({
      order_id: order.id,
      provider: provider.name,
      provider_ref: qr.providerRef,
      amount: view.totals.total,
      qr_string: qr.qrString,
      raw: qr.raw ?? null,
      expires_at: expiresAt.toISOString(),
    });
    if (payErr) throw payErr; // jangan tampilkan QR bila pembayaran tidak tercatat
    for (const f of view.files) await db().from("order_files").update({ sides: f.sides, price: f.price }).eq("id", f.id);
    await setOrderStatus(order.id, "MENUNGGU_BAYAR", {
      total: view.totals.total,
      price_snapshot: cfg,
      pay_expires_at: expiresAt.toISOString(),
    });
    // Sesi HP harus bertahan sampai nota diunduh
    if (order.session_id) await db().from("sessions").update({ expires_at: new Date(Date.now() + 45 * 60_000).toISOString() }).eq("id", order.session_id);
    await logEvent(order.id, "QR_CREATED", provider.name);
    return { qrString: qr.qrString, amount: view.totals.total, expiresAt: expiresAt.toISOString(), code: order.code as string };
  } catch (e) {
    console.error("[pay]", e);
    await releaseMachine(machine.id, order.id);
    throw new HttpError(502, "Gagal membuat QR pembayaran. Coba lagi.");
  }
}

/** Pembatalan hanya sebelum pembayaran masuk (FR-PAY-08). */
export async function cancelOrder(order: Record<string, any>) {
  if (![...DRAFT, "MENUNGGU_BAYAR"].includes(order.status)) throw new HttpError(409, "Order tidak bisa dibatalkan.");
  await db().from("payments").update({ status: "expired" }).eq("order_id", order.id).eq("status", "pending");
  await setOrderStatus(order.id, "DIBATALKAN");
  await releaseMachine(order.machine_id, order.id);
  await deleteOrderFiles(order.id);
}
