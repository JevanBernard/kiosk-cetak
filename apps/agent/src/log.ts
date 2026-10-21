// Log agent: hanya metadata (kode, id, jumlah halaman). Isi dokumen tidak pernah dicatat (NFR-PRV-02).
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

export function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    appendFileSync(join(config.dataDir, "agent.log"), line + "\n");
  } catch {
    /* log opsional */
  }
}
