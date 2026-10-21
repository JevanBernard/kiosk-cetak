import { db } from "@/lib/db";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { HttpError, handler, ok, readJson } from "@/lib/http";

/** Membuat mesin baru + token agent (hanya ditampilkan sekali). */
export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const b = await readJson<{ name: string; location?: string }>(req);
  const name = String(b.name ?? "").trim().slice(0, 60);
  if (!name) throw new HttpError(400, "Nama mesin wajib diisi.");
  const { data: m, error } = await db().from("machines").insert({ name, location: String(b.location ?? "").slice(0, 120) || null }).select("id").single();
  if (error || !m) throw new HttpError(500, "Gagal membuat mesin.");
  await db().from("machine_settings").insert({ machine_id: m.id });
  const token = `${m.id}.${randomToken(32)}`;
  await db().from("machines").update({ agent_token_hash: sha256(token) }).eq("id", m.id);
  await audit(admin, "machine.create", { id: m.id });
  return ok({ id: m.id, agentToken: token });
});
