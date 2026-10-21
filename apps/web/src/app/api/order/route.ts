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
      availability: availabilityOf(machine),
      whatsapp: settings.admin_whatsapp as string | null,
      capabilities: machine.capabilities,
    },
    config: toPriceConfig(settings),
    sessionExpiresAt: session.expires_at,
    view,
  });
});
