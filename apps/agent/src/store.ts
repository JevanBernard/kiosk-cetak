import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

type JobState = { state: "printing" | "done"; at: number; report?: unknown };
type Data = { jobs: Record<string, JobState>; pending: { jobId: string; body: unknown }[]; lastActivity: number; lastNozzle: number };

const file = join(config.dataDir, "state.json");

function load(): Data {
  try {
    if (existsSync(file)) return { jobs: {}, pending: [], lastActivity: Date.now(), lastNozzle: 0, ...JSON.parse(readFileSync(file, "utf8")) };
  } catch {
    /* berkas rusak: mulai bersih */
  }
  return { jobs: {}, pending: [], lastActivity: Date.now(), lastNozzle: 0 };
}

const data = load();

function save() {
  const week = Date.now() - 7 * 86_400_000;
  for (const [k, v] of Object.entries(data.jobs)) if (v.at < week) delete data.jobs[k];
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, file); // tulis atomik: mati listrik tidak merusak status job
}

/**
 * Status job disimpan lokal agar setelah restart/internet putus tidak mencetak dua kali (NFR-REL-03).
 * Kunci = "<jobId>:<percobaan ke>".
 */
export const store = {
  getJob: (key: string) => data.jobs[key],
  setJob(key: string, state: JobState["state"], report?: unknown) {
    data.jobs[key] = { state, at: Date.now(), report };
    save();
  },
  /** Laporan ke server yang gagal terkirim; dikirim ulang sampai berhasil. */
  pending: () => data.pending,
  addPending(jobId: string, body: unknown) {
    data.pending.push({ jobId, body });
    save();
  },
  removePending(item: { jobId: string; body: unknown }) {
    data.pending = data.pending.filter((p) => p !== item);
    save();
  },
  get lastActivity() {
    return data.lastActivity;
  },
  touch() {
    data.lastActivity = Date.now();
    save();
  },
  get lastNozzle() {
    return data.lastNozzle;
  },
  setNozzle() {
    data.lastNozzle = Date.now();
    save();
  },
};
