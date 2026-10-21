import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Env ${name} belum diisi. Salin .env.example menjadi .env lalu isi.`);
    process.exit(1);
  }
  return v;
}

export const config = {
  serverUrl: need("SERVER_URL").replace(/\/+$/, ""),
  token: need("AGENT_TOKEN"),
  printer: process.env.PRINTER_NAME?.trim() || undefined,
  soffice: process.env.SOFFICE_PATH?.trim() || "soffice",
  dryRun: process.env.DRY_RUN === "1",
  pollMs: Number(process.env.POLL_MS) || 2500,
  heartbeatMs: Number(process.env.HEARTBEAT_MS) || 20000,
  nozzleIdleHours: Number(process.env.NOZZLE_IDLE_HOURS ?? 24),
  clamscan: process.env.CLAMSCAN_PATH?.trim() || undefined,
  dataDir: resolve(process.cwd(), "data"),
};

mkdirSync(config.dataDir, { recursive: true });
