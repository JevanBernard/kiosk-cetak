import { db } from "@/lib/db";
import { HttpError, clientIp, handler, ok, readJson } from "@/lib/http";
import { buildOrderView, logEvent } from "@/lib/orders";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function byCode(code: string) {
  if (!/^[A-Z2-9]{8,16}$/.test(code)) throw new HttpError(404, "Kode transaksi tidak ditemukan.");
  const { data } = await db().from("orders").select("id").eq("code", code).maybeSingle();
  if (!data) throw new HttpError(404, "Kode transaksi tidak ditemukan.");
  return data.id as string;
}

/** Halaman status publik via kode transaksi. Tanpa isi dokumen (FR-STS-03). */
export const GET = handler(async (req: Request, { params }: { params: { code: string } }) => {
  rateLimit("status:" + clientIp(req), 40, 60_000, "Terlalu banyak percobaan kode. Tunggu semenit.");
  const id = await byCode(params.code.toUpperCase());
  const view = await buildOrderView(id);
  if (!view) throw new HttpError(404, "Kode transaksi tidak ditemukan.");
  const { data: machine } = await db().from("machines").select("name, location").eq("id", view.order.machine_id).single();
  const { data: settings } = await db().from("machine_settings").select("admin_whatsapp").eq("machine_id", view.order.machine_id).single();
  const { data: refund } = await db().from("refunds").select("status, kind, amount, done_at").eq("order_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: payment } = await db().from("payments").select("provider, status").eq("order_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return ok({
    order: view.order,
    files: view.files.map((f) => ({ name: f.name, pages: f.pages, sides: f.sides, price: f.price, options: f.options })),
    totals: view.totals,
    machine,
    whatsapp: settings?.admin_whatsapp ?? null,
    refund,
    payment,
  });
});

/** Form data refund; hanya diminta saat gagal cetak (FR-FAIL-04). */
export const POST = handler(async (req: Request, { params }: { params: { code: string } }) => {
  rateLimit("refund:" + clientIp(req), 10, 60_000);
  const id = await byCode(params.code.toUpperCase());
  const body = await readJson<{ name: string; destination: string }>(req);
  const name = String(body.name ?? "").trim().slice(0, 80);
  const destination = String(body.destination ?? "").trim().slice(0, 120);
  if (name.length < 2 || destination.length < 5) throw new HttpError(400, "Isi nama dan tujuan transfer (e-wallet/rekening) dengan lengkap.");
  const { data, error } = await db()
    .from("refunds")
    .update({ holder_name: name, destination, status: "pending" })
    .eq("order_id", id)
    .eq("status", "needs_info")
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new HttpError(409, "Tidak ada refund yang menunggu data.");
  await logEvent(id, "REFUND_INFO");
  return ok();
});
