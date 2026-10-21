import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { api, download, upload, type FileTask } from "./api.js";
import { config } from "./config.js";
import { log } from "./log.js";
import { UserFacingError, imageToPdf, loadPdf } from "./pdf.js";
import { matchesKind, sniff } from "./validate.js";

const run = promisify(execFile);

/** Pemindaian antivirus opsional (ClamAV). Exit 1 = terinfeksi. */
async function scan(path: string) {
  if (!config.clamscan) return;
  try {
    await run(config.clamscan, ["--no-summary", path], { timeout: 60_000 });
  } catch (e: any) {
    if (e.code === 1) throw new UserFacingError("File ditolak karena terdeteksi berbahaya.");
    log(`clamscan error: ${e.message}`); // antivirus bermasalah tidak menolak file, tetapi dicatat
  }
}

async function soffice(inputPath: string, outDir: string) {
  const profile = join(outDir, "profile");
  const args = [
    `-env:UserInstallation=file:///${profile.replace(/\\/g, "/")}`,
    "--headless",
    "--norestore",
    "--convert-to",
    "pdf",
    "--outdir",
    outDir,
    inputPath,
  ];
  await new Promise<void>((resolve, reject) => {
    const p = spawn(config.soffice, args, { stdio: "ignore", windowsHide: true });
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new UserFacingError("Konversi terlalu lama. Simpan dokumen sebagai PDF lalu unggah ulang."));
    }, 90_000);
    p.on("error", () => {
      clearTimeout(timer);
      reject(new Error(`LibreOffice tidak dapat dijalankan (${config.soffice})`));
    });
    p.on("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new UserFacingError("Dokumen gagal dikonversi. Simpan sebagai PDF lalu unggah ulang."));
    });
  });
}

/** Memproses satu file upload: validasi isi, konversi ke PDF bila perlu, hitung halaman, lapor ke server. */
export async function processFile(t: FileTask) {
  log(`file ${t.fileId} (${t.kind}, ${t.sizeBytes}B)`);
  const dir = await mkdtemp(join(tmpdir(), "kc-file-"));
  try {
    const raw = await download(t.downloadUrl);
    const sniffed = sniff(raw);
    if (!matchesKind(t.kind, sniffed)) throw new UserFacingError("Isi file tidak sesuai dengan formatnya. Pastikan file tidak rusak.");

    const inPath = join(dir, "input");
    await writeFile(inPath, raw);
    await scan(inPath);

    let pdfBytes: Uint8Array;
    let converted = true;
    if (t.kind === "pdf") {
      pdfBytes = raw;
      converted = false;
    } else if (t.kind === "image") {
      pdfBytes = await imageToPdf(raw, sniffed as "jpg" | "png");
    } else {
      const docPath = join(dir, `doc.${t.kind}`);
      await writeFile(docPath, raw);
      await soffice(docPath, dir);
      pdfBytes = await readFile(join(dir, "doc.pdf")).catch(() => {
        throw new UserFacingError("Dokumen gagal dikonversi. Simpan sebagai PDF lalu unggah ulang.");
      });
    }

    const pdf = await loadPdf(pdfBytes);
    const pages = pdf.getPageCount();
    if (pages < 1) throw new UserFacingError("Dokumen tidak memiliki halaman.");
    if (converted) await upload(t.uploadUrl, pdfBytes);
    await api.fileResult(t.fileId, { pages, converted });
    log(`file ${t.fileId} siap: ${pages} halaman`);
  } catch (e: any) {
    const message = e instanceof UserFacingError ? e.message : "Terjadi kesalahan saat memproses file. Coba unggah ulang atau gunakan PDF.";
    if (!(e instanceof UserFacingError)) log(`file ${t.fileId} error: ${e?.message}`);
    await api.fileResult(t.fileId, { error: message }).catch((x) => log(`lapor error gagal: ${x.message}`));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
