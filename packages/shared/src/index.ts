// Logika bersama web (server+browser) dan print agent.
// Harga dihitung ulang di server (FR-PRC-05); browser memakai fungsi yang sama hanya untuk tampilan.

export type NUp = 1 | 2 | 4 | 6 | 9;
export const NUP_VALUES: NUp[] = [1, 2, 4, 6, 9];
export type Orientation = "portrait" | "landscape";

export interface PrintOptions {
  color: boolean;
  duplex: boolean;
  copies: number;
  /** Contoh: "1-3, 5, 8-10". Kosong = semua halaman. */
  range: string;
  orientation: Orientation;
  nup: NUp;
}

export const DEFAULT_OPTIONS: PrintOptions = {
  color: false,
  duplex: false,
  copies: 1,
  range: "",
  orientation: "portrait",
  nup: 1,
};

export interface PriceConfig {
  price_bw_single: number;
  price_bw_duplex: number;
  price_color_single: number;
  price_color_duplex: number;
  /** Pembulatan total order ke atas: 100 atau 500. */
  rounding: number;
  max_copies: number;
  min_total: number;
  allow_color: boolean;
  allow_duplex: boolean;
  allow_nup: boolean;
}

export const ORDER_STATUSES = [
  "DIBUAT",
  "DIUPLOAD",
  "DIATUR",
  "MENUNGGU_BAYAR",
  "LUNAS",
  "MENCETAK",
  "SELESAI",
  "KEDALUWARSA",
  "DIBATALKAN",
  "GAGAL_CETAK",
  "CETAK_ULANG",
  "MENUNGGU_REFUND",
  "DIREFUND",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const PAY_WINDOW_SECONDS = 5 * 60;
export const KIOSK_TOKEN_ROTATE_SECONDS = 60;
export const KIOSK_TOKEN_GRACE_SECONDS = 30;
export const SESSION_MINUTES = 15;
export const MAX_PRINT_ATTEMPTS = 3; // 1 percobaan + 2 cetak ulang otomatis (FR-FAIL-02)

export const ALLOWED_MIME: Record<string, "pdf" | "docx" | "pptx" | "image"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "image/jpeg": "image",
  "image/png": "image",
};

export function kindFromMime(mime: string) {
  return ALLOWED_MIME[mime] ?? null;
}

/** Mengurai rentang halaman. Mengembalikan daftar halaman (1-based) sesuai urutan input. */
export function parsePageRange(input: string, totalPages: number): { pages: number[] } | { error: string } {
  const text = input.trim();
  if (totalPages < 1) return { error: "Dokumen belum memiliki halaman." };
  if (!text) return { pages: Array.from({ length: totalPages }, (_, i) => i + 1) };
  if (!/^[\d\s,\-]+$/.test(text)) return { error: "Rentang hanya boleh berisi angka, koma, dan tanda minus. Contoh: 1-3, 5, 8-10" };
  const pages: number[] = [];
  for (const raw of text.split(",")) {
    const part = raw.trim();
    if (!part) return { error: "Ada bagian rentang yang kosong. Contoh: 1-3, 5, 8-10" };
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) return { error: `Bagian "${part}" tidak valid. Contoh: 1-3, 5, 8-10` };
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b < 1) return { error: "Nomor halaman mulai dari 1." };
    if (a > b) return { error: `Rentang "${part}" terbalik. Tulis dari kecil ke besar.` };
    if (b > totalPages) return { error: `Dokumen hanya punya ${totalPages} halaman.` };
    for (let p = a; p <= b; p++) pages.push(p);
  }
  return { pages };
}

export interface FilePrice {
  selectedPages: number;
  sides: number;
  unitPrice: number;
  total: number;
}

export function unitPrice(opts: Pick<PrintOptions, "color" | "duplex">, cfg: PriceConfig): number {
  if (opts.color) return opts.duplex ? cfg.price_color_duplex : cfg.price_color_single;
  return opts.duplex ? cfg.price_bw_duplex : cfg.price_bw_single;
}

/** Validasi opsi terhadap konfigurasi mesin. Mengembalikan pesan error atau null. */
export function validateOptions(opts: PrintOptions, cfg: PriceConfig): string | null {
  if (!NUP_VALUES.includes(opts.nup)) return "Pilihan halaman per lembar tidak valid.";
  if (opts.nup !== 1 && !cfg.allow_nup) return "Halaman per lembar sedang dinonaktifkan.";
  if (opts.color && !cfg.allow_color) return "Cetak warna sedang tidak tersedia.";
  if (opts.duplex && !cfg.allow_duplex) return "Cetak bolak-balik sedang tidak tersedia.";
  if (!Number.isInteger(opts.copies) || opts.copies < 1) return "Jumlah salinan minimal 1.";
  if (opts.copies > cfg.max_copies) return `Jumlah salinan maksimal ${cfg.max_copies}.`;
  if (opts.orientation !== "portrait" && opts.orientation !== "landscape") return "Orientasi tidak valid.";
  return null;
}

/** Sisi fisik = halaman terpilih dibagi N-up (dibulatkan ke atas). Biaya dihitung per sisi fisik. */
export function priceFile(opts: PrintOptions, totalPages: number, cfg: PriceConfig): FilePrice | { error: string } {
  const bad = validateOptions(opts, cfg);
  if (bad) return { error: bad };
  const r = parsePageRange(opts.range, totalPages);
  if ("error" in r) return r;
  const selectedPages = r.pages.length;
  const sides = Math.ceil(selectedPages / opts.nup);
  const unit = unitPrice(opts, cfg);
  return { selectedPages, sides, unitPrice: unit, total: sides * unit * opts.copies };
}

export function roundUp(amount: number, step: number): number {
  return step > 0 ? Math.ceil(amount / step) * step : amount;
}

export function orderTotal(fileTotals: number[], cfg: PriceConfig) {
  const subtotal = fileTotals.reduce((a, b) => a + b, 0);
  const total = roundUp(subtotal, cfg.rounding);
  return { subtotal, total, rounding: total - subtotal };
}

/** Estimasi kasar waktu cetak (detik): ~8 dtk/sisi hitam-putih, ~15 dtk/sisi warna + 10 dtk persiapan. */
export function estimateSeconds(items: { sides: number; copies: number; color: boolean }[]): number {
  return 10 + items.reduce((s, i) => s + i.sides * i.copies * (i.color ? 15 : 8), 0);
}

export function formatRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

/** Tata letak N-up: kolom x baris per sisi. */
export function nupGrid(nup: NUp, orientation: Orientation): { cols: number; rows: number } {
  const portrait: Record<NUp, [number, number]> = { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 9: [3, 3] };
  const [c, r] = portrait[nup];
  // Pada sisi lanskap, kolom dan baris ditukar agar sel tetap proporsional.
  return orientation === "landscape" ? { cols: r, rows: c } : { cols: c, rows: r };
}

/** Kode transaksi: 10 karakter, alfabet tanpa karakter membingungkan. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
