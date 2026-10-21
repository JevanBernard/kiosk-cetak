import { ok, handler } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { availabilityOf, loadMachine } from "@/lib/machine";
import { buildOrderView } from "@/lib/orders";
import { latestOrder } from "@/lib/user-order";
import { toPriceConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const session = await requireSession();
  const { machine, settings } = await loadMachine(session.machine_id);
  const last = await latestOrder(session);
  const view = last ? await buildOrderView(last.id) : null;
  return ok({
    machine: {
      name: machine.name,
      code: (machine.code as string | null) ?? null,
      location: (machine.location as string | null) ?? null,
      hardware: {
        paperPct: Math.round((Math.max(0, settings.paper_capacity - machine.sheets_since_refill) / Math.max(1, settings.paper_capacity)) * 100),
        ink: Math.max(0, Math.round(100 - Math.max(machine.sides_bw_since_refill / settings.ink_bw_capacity, machine.sides_color_since_refill / settings.ink_color_capacity) * 100)),
        duplex: Boolean(settings.allow_duplex && machine.capabilities?.duplex),
      },
      availability: availabilityOf(machine),
      whatsapp: settings.admin_whatsapp as string | null,
      capabilities: machine.capabilities,
    },
    config: toPriceConfig(settings),
    sessionExpiresAt: session.expires_at,
    view,
  });
});
