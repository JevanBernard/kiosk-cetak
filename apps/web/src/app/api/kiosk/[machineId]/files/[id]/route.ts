import type { PrintOptions } from "@kioskcetak/shared";
import { handler, ok, readJson } from "@/lib/http";
import { kioskDraft, removeFile, requireKiosk, saveFileOptions } from "@/lib/kiosk-order";

type Ctx = { params: { machineId: string; id: string } };

/** Pengaturan cetak dari layar kiosk (dilindungi kunci kiosk). */
export const PUT = handler(async (req: Request, { params }: Ctx) => {
  requireKiosk(req, params.machineId);
  const order = await kioskDraft(params.machineId);
  return ok(await saveFileOptions(order, params.id, await readJson<Partial<PrintOptions>>(req)));
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  requireKiosk(req, params.machineId);
  const order = await kioskDraft(params.machineId);
  await removeFile(order, params.id);
  return ok();
});
