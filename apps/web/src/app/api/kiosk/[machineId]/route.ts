import { KIOSK_TOKEN_ROTATE_SECONDS } from "@kioskcetak/shared";
import { db } from "@/lib/db";
import { randomToken, safeEqual } from "@/lib/crypto";
import { HttpError, handler, ok } from "@/lib/http";
import { kioskKey } from "@/lib/kiosk-key";
import { availabilityOf, loadMachine } from "@/lib/machine";

export const dynamic = "force-dynamic";

/** Status layar kiosk: QR dinamis (rotasi 60 dtk), status mesin, hitung mundur bayar, progres cetak. */
export const GET = handler(async (req: Request, { params }: { params: { machineId: string } }) => {
  const url = new URL(req.url);
  if (!safeEqual(url.searchParams.get("k") ?? "", kioskKey(params.machineId))) throw new HttpError(403, "Kunci kiosk salah.");
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
  let order: Record<string, any> | null = null;
  let progress: unknown = null;
  if (machine.active_order_id) {
    const { data } = await db().from("orders").select("id, code, status, pay_expires_at, total").eq("id", machine.active_order_id).maybeSingle();
    order = data;
    if (data) {
      const { data: job } = await db().from("print_jobs").select("status, attempt, progress").eq("order_id", data.id).maybeSingle();
      progress = job;
    }
  }
  const since = new Date(Date.now() - 45_000).toISOString();
  const { data: finished } = await db().from("orders").select("code, printed_at").eq("machine_id", machine.id).eq("status", "SELESAI").gt("printed_at", since).order("printed_at", { ascending: false }).limit(1).maybeSingle();

  const seen = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db().from("sessions").select("id", { count: "exact", head: true }).eq("machine_id", machine.id).gt("last_seen_at", seen).gt("expires_at", new Date().toISOString());

  return ok({
    name: machine.name,
    availability,
    qrUrl: tok && availability.state === "available" ? `${base}/s/${tok.token}` : null,
    qrRotatesAt: tok ? new Date(new Date(tok.created_at).getTime() + KIOSK_TOKEN_ROTATE_SECONDS * 1000).toISOString() : null,
    phoneConnected: (count ?? 0) > 0,
    order: order && { status: order.status, payExpiresAt: order.pay_expires_at, total: order.total },
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
