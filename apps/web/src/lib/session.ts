import { cookies } from "next/headers";
import { db } from "./db";
import { sha256 } from "./crypto";
import { HttpError } from "./http";

export const SESSION_COOKIE = "kc_session";

export type Session = { id: string; machine_id: string; expires_at: string };

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { data } = await db()
    .from("sessions")
    .select("id, machine_id, expires_at")
    .eq("token_hash", sha256(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  await db().from("sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return data;
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Sesi berakhir. Scan ulang QR di layar mesin.", { code: "NO_SESSION" });
  return s;
}
