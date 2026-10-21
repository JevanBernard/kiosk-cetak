import { execFile } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { PrintOptions } from "@kioskcetak/shared";
import { config } from "./config.js";
import { log } from "./log.js";

const exec = promisify(execFile);
const isWin = process.platform === "win32";

export type PrinterState = "ready" | "paper_out" | "ink_out" | "error" | "offline";
export type PrinterInfo = { state: PrinterState; capabilities?: { duplex: boolean; color: boolean } };

const q = (s: string) => s.replace(/'/g, "''");

async function ps(script: string, timeout = 15_000): Promise<string> {
  const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout, windowsHide: true });
  return stdout.trim();
}

async function printerName(): Promise<string> {
  if (config.printer) return config.printer;
  const out = await ps("(Get-CimInstance Win32_Printer | Where-Object Default).Name");
  if (!out) throw new Error("Tidak ada printer default. Isi PRINTER_NAME di .env");
  return out;
}

/** Membaca status printer dari Windows. Tidak semua printer USB melaporkan kertas/tinta dengan akurat. */
export async function readPrinterState(): Promise<PrinterInfo> {
  if (config.dryRun || !isWin) return { state: "ready", capabilities: { duplex: true, color: true } };
  try {
    const name = await printerName();
    const raw = await ps(
      `Get-CimInstance Win32_Printer -Filter "Name='${q(name)}'" | Select-Object WorkOffline, DetectedErrorState, Capabilities | ConvertTo-Json -Compress`,
    );
    if (!raw) return { state: "offline" };
    const p = JSON.parse(raw);
    const caps: number[] = Array.isArray(p.Capabilities) ? p.Capabilities : [];
    const capabilities = { color: caps.includes(2), duplex: caps.includes(3) };
    if (p.WorkOffline) return { state: "offline", capabilities };
    // DetectedErrorState: 4=No Paper, 6=No Toner, 7=Door Open, 8=Jammed, 9=Offline, 10=Service, 11=Bin Full
    const map: Record<number, PrinterState> = { 4: "paper_out", 6: "ink_out", 7: "error", 8: "error", 9: "offline", 10: "error", 11: "error" };
    return { state: map[p.DetectedErrorState] ?? "ready", capabilities };
  } catch (e: any) {
    log(`baca status printer gagal: ${e.message}`);
    return { state: "error" };
  }
}

async function queue(name: string): Promise<{ Id: number; JobStatus: string }[]> {
  const raw = await ps(`$j = Get-PrintJob -PrinterName '${q(name)}' | Select-Object Id, @{n='JobStatus';e={[string]$_.JobStatus}}; if ($j) { ConvertTo-Json -Compress -InputObject @($j) }`);
  return raw ? JSON.parse(raw) : [];
}

async function clearQueue(name: string) {
  await ps(`Get-PrintJob -PrinterName '${q(name)}' | Remove-PrintJob -ErrorAction SilentlyContinue`).catch(() => {});
}

/** Menunggu antrean printer kosong; melempar error bila ada status gagal atau melewati batas waktu. */
async function waitForQueue(name: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const jobs = await queue(name);
    if (jobs.length === 0) return;
    const bad = jobs.find((j) => /error|offline|paperout|userintervention|blocked|deleting/i.test(j.JobStatus));
    if (bad) throw new Error(`Printer melaporkan masalah: ${bad.JobStatus}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Pencetakan melewati batas waktu");
}

/** Mencetak satu PDF akhir dengan opsi warna/duplex/salinan, lalu menunggu selesai. */
export async function printPdf(path: string, opts: PrintOptions, sides: number, label: string) {
  if (config.dryRun || !isWin) {
    const dir = join(config.dataDir, "dry-run");
    await mkdir(dir, { recursive: true });
    const out = join(dir, `${label}.pdf`);
    await copyFile(path, out);
    log(`DRY_RUN: ${out} (warna=${opts.color} duplex=${opts.duplex} salinan=${opts.copies})`);
    return;
  }
  const name = await printerName();
  const { print } = await import("pdf-to-printer");
  try {
    await print(path, {
      printer: name,
      monochrome: !opts.color,
      side: opts.duplex ? (opts.orientation === "landscape" ? "duplexshort" : "duplexlong") : "simplex",
      copies: opts.copies,
      paperSize: "A4",
      scale: "fit",
    });
    // ~20 dtk per sisi sebagai batas wajar untuk inkjet + 90 dtk cadangan
    await waitForQueue(name, 90_000 + sides * opts.copies * 20_000);
  } catch (e) {
    await clearQueue(name); // jangan biarkan job tersangkut tercetak terlambat dan menimbulkan duplikat
    throw e;
  }
}
