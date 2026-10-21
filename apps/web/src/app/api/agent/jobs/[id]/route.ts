import { requireAgent } from "@/lib/agent-auth";
import { handler, ok, readJson } from "@/lib/http";
import { applyJobReport, type JobReport } from "@/lib/printing";

export const POST = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const machine = await requireAgent(req);
  const b = await readJson<JobReport>(req);
  if (!["printing", "done", "failed"].includes(b.status)) return ok({ ignored: true });
  return ok(await applyJobReport(machine, params.id, { ...b, error: b.error?.slice(0, 300) }));
});
