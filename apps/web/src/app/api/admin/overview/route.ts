import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { handler, ok } from "@/lib/http";
import { kioskKey } from "@/lib/kiosk-key";
import { availabilityOf } from "@/lib/machine";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const adminEmail = await requireAdmin();
  const base = process.env.APP_URL || new URL(req.url).origin;
  const { data: machines } = await db().from("machines").select("*").order("created_at");
  const { data: settings } = await db().from("machine_settings").select("*");
  const sMap = new Map((settings ?? []).map((s) => [s.machine_id, s]));

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data: today } = await db().from("orders").select("total, status").gte("created_at", startOfDay.toISOString());
  const paidToday = (today ?? []).filter((o) => ["LUNAS", "MENCETAK", "SELESAI", "CETAK_ULANG"].includes(o.status));

  const { data: active } = await db()
    .from("orders")
    .select("id, code, status, total, machine_id, created_at")
    .in("status", ["MENUNGGU_BAYAR", "LUNAS", "MENCETAK", "CETAK_ULANG"])
    .order("created_at", { ascending: false });

  const { data: refunds } = await db()
    .from("refunds")
    .select("*, orders(code, status, files_deleted_at)")
    .in("status", ["needs_info", "pending"])
    .order("created_at");

  const { data: alerts } = await db().from("alerts").select("*").order("id", { ascending: false }).limit(15);
  const { data: tick } = await db().from("app_state").select("value").eq("key", "last_tick").maybeSingle();

  return ok({
    admin: adminEmail,
    machines: (machines ?? []).map((m) => {
      const { agent_token_hash, ...rest } = m;
      return {
        ...rest,
        hasAgentToken: !!agent_token_hash,
        availability: availabilityOf(m),
        settings: sMap.get(m.id) ?? null,
        kioskUrl: `${base}/kiosk/${m.id}?k=${kioskKey(m.id)}`,
      };
    }),
    today: { orders: paidToday.length, revenue: paidToday.reduce((s, o) => s + o.total, 0) },
    active: active ?? [],
    refunds: refunds ?? [],
    alerts: alerts ?? [],
    lastTick: tick?.value ?? null,
  });
});
