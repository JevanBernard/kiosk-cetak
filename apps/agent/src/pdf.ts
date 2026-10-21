import { PDFDocument, PDFName, rgb } from "pdf-lib";
import { nupGrid, parsePageRange, type PrintOptions } from "@kioskcetak/shared";

export const A4_W = 595.28;
export const A4_H = 841.89;

export class UserFacingError extends Error {}

/** Membaca PDF dan menghitung halaman; menolak PDF berpassword atau rusak dengan pesan yang jelas (FR-UP-06). */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  const broken = new UserFacingError("PDF rusak atau tidak bisa dibaca. Coba simpan ulang sebagai PDF lalu unggah lagi.");
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch (e: any) {
    if (/encrypt/i.test(String(e?.message))) throw new UserFacingError("PDF diproteksi password. Buka PDF, simpan tanpa password, lalu unggah ulang.");
    throw broken;
  }
  try {
    if (doc.getPageCount() < 1) throw broken; // pdf-lib menerima berkas sampah sebagai 0 halaman
  } catch {
    throw broken; // pohon halaman rusak melempar TypeError
  }
  return doc;
}

/** Halaman kosong sering tidak punya stream konten; pdf-lib menolak menyisipkannya, jadi diberi stream kosong. */
function fillBlankPages(doc: PDFDocument) {
  for (const page of doc.getPages()) {
    if (!page.node.get(PDFName.of("Contents"))) {
      page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.stream("")));
    }
  }
}

/** Gambar -> PDF A4, diskalakan agar muat (fit to page), di tengah. */
export async function imageToPdf(bytes: Uint8Array, type: "jpg" | "png"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let img;
  try {
    img = type === "jpg" ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
  } catch {
    throw new UserFacingError("Gambar rusak atau formatnya tidak didukung. Coba simpan ulang sebagai JPG atau PNG biasa.");
  }
  // Gambar lanskap dicetak di halaman lanskap agar tidak mengecil
  const landscape = img.width > img.height;
  const W = landscape ? A4_H : A4_W;
  const H = landscape ? A4_W : A4_H;
  const margin = 18;
  const scale = Math.min((W - margin * 2) / img.width, (H - margin * 2) / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const page = doc.addPage([W, H]);
  page.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
  return doc.save();
}

/**
 * Membangun PDF akhir sesuai opsi: rentang halaman, N-up, orientasi (FR-PRT-02).
 * Setiap sisi kertas dibuat berukuran A4; halaman non-A4 disesuaikan (fit to page).
 * Mengembalikan jumlah sisi fisik (tanpa halaman kosong penyeimbang duplex).
 */
export async function buildFinalPdf(
  source: Uint8Array,
  opts: PrintOptions,
): Promise<{ bytes: Uint8Array; sides: number; sheets: number }> {
  const src = await loadPdf(source);
  const range = parsePageRange(opts.range, src.getPageCount());
  if ("error" in range) throw new UserFacingError(range.error);
  fillBlankPages(src);
  const indices = range.pages.map((p) => p - 1);

  const out = await PDFDocument.create();
  const embedded = await out.embedPdf(src, indices);
  const landscape = opts.orientation === "landscape";
  const W = landscape ? A4_H : A4_W;
  const H = landscape ? A4_W : A4_H;
  const { cols, rows } = nupGrid(opts.nup, opts.orientation);
  const pad = opts.nup === 1 ? 0 : 10;
  const cellW = W / cols;
  const cellH = H / rows;

  let sides = 0;
  for (let i = 0; i < embedded.length; i += opts.nup) {
    const page = out.addPage([W, H]);
    sides++;
    const group = embedded.slice(i, i + opts.nup);
    group.forEach((ep, k) => {
      const col = k % cols;
      const row = Math.floor(k / cols);
      const aw = cellW - pad * 2;
      const ah = cellH - pad * 2;
      const scale = Math.min(aw / ep.width, ah / ep.height);
      const w = ep.width * scale;
      const h = ep.height * scale;
      const x = col * cellW + pad + (aw - w) / 2;
      const y = H - (row + 1) * cellH + pad + (ah - h) / 2;
      page.drawPage(ep, { x, y, width: w, height: h });
      if (opts.nup > 1) page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.5 });
    });
  }

  // Bolak-balik dengan beberapa salinan: genapkan agar tiap salinan mulai di lembar baru.
  const sheets = opts.duplex ? Math.ceil(sides / 2) : sides;
  if (opts.duplex && opts.copies > 1 && sides % 2 === 1) out.addPage([W, H]);
  return { bytes: await out.save(), sides, sheets };
}

/** Pola uji sederhana untuk nozzle check: blok CMYK + hitam + garis halus. */
export async function nozzlePattern(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4_W, A4_H]);
  const colors = [rgb(0, 1, 1), rgb(1, 0, 1), rgb(1, 1, 0), rgb(0, 0, 0)];
  colors.forEach((c, i) => {
    page.drawRectangle({ x: 40, y: A4_H - 60 - i * 40, width: A4_W - 80, height: 24, color: c });
    for (let l = 0; l < 6; l++) page.drawLine({ start: { x: 40, y: A4_H - 220 - i * 30 - l * 3 }, end: { x: A4_W - 40, y: A4_H - 220 - i * 30 - l * 3 }, thickness: 0.4, color: c });
  });
  return doc.save();
}
