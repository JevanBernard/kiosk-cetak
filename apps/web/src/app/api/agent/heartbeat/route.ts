import { db } from "@/lib/db";
import { requireAgent } from "@/lib/agent-auth";
import { handler, ok, readJson } from "@/lib/http";
import { maybeTick } from "@/lib/tick";

const STATES = ["ready", "paper_out", "ink_out", "error", "offline"];

export const POST = handler(async (req: Request) => {
  const machine = await requireAgent(req);
  const b = await readJson<{ printerState?: string; capabilities?: Record<string, boolean>; nozzle?: { result: string } }>(req);
  const patch: Record<string, unknown> = {
    last_heartbeat: new Date().toISOString(),
    printer_state: STATES.includes(b.printerState ?? "") ? b.printerState : "error",
  };
  if (b.capabilities) patch.capabilities = { duplex: !!b.capabilities.duplex, color: !!b.capabilities.color };
  if (b.nozzle) {
    patch.last_nozzle_check = new Date().toISOString();
    patch.nozzle_result = String(b.nozzle.result).slice(0, 200);
  }
  await db().from("machines").update(patch).eq("id", machine.id);
  try {
    await maybeTick(); // pekerjaan terjadwal ikut berjalan selama ada mesin yang hidup
  } catch (e) {
    console.error("[tick]", e);
  }
  return ok({ serverTime: new Date().toISOString(), maintenance: machine.maintenance });
});
