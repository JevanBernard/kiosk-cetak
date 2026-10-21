import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiFail, api, download, type PrintTask } from "./api.js";
import { config } from "./config.js";
import { processFile } from "./convert.js";
import { log } from "./log.js";
import { UserFacingError, buildFinalPdf, nozzlePattern } from "./pdf.js";
import { printPdf, readPrinterState, type PrinterInfo } from "./printer.js";
import { store } from "./store.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mengirim laporan job; bila gagal (internet putus) disimpan dan dikirim ulang, bukan dicetak ulang. */
async function report(jobId: string, body: unknown) {
  try {
    await api.jobReport(jobId, body);
  } catch (e: any) {
    log(`laporan job ${jobId} tertunda: ${e.message}`);
    store.addPending(jobId, body);
  }
}

async function flushPending() {
  for (const item of [...store.pending()]) {
    try {
      await api.jobReport(item.jobId, item.body);
      store.removePending(item);
    } catch (e: any) {
      if (e instanceof ApiFail && e.status < 500) store.removePending(item); // ditolak server: jangan diulang selamanya
      else return;
    }
  }
}

async function handlePrint(t: PrintTask) {
  const key = `${t.jobId}:${t.attempt}`;
  const prev = store.getJob(key);
  if (prev?.state === "done") {
    log(`job ${t.code} sudah tercetak sebelumnya, kirim ulang laporan`);
    return report(t.jobId, prev.report);
  }
  if (prev?.state === "printing") {
    // Agent berhenti di tengah pencetakan: tidak diketahui apakah kertas sudah keluar. Jangan cetak ulang otomatis.
    log(`job ${t.code} terputus saat mencetak; diserahkan ke admin`);
    return report(t.jobId, { status: "failed", final: true, error: "Agent berhenti saat mencetak (kemungkinan sebagian tercetak)" });
  }

  store.setJob(key, "printing");
  log(`cetak ${t.code} percobaan ${t.attempt} (${t.files.length} file)`);
  const dir = await mkdtemp(join(tmpdir(), "kc-print-"));
  try {
    let bw = 0;
    let color = 0;
    let sheets = 0;
    for (let i = 0; i < t.files.length; i++) {
      const f = t.files[i];
      await report(t.jobId, { status: "printing", progress: { file: i + 1, of: t.files.length } });
      const raw = await download(f.url);
      const built = await buildFinalPdf(raw, f.options);
      const path = join(dir, `f${i}.pdf`);
      await writeFile(path, built.bytes);
      await printPdf(path, f.options, built.sides, `${t.code}-${t.attempt}-${i + 1}`);
      const sides = built.sides * f.options.copies;
      if (f.options.color) color += sides;
      else bw += sides;
      sheets += built.sheets * f.options.copies;
    }
    const done = { status: "done", sidesBw: bw, sidesColor: color, sheets };
    store.setJob(key, "done", done);
    store.touch();
    await report(t.jobId, done);
    log(`selesai ${t.code}: ${bw + color} sisi`);
  } catch (e: any) {
    const msg = e instanceof UserFacingError ? e.message : String(e?.message ?? e);
    log(`gagal ${t.code}: ${msg}`);
    store.setJob(key, "done", { status: "failed", error: msg }); // kunci selesai: laporan gagal tidak memicu cetak ulang lokal
    await report(t.jobId, { status: "failed", error: msg });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {}); // hapus file lokal (FR-PRT-07)
  }
}

let latest: PrinterInfo = { state: "offline" };
let nozzleNote: string | null = null;

async function heartbeatLoop() {
  for (;;) {
    try {
      latest = await readPrinterState();
      await api.heartbeat({ printerState: latest.state, capabilities: latest.capabilities, nozzle: nozzleNote ? { result: nozzleNote } : undefined });
      nozzleNote = null;
    } catch (e: any) {
      log(`heartbeat gagal: ${e.message}`);
    }
    await sleep(config.heartbeatMs);
  }
}

async function maybeNozzleCheck() {
  const hours = config.nozzleIdleHours;
  if (!hours || latest.state !== "ready") return;
  const idleMs = Date.now() - Math.max(store.lastActivity, store.lastNozzle);
  if (idleMs < hours * 3_600_000) return;
  log("nozzle check otomatis (mesin menganggur)");
  const dir = await mkdtemp(join(tmpdir(), "kc-nozzle-"));
  try {
    const path = join(dir, "nozzle.pdf");
    await writeFile(path, await nozzlePattern());
    await printPdf(path, { color: true, duplex: false, copies: 1, range: "", orientation: "portrait", nup: 1 }, 1, `nozzle-${Date.now()}`);
    nozzleNote = "pola uji tercetak, periksa hasil secara visual";
  } catch (e: any) {
    nozzleNote = `gagal: ${String(e.message).slice(0, 120)}`;
  } finally {
    store.setNozzle();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  log(`KioskCetak agent mulai → ${config.serverUrl}${config.dryRun ? " [DRY_RUN]" : ""}`);
  heartbeatLoop();
  for (;;) {
    try {
      await flushPending();
      const { task } = await api.nextTask();
      if (task?.type === "print") {
        await handlePrint(task);
        continue;
      }
      if (task?.type === "file") {
        await processFile(task);
        continue;
      }
      await maybeNozzleCheck();
    } catch (e: any) {
      log(`loop: ${e.message}`);
      if (e instanceof ApiFail && e.status === 401) log("TOKEN DITOLAK: periksa AGENT_TOKEN atau buat token baru di dashboard");
    }
    await sleep(config.pollMs);
  }
}

process.on("unhandledRejection", (e) => log(`unhandledRejection: ${e}`));
main();
