import { db } from "@/lib/db";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { HttpError, handler, ok, readJson } from "@/lib/http";

const CODE_RE = /^[A-Z0-9-]{1,8}$/;

/** Membuat mesin baru + token agent (hanya ditampilkan sekali). */
export const POST = handler(async (req: Request) => {
  const admin = await requireAdmin();
  const b = await readJson<{ name: string; location?: string; code?: string }>(req);
  const name = String(b.name ?? "").trim().slice(0, 60);
  if (!name) throw new HttpError(400, "Nama mesin wajib diisi.");
  let code = String(b.code ?? "").trim().toUpperCase();
  if (code && !CODE_RE.test(code)) throw new HttpError(400, "Kode mesin 1-8 karakter: huruf, angka, atau tanda hubung.");
  if (!code) {
    // Otomatis: nomor berikutnya setelah kode numerik terbesar (001, 002, ...).
    const { data: all } = await db().from("machines").select("code");
    const max = (all ?? []).reduce((n, r) => (/^\d+$/.test(r.code ?? "") ? Math.max(n, Number(r.code)) : n), 0);
    code = String(max + 1).padStart(3, "0");
  }
  const { data: m, error } = await db().from("machines").insert({ name, code, location: String(b.location ?? "").slice(0, 120) || null }).select("id").single();
  if (error?.code === "23505") throw new HttpError(409, `Kode mesin ${code} sudah dipakai.`);
  if (error || !m) throw new HttpError(500, "Gagal membuat mesin.");
  await db().from("machine_settings").insert({ machine_id: m.id });
  const token = `${m.id}.${randomToken(32)}`;
  await db().from("machines").update({ agent_token_hash: sha256(token) }).eq("id", m.id);
  await audit(admin, "machine.create", { id: m.id });
  return ok({ id: m.id, agentToken: token });
});
