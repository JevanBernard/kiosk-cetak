import { db } from "@/lib/db";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { HttpError, handler, ok, readJson } from "@/lib/http";
import { releaseMachine } from "@/lib/orders";

const INT_FIELDS: Record<string, [number, number]> = {
  price_bw_single: [0, 100000],
  price_bw_duplex: [0, 100000],
  price_color_single: [0, 100000],
  price_color_duplex: [0, 100000],
  max_copies: [1, 500],
  min_total: [0, 1000000],
  paper_capacity: [1, 5000],
  paper_warn: [0, 5000],
  ink_bw_capacity: [1, 1000000],
  ink_color_capacity: [1, 1000000],
  ink_warn_pct: [0, 100],
  offline_alert_minutes: [1, 1440],
};
const BOOL_FIELDS = ["allow_color", "allow_duplex", "allow_nup"];

/** Ubah harga/opsi tanpa deploy (NFR-SCL-04). Perubahan tidak memengaruhi order yang sudah dikunci. */
export const PATCH = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const b = await readJson<Record<string, unknown>>(req);
  const patch: Record<string, unknown> = {};
  for (const [k, [min, max]] of Object.entries(INT_FIELDS)) {
    if (b[k] === undefined) continue;
    const n = Number(b[k]);
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Nilai ${k} harus bilangan bulat ${min}-${max}.`);
    patch[k] = n;
  }
  for (const k of BOOL_FIELDS) if (b[k] !== undefined) patch[k] = Boolean(b[k]);
  if (b.rounding !== undefined) {
    if (![100, 500].includes(Number(b.rounding))) throw new HttpError(400, "Pembulatan harus 100 atau 500.");
    patch.rounding = Number(b.rounding);
  }
  if (b.admin_whatsapp !== undefined) {
    const wa = String(b.admin_whatsapp).replace(/\D/g, "");
    patch.admin_whatsapp = wa || null;
  }
  // Identitas mesin (tabel machines): nama, lokasi, kode unik seperti 001.
  const identity: Record<string, unknown> = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim().slice(0, 60);
    if (!name) throw new HttpError(400, "Nama mesin wajib diisi.");
    identity.name = name;
  }
  if (b.location !== undefined) identity.location = String(b.location).trim().slice(0, 120) || null;
  if (b.code !== undefined) {
    const code = String(b.code).trim().toUpperCase();
    if (!/^[A-Z0-9-]{1,8}$/.test(code)) throw new HttpError(400, "Kode mesin 1-8 karakter: huruf, angka, atau tanda hubung.");
    identity.code = code;
  }
  if (!Object.keys(patch).length && !Object.keys(identity).length) throw new HttpError(400, "Tidak ada perubahan.");
  if (Object.keys(identity).length) {
    const { error } = await db().from("machines").update(identity).eq("id", params.id);
    if (error?.code === "23505") throw new HttpError(409, `Kode mesin ${identity.code} sudah dipakai.`);
    if (error) throw new HttpError(500, "Gagal menyimpan identitas mesin.");
  }
  if (Object.keys(patch).length) await db().from("machine_settings").update(patch).eq("machine_id", params.id);
  await audit(admin, "settings.update", { machine: params.id, patch: { ...patch, ...identity } });
  return ok();
});

/** Aksi operasional pada mesin. */
export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const admin = await requireAdmin();
  const { action } = await readJson<{ action: string }>(req);
  const id = params.id;
  const { data: m } = await db().from("machines").select("*").eq("id", id).maybeSingle();
  if (!m) throw new HttpError(404, "Mesin tidak ditemukan.");

  switch (action) {
    case "refill": // "Isi ulang selesai": reset estimasi dan aktifkan mesin (FR-ADM-06)
      await db().from("machines").update({ sides_bw_since_refill: 0, sides_color_since_refill: 0, sheets_since_refill: 0, fault: false, fault_reason: null }).eq("id", id);
      break;
    case "clear-fault":
      await db().from("machines").update({ fault: false, fault_reason: null }).eq("id", id);
      break;
    case "unlock": // lepas kunci manual (FR-LCK-04)
      if (m.active_order_id) await releaseMachine(id, m.active_order_id);
      break;
    case "maintenance-on":
      await db().from("machines").update({ maintenance: true }).eq("id", id);
      break;
    case "maintenance-off":
      await db().from("machines").update({ maintenance: false }).eq("id", id);
      break;
    case "rotate-token": {
      const token = `${id}.${randomToken(32)}`;
      await db().from("machines").update({ agent_token_hash: sha256(token) }).eq("id", id);
      await audit(admin, "machine.token", { id });
      return ok({ agentToken: token });
    }
    case "revoke-token":
      await db().from("machines").update({ agent_token_hash: null }).eq("id", id);
      break;
    default:
      throw new HttpError(400, "Aksi tidak dikenal.");
  }
  await audit(admin, "machine." + action, { id });
  return ok();
});
