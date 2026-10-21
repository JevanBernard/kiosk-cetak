import { fail, handler, ok } from "@/lib/http";
import { safeEqual } from "@/lib/crypto";
import { runTick } from "@/lib/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !safeEqual(given, secret)) return fail(401, "Tidak berwenang.");
  return ok(await runTick());
}

// Vercel Cron memakai GET, penjadwal lain biasanya POST.
export const GET = handler(run);
export const POST = handler(run);
