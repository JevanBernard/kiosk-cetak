import { db } from "./db";
import { HttpError } from "./http";
import { availabilityOf, loadMachine } from "./machine";
import { randomCode } from "./crypto";
import type { Session } from "./session";
import { logEvent } from "./orders";

export const DRAFT = ["DIBUAT", "DIUPLOAD", "DIATUR"];
const DONE = ["SELESAI", "KEDALUWARSA", "DIBATALKAN", "DIREFUND"];

export async function latestOrder(session: Session) {
  const { data } = await db()
    .from("orders")
    .select("*")
    .eq("session_id", session.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Record<string, any> | null;
}

/** Mengembalikan order draft milik sesi; membuat baru bila belum ada dan mesin Tersedia (FR-ACC-04). */
export async function ensureDraft(session: Session) {
  const last = await latestOrder(session);
  if (last && DRAFT.includes(last.status)) return last;
  if (last && !DONE.includes(last.status)) {
    throw new HttpError(409, "Order sebelumnya masih berjalan.", { code: "ORDER_ACTIVE" });
  }
  const { machine } = await loadMachine(session.machine_id);
  const a = availabilityOf(machine);
  if (a.state !== "available") throw new HttpError(409, a.reason ?? "Mesin tidak tersedia.", { code: "MACHINE_" + a.state.toUpperCase() });
  // Layar kiosk hanya melayani satu HP sekali waktu: draft segar milik sesi lain mengklaim layar.
  const { count: claimed } = await db()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("machine_id", session.machine_id)
    .in("status", DRAFT)
    .gt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString());
  if (claimed) throw new HttpError(409, "Layar mesin sedang dipakai pengguna lain. Tunggu sebentar.", { code: "MACHINE_BUSY" });
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db()
      .from("orders")
      .insert({ code: randomCode(10), machine_id: session.machine_id, session_id: session.id })
      .select("*")
      .single();
    if (!error && data) {
      await logEvent(data.id, "CREATED");
      return data as Record<string, any>;
    }
    if (error?.code !== "23505") throw error; // selain tabrakan kode, lempar
  }
  throw new HttpError(500, "Gagal membuat order.");
}

export async function requireDraft(session: Session) {
  const last = await latestOrder(session);
  if (!last || !DRAFT.includes(last.status)) throw new HttpError(409, "Tidak ada order yang bisa diubah.", { code: "NO_DRAFT" });
  return last;
}
