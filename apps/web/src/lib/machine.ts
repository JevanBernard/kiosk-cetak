import { db } from "./db";
import { HttpError } from "./http";

export const HEARTBEAT_TIMEOUT_MS = 90_000;

export type Availability = {
  state: "available" | "busy" | "unavailable";
  reason: string | null;
};

const PRINTER_REASON: Record<string, string> = {
  paper_out: "Kertas habis",
  ink_out: "Tinta habis",
  error: "Printer bermasalah",
  offline: "Printer tidak terhubung",
};

export function availabilityOf(m: Record<string, any>): Availability {
  if (m.maintenance) return { state: "unavailable", reason: "Mesin sedang dalam perawatan" };
  if (m.fault) return { state: "unavailable", reason: m.fault_reason || "Mesin bermasalah, menunggu admin" };
  const beat = m.last_heartbeat ? new Date(m.last_heartbeat).getTime() : 0;
  if (Date.now() - beat > HEARTBEAT_TIMEOUT_MS) return { state: "unavailable", reason: "Mesin offline" };
  if (m.printer_state !== "ready") return { state: "unavailable", reason: PRINTER_REASON[m.printer_state] ?? "Printer tidak siap" };
  if (m.active_order_id) return { state: "busy", reason: "Mesin sedang dipakai pengguna lain" };
  return { state: "available", reason: null };
}

export async function loadMachine(machineId: string) {
  const { data: m } = await db().from("machines").select("*").eq("id", machineId).maybeSingle();
  if (!m) throw new HttpError(404, "Mesin tidak ditemukan.");
  const { data: s } = await db().from("machine_settings").select("*").eq("machine_id", machineId).single();
  if (!s) throw new HttpError(500, "Pengaturan mesin belum ada.");
  return { machine: m as Record<string, any>, settings: s as Record<string, any> };
}
