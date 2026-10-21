import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ADMIN_COOKIE, audit } from "@/lib/admin-auth";
import { HttpError, clientIp, handler, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const POST = handler(async (req: Request) => {
  rateLimit("admin-login:" + clientIp(req), 8, 5 * 60_000, "Terlalu banyak percobaan login. Coba lagi 5 menit lagi.");
  const { email, password } = await readJson<{ email: string; password: string }>(req);
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email: String(email ?? "").trim(), password: String(password ?? "") });
  const mail = data.user?.email?.toLowerCase();
  if (error || !data.session || !mail) throw new HttpError(401, "Email atau password salah.");
  const { data: admin } = await db().from("admins").select("email").eq("email", mail).maybeSingle();
  if (!admin) throw new HttpError(403, "Akun ini bukan admin.");

  await audit(mail, "login");
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.min(data.session.expires_in ?? 3600, 8 * 3600), // sesi berbatas waktu (NFR-SEC-09)
  });
  return res;
});
