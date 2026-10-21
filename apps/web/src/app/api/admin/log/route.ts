import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { handler, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Log sistem untuk admin: jejak audit tindakan admin dan alert terbaru. */
export const GET = handler(async () => {
  await requireAdmin();
  const { data: audit } = await db().from("audit_log").select("id, actor, action, detail, created_at").order("id", { ascending: false }).limit(100);
  const { data: alerts } = await db().from("alerts").select("id, kind, message, sent, created_at").order("id", { ascending: false }).limit(100);
  return ok({ audit: audit ?? [], alerts: alerts ?? [] });
});
