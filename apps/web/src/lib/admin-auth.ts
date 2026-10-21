import { cookies } from "next/headers";
import { db } from "./db";
import { HttpError } from "./http";

export const ADMIN_COOKIE = "kc_admin";

/** Memeriksa token Supabase Auth di cookie dan memastikan emailnya ada di tabel admins. */
export async function getAdmin(): Promise<string | null> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const { data, error } = await db().auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !email) return null;
  const { data: row } = await db().from("admins").select("email").eq("email", email).maybeSingle();
  return row ? email : null;
}

export async function requireAdmin(): Promise<string> {
  const email = await getAdmin();
  if (!email) throw new HttpError(401, "Perlu login admin.", { code: "NO_ADMIN" });
  return email;
}

export async function audit(actor: string, action: string, detail?: unknown) {
  await db().from("audit_log").insert({ actor, action, detail: detail ?? null });
}
