import { db } from "./db";
import { deleteOrderFiles, releaseMachine, setOrderStatus } from "./orders";
import { getProvider } from "./payments";
import { applyJobReport } from "./printing";
import { HEARTBEAT_TIMEOUT_MS } from "./machine";
import { raiseAlert, sendPending } from "./telegram";

const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const MIN = 60_000;

async function expireOrder(o: { id: string; machine_id: string }, status = "KEDALUWARSA") {
  await db().from("payments").update({ status: "expired" }).eq("order_id", o.id).eq("status", "pending");
  await setOrderStatus(o.id, status);
  await releaseMachine(o.machine_id, o.id);
  await deleteOrderFiles(o.id);
}

/** Pekerjaan terjadwal: kedaluwarsa, hapus file, rekonsiliasi, pemantauan mesin. Aman dipanggil berulang. */
export async function runTick() {
  const r: Record<string, number> = {};

  // 1. Pembayaran kedaluwarsa (5 menit)
  const { data: unpaid } = await db().from("orders").select("id, machine_id").eq("status", "MENUNGGU_BAYAR").lt("pay_expires_at", iso());
  for (const o of unpaid ?? []) await expireOrder(o);
  r.expired = unpaid?.length ?? 0;

  // 2. Draft tidak dibayar > 1 jam: hapus file (FR-DAT-02)
  const { data: stale } = await db()
    .from("orders")
    .select("id, machine_id")
    .in("status", ["DIBUAT", "DIUPLOAD", "DIATUR"])
    .lt("updated_at", iso(60 * MIN));
  for (const o of stale ?? []) await expireOrder(o);
  r.staleDrafts = stale?.length ?? 0;

  // 3. Menunggu refund: file dihapus maksimal 24 jam (FR-DAT-03)
  const { data: refundWait } = await db()
    .from("orders")
    .select("id")
    .eq("status", "MENUNGGU_REFUND")
    .is("files_deleted_at", null)
    .lt("updated_at", iso(24 * 60 * MIN));
  for (const o of refundWait ?? []) await deleteOrderFiles(o.id);

  // 4. Jaring pengaman: order final yang filenya belum terhapus
  const { data: leftovers } = await db()
    .from("orders")
    .select("id")
    .in("status", ["SELESAI", "KEDALUWARSA", "DIBATALKAN"])
    .is("files_deleted_at", null)
    .lt("updated_at", iso(10 * MIN))
    .limit(50);
  for (const o of leftovers ?? []) await deleteOrderFiles(o.id);

  // 5. Kunci mesin yang tersangkut (FR-LCK-04)
  const { data: lockedMachines } = await db().from("machines").select("id, active_order_id, locked_at").not("active_order_id", "is", null).lt("locked_at", iso(20 * MIN));
  for (const m of lockedMachines ?? []) {
    const { data: o } = await db().from("orders").select("id, status").eq("id", m.active_order_id).maybeSingle();
    if (!o || !["LUNAS", "MENCETAK", "CETAK_ULANG"].includes(o.status)) {
      await releaseMachine(m.id, m.active_order_id);
      r.unlocked = (r.unlocked ?? 0) + 1;
    }
  }

  // 6. Job cetak yang macet (agent mati di tengah jalan)
  const { data: stuck } = await db()
    .from("print_jobs")
    .select("id, machine_id")
    .in("status", ["claimed", "printing"])
    .lt("created_at", iso(30 * MIN))
    .limit(10);
  for (const j of stuck ?? []) {
    const { data: m } = await db().from("machines").select("*").eq("id", j.machine_id).single();
    if (m) await applyJobReport(m, j.id, { status: "failed", error: "Job melewati batas waktu" });
  }

  // 7. Rekonsiliasi pembayaran yang webhooknya terlambat (FR-PAY-06)
  const { data: pending } = await db().from("payments").select("provider_ref, amount, raw").eq("status", "pending").gt("created_at", iso(15 * MIN)).limit(20);
  const provider = getProvider();
  for (const p of pending ?? []) {
    try {
      const s = await provider.checkStatus(p.provider_ref, p.raw);
      if (s.paid) await db().rpc("confirm_payment", { p_ref: p.provider_ref, p_amount: s.amount ?? p.amount, p_raw: { via: "reconcile" } });
    } catch (e) {
      console.error("[reconcile]", e);
    }
  }

  // 8. Pemantauan mesin dan estimasi kertas/tinta (FR-MCH, FR-ADM-09)
  const { data: machines } = await db().from("machines").select("*");
  for (const m of machines ?? []) {
    const { data: s } = await db().from("machine_settings").select("*").eq("machine_id", m.id).single();
    if (!s) continue;
    const beat = m.last_heartbeat ? new Date(m.last_heartbeat).getTime() : 0;
    if (Date.now() - beat > Math.max(s.offline_alert_minutes * MIN, HEARTBEAT_TIMEOUT_MS)) {
      await raiseAlert("offline", m.id, `${m.name} offline lebih dari ${s.offline_alert_minutes} menit`, `offline:${m.id}`);
    }
    const paperLeft = s.paper_capacity - m.sheets_since_refill;
    if (paperLeft <= s.paper_warn) await raiseAlert("paper_low", m.id, `Kertas ${m.name} menipis (perkiraan ${Math.max(paperLeft, 0)} lembar)`, `paper:${m.id}`);
    const bwPct = 100 - (m.sides_bw_since_refill / s.ink_bw_capacity) * 100;
    const colorPct = 100 - (m.sides_color_since_refill / s.ink_color_capacity) * 100;
    if (bwPct <= s.ink_warn_pct) await raiseAlert("ink_low", m.id, `Tinta hitam ${m.name} menipis (perkiraan ${Math.max(Math.round(bwPct), 0)}%)`, `inkbw:${m.id}`);
    if (colorPct <= s.ink_warn_pct) await raiseAlert("ink_low", m.id, `Tinta warna ${m.name} menipis (perkiraan ${Math.max(Math.round(colorPct), 0)}%)`, `inkc:${m.id}`);
  }

  // 9. Retensi data refund 6 bulan (FR-FAIL-08) dan pembersihan sesi/token
  await db().from("refunds").update({ holder_name: null, destination: null, admin_note: null }).lt("delete_after", iso()).not("holder_name", "is", null);
  await db().from("sessions").delete().lt("expires_at", iso(60 * MIN));
  await db().from("kiosk_tokens").delete().lt("created_at", iso(10 * MIN));

  await sendPending();
  await db().from("app_state").upsert({ key: "last_tick", value: iso() });
  return r;
}

/** Dipanggil dari heartbeat agent supaya tidak bergantung pada cron hosting; dibatasi satu kali per 30 detik. */
export async function maybeTick() {
  const { data } = await db().from("app_state").select("value").eq("key", "last_tick").maybeSingle();
  if (data && Date.now() - new Date(data.value).getTime() < 30_000) return;
  await db().from("app_state").upsert({ key: "last_tick", value: iso() });
  await runTick();
}
