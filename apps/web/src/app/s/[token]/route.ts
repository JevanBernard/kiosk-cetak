import { NextResponse } from "next/server";
import { KIOSK_TOKEN_GRACE_SECONDS, KIOSK_TOKEN_ROTATE_SECONDS, SESSION_MINUTES } from "@kioskcetak/shared";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Hasil scan QR: tukar token kiosk (sekali pakai) menjadi sesi HP lalu arahkan ke /order. */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const base = process.env.APP_URL || new URL(req.url).origin;
  try {
    rateLimit("scan:" + clientIp(req), 20, 60_000);
  } catch {
    return NextResponse.redirect(new URL("/order?e=rate", base));
  }
  const minAge = new Date(Date.now() - (KIOSK_TOKEN_ROTATE_SECONDS + KIOSK_TOKEN_GRACE_SECONDS) * 1000).toISOString();
  // Penukaran atomik: hanya satu pemindai yang bisa memakai token ini.
  const { data: tok } = await db()
    .from("kiosk_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", params.token)
    .is("used_at", null)
    .gt("created_at", minAge)
    .select("machine_id")
    .maybeSingle();
  if (!tok) return NextResponse.redirect(new URL("/order?e=qr", base));

  const secret = randomToken(32);
  await db().from("sessions").insert({
    machine_id: tok.machine_id,
    token_hash: sha256(secret),
    expires_at: new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString(),
  });
  const res = NextResponse.redirect(new URL("/order", base));
  res.cookies.set(SESSION_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
  return res;
}
