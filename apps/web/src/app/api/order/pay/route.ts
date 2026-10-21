import { PAY_WINDOW_SECONDS } from "@kioskcetak/shared";
import { db } from "@/lib/db";
import { HttpError, handler, ok } from "@/lib/http";
import { availabilityOf, loadMachine } from "@/lib/machine";
import { buildOrderView, logEvent, releaseMachine, setOrderStatus } from "@/lib/orders";
import { getProvider } from "@/lib/payments";
import { rateLimit } from "@/lib/rate-limit";
import { requireSession } from "@/lib/session";
import { toPriceConfig } from "@/lib/settings";
import { latestOrder } from "@/lib/user-order";

export const dynamic = "force-dynamic";

/**
 * Tombol "Bayar": mengunci mesin secara atomik, mengunci harga, lalu membuat QRIS (FR-LCK-02, FR-PRC-04).
 * Bila dipanggil ulang pada order yang sudah MENUNGGU_BAYAR, QR yang sama dikembalikan.
 */
export const POST = handler(async () => {
  const session = await requireSession();
  rateLimit("pay:" + session.id, 6, 60_000);
  const order = await latestOrder(session);
  if (!order) throw new HttpError(409, "Belum ada order.");

  if (order.status === "MENUNGGU_BAYAR") {
    const { data: pay } = await db().from("payments").select("*").eq("order_id", order.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (pay) return ok({ qrString: pay.qr_string, amount: pay.amount, expiresAt: order.pay_expires_at, code: order.code });
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
    await db().from("payments").insert({
      order_id: order.id,
      provider: provider.name,
      provider_ref: qr.providerRef,
      amount: view.totals.total,
      qr_string: qr.qrString,
      raw: qr.raw ?? null,
      expires_at: expiresAt.toISOString(),
    });
    for (const f of view.files) await db().from("order_files").update({ sides: f.sides, price: f.price }).eq("id", f.id);
    await setOrderStatus(order.id, "MENUNGGU_BAYAR", {
      total: view.totals.total,
      price_snapshot: cfg,
      pay_expires_at: expiresAt.toISOString(),
    });
    await db().from("sessions").update({ expires_at: new Date(Date.now() + 45 * 60_000).toISOString() }).eq("id", session.id);
    await logEvent(order.id, "QR_CREATED", provider.name);
    return ok({ qrString: qr.qrString, amount: view.totals.total, expiresAt: expiresAt.toISOString(), code: order.code });
  } catch (e) {
    console.error("[pay]", e);
    await releaseMachine(machine.id, order.id);
    throw new HttpError(502, "Gagal membuat QR pembayaran. Coba lagi.");
  }
});
