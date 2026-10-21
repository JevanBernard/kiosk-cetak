import { db } from "./db";

/** Mencatat alert dan mengirim ke Telegram. Alert dengan dedupe_key sama dalam 30 menit tidak dikirim ulang. */
export async function raiseAlert(kind: string, machineId: string | null, message: string, dedupeKey?: string) {
  if (dedupeKey) {
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data } = await db().from("alerts").select("id").eq("dedupe_key", dedupeKey).gt("created_at", since).limit(1);
    if (data && data.length) return;
  }
  const { data: row } = await db()
    .from("alerts")
    .insert({ kind, machine_id: machineId, message, dedupe_key: dedupeKey ?? null })
    .select("id")
    .single();
  await sendPending(row?.id);
}

export async function sendPending(onlyId?: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return; // belum dikonfigurasi: alert tetap tampil di dashboard
  let q = db().from("alerts").select("id, message").eq("sent", false).order("id").limit(20);
  if (onlyId) q = q.eq("id", onlyId);
  const { data } = await q;
  for (const a of data ?? []) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: `PaperMate: ${a.message}` }),
      });
      if (res.ok) await db().from("alerts").update({ sent: true }).eq("id", a.id);
    } catch (e) {
      console.error("[telegram]", e);
    }
  }
}
