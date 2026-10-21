import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { DEFAULT_OPTIONS } from "@kioskcetak/shared";
import { buildFinalPdf, imageToPdf, loadPdf, UserFacingError } from "./pdf.js";
import { sniff } from "./validate.js";

async function samplePdf(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([400, 300 + i]);
  return doc.save();
}

test("N-up 4: 40 halaman menjadi 10 sisi (PRD F-14)", async () => {
  const r = await buildFinalPdf(await samplePdf(40), { ...DEFAULT_OPTIONS, nup: 4 });
  assert.equal(r.sides, 10);
  assert.equal((await loadPdf(r.bytes)).getPageCount(), 10);
});

test("rentang halaman dan duplex", async () => {
  const r = await buildFinalPdf(await samplePdf(10), { ...DEFAULT_OPTIONS, range: "2-4, 8", duplex: true });
  assert.equal(r.sides, 4);
  assert.equal(r.sheets, 2);
});

test("duplex dengan banyak salinan menggenapkan halaman", async () => {
  const r = await buildFinalPdf(await samplePdf(3), { ...DEFAULT_OPTIONS, duplex: true, copies: 2 });
  assert.equal(r.sides, 3);
  assert.equal((await loadPdf(r.bytes)).getPageCount(), 4);
});

test("rentang di luar dokumen ditolak dengan pesan jelas", async () => {
  await assert.rejects(buildFinalPdf(await samplePdf(2), { ...DEFAULT_OPTIONS, range: "5" }), UserFacingError);
});

test("PDF rusak ditolak", async () => {
  await assert.rejects(loadPdf(Buffer.from("%PDF-1.4 bukan pdf")), UserFacingError);
});

test("sniff memeriksa isi, bukan ekstensi", async () => {
  assert.equal(sniff(Buffer.from(await samplePdf(1))), "pdf");
  assert.equal(sniff(Buffer.from("MZ\x90\x00 exe palsu.pdf........")), null);
});

test("gambar PNG minimal menjadi PDF 1 halaman", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const pdf = await imageToPdf(png, "png");
  assert.equal((await loadPdf(pdf)).getPageCount(), 1);
});
