/** Validasi tipe berdasarkan isi file, bukan ekstensi (FR-UP-02). */
export function sniff(buf: Buffer): "pdf" | "docx" | "pptx" | "jpg" | "png" | null {
  if (buf.length < 8) return null;
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return "png";
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    // OOXML adalah ZIP; nama entri tersimpan polos di header lokal dan direktori pusat.
    const text = buf.toString("latin1");
    if (text.includes("word/document.xml")) return "docx";
    if (text.includes("ppt/presentation.xml")) return "pptx";
  }
  return null;
}

export function matchesKind(kind: string, sniffed: ReturnType<typeof sniff>): boolean {
  if (kind === "image") return sniffed === "jpg" || sniffed === "png";
  return sniffed === kind;
}
