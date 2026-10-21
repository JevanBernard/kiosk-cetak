import { KIOSK_TOKEN_ROTATE_SECONDS } from "@kioskcetak/shared";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { handler, ok } from "@/lib/http";
import { kioskOrder, requireKiosk } from "@/lib/kiosk-order";
import { DRAFT } from "@/lib/user-order";
import { availabilityOf, loadMachine } from "@/lib/machine";
import { buildOrderView } from "@/lib/orders";
import { toPriceConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Status layar kiosk: QR dinamis (rotasi 60 dtk), status mesin, hitung mundur bayar, progres cetak. */
export const GET = handler(async (req: Request, { params }: { params: { machineId: string } }) => {
  const url = new URL(req.url);
  requireKiosk(req, params.machineId);
  const { machine, settings } = await loadMachine(params.machineId);
  const availability = availabilityOf(machine);

  // Token QR terbaru yang belum dipakai dan belum lewat 60 detik; kalau tidak ada, buat baru.
  const fresh = new Date(Date.now() - KIOSK_TOKEN_ROTATE_SECONDS * 1000).toISOString();
  let { data: tok } = await db()
    .from("kiosk_tokens")
    .select("token, created_at")
    .eq("machine_id", machine.id)
    .is("used_at", null)
    .gt("created_at", fresh)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!tok && availability.state === "available") {
    const created = await db().from("kiosk_tokens").insert({ token: randomToken(18), machine_id: machine.id }).select("token, created_at").single();
    tok = created.data;
  }

  const base = process.env.APP_URL || url.origin;
  // Order yang sedang dikendalikan layar: draft (atur cetak), menunggu bayar (tampil QRIS), atau sedang dicetak.
  const order = await kioskOrder(machine);
  let progress: unknown = null;
  let view: Awaited<ReturnType<typeof buildOrderView>> = null;
  let qr: { qrString: string; amount: number } | null = null;
  if (order) {
    if (!DRAFT.includes(order.status)) {
      const { data: job } = await db().from("print_jobs").select("status, attempt, progress").eq("order_id", order.id).maybeSingle();
      progress = job;
    }
    if (DRAFT.includes(order.status) || order.status === "MENUNGGU_BAYAR") view = await buildOrderView(order.id);
    if (order.status === "MENUNGGU_BAYAR") {
      const { data: pay } = await db().from("payments").select("qr_string, amount").eq("order_id", order.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (pay) qr = { qrString: pay.qr_string, amount: pay.amount };
    }
  }
  const drafting = !!order && DRAFT.includes(order.status);
  const since = new Date(Date.now() - 45_000).toISOString();
  const { data: finished } = await db().from("orders").select("code, printed_at").eq("machine_id", machine.id).eq("status", "SELESAI").gt("printed_at", since).order("printed_at", { ascending: false }).limit(1).maybeSingle();

  const seen = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db().from("sessions").select("id", { count: "exact", head: true }).eq("machine_id", machine.id).gt("last_seen_at", seen).gt("expires_at", new Date().toISOString());

  return ok({
    name: machine.name,
    code: machine.code ?? null,
    location: machine.location ?? null,
    availability,
    hardware: {
      paperLeft: Math.max(0, settings.paper_capacity - machine.sheets_since_refill),
      paperCapacity: settings.paper_capacity,
      inkBw: Math.max(0, Math.round(100 - (machine.sides_bw_since_refill / settings.ink_bw_capacity) * 100)),
      inkColor: Math.max(0, Math.round(100 - (machine.sides_color_since_refill / settings.ink_color_capacity) * 100)),
      duplex: Boolean(settings.allow_duplex && machine.capabilities?.duplex),
      color: Boolean(settings.allow_color && machine.capabilities?.color),
    },
    adminWhatsapp: settings.admin_whatsapp ?? null,
    qrUrl: tok && availability.state === "available" && !drafting ? `${base}/s/${tok.token}` : null,
    qrRotatesAt: tok ? new Date(new Date(tok.created_at).getTime() + KIOSK_TOKEN_ROTATE_SECONDS * 1000).toISOString() : null,
    phoneConnected: (count ?? 0) > 0,
    order: order && { status: order.status, code: order.code, payExpiresAt: order.pay_expires_at, total: order.total },
    view: view && { files: view.files, totals: view.totals, ready: view.ready, minTotal: view.minTotal, estimateSeconds: view.estimateSeconds },
    config: toPriceConfig(settings),
    capabilities: machine.capabilities,
    qr,
    progress,
    finished: finished ? { code: finished.code } : null,
    prices: {
      bw: settings.price_bw_single,
      bwDuplex: settings.price_bw_duplex,
      color: settings.price_color_single,
      colorDuplex: settings.price_color_duplex,
    },
  });
});
