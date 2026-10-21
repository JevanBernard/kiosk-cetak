import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { handler, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

const PAID = ["LUNAS", "MENCETAK", "SELESAI", "CETAK_ULANG", "GAGAL_CETAK", "MENUNGGU_REFUND", "DIREFUND"];

/** Laporan pendapatan per hari atau bulan (?group=day|month), ekspor CSV dengan ?format=csv. */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const u = new URL(req.url);
  const group = u.searchParams.get("group") === "month" ? "month" : "day";
  const from = u.searchParams.get("from") ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const to = u.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  const { data: orders, error } = await db()
    .from("orders")
    .select("id, status, total, paid_at, order_files(sides, options)")
    .in("status", PAID)
    .gte("paid_at", new Date(from).toISOString())
    .lt("paid_at", new Date(new Date(to).getTime() + 86_400_000).toISOString());
  if (error) throw error;
  const { data: refunds } = await db().from("refunds").select("amount, done_at").eq("status", "done");

  const rows = new Map<string, { period: string; orders: number; sides: number; sheets: number; revenue: number; refunded: number }>();
  const key = (iso: string) => (group === "month" ? iso.slice(0, 7) : iso.slice(0, 10));
  const row = (k: string) => {
    if (!rows.has(k)) rows.set(k, { period: k, orders: 0, sides: 0, sheets: 0, revenue: 0, refunded: 0 });
    return rows.get(k)!;
  };
  for (const o of orders ?? []) {
    const r = row(key(o.paid_at));
    r.orders += 1;
    r.revenue += o.total;
    for (const f of (o.order_files as any[]) ?? []) {
      const sides = (f.sides ?? 0) * (f.options?.copies ?? 1);
      r.sides += sides;
      r.sheets += f.options?.duplex ? Math.ceil(sides / 2) : sides;
    }
  }
  for (const rf of refunds ?? []) if (rf.done_at && rf.done_at.slice(0, 10) >= from && rf.done_at.slice(0, 10) <= to) row(key(rf.done_at)).refunded += rf.amount;

  const list = [...rows.values()].sort((a, b) => a.period.localeCompare(b.period));
  if (u.searchParams.get("format") === "csv") {
    const csv = ["periode,order,sisi,lembar,pendapatan,refund,bersih", ...list.map((r) => [r.period, r.orders, r.sides, r.sheets, r.revenue, r.refunded, r.revenue - r.refunded].join(","))].join("\n");
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="laporan-${group}-${from}_${to}.csv"` } });
  }
  return ok({ rows: list });
});
