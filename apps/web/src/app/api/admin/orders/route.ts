import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { handler, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Riwayat transaksi: hanya metadata, tidak pernah isi dokumen (FR-DAT-05). */
export const GET = handler(async (req: Request) => {
  await requireAdmin();
  const u = new URL(req.url);
  const from = u.searchParams.get("from");
  const to = u.searchParams.get("to");
  const status = u.searchParams.get("status");
  const q = (u.searchParams.get("q") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let query = db()
    .from("orders")
    .select("id, code, status, total, created_at, paid_at, printed_at, machines(name), order_files(original_name, pages, sides, price)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (from) query = query.gte("created_at", new Date(from).toISOString());
  if (to) query = query.lt("created_at", new Date(new Date(to).getTime() + 86_400_000).toISOString());
  if (status) query = query.eq("status", status);
  if (q) query = query.ilike("code", `%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return ok({ orders: data ?? [] });
});
