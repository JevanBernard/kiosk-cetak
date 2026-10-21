import { LOGO_SVG } from "./logo";

export type ReceiptImage = {
  code: string;
  paid: boolean;
  statusLabel: string;
  meta: [string, string][];
  files: { name: string; detail: string; price: string }[];
  rounding: string | null;
  totalLabel: string;
  total: string;
  family: string; // font-family dari halaman (Plus Jakarta Sans)
};

const W = 1080;
const PAD = 64;
const INK = "#131b2e";
const BLUE = "#1d4ed8";
const MUTED = "#434655";

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function fit(c: CanvasRenderingContext2D, text: string, max: number) {
  if (c.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && c.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG)}`;
  });
}

/** Menggambar struk digital sebagai PNG (1080 px) di browser. Hanya metadata, tanpa isi dokumen. */
export async function renderReceiptPng(d: ReceiptImage): Promise<Blob> {
  const fam = `${d.family}, system-ui, sans-serif`;
  try {
    await Promise.all([document.fonts.load(`800 40px ${fam}`), document.fonts.load(`500 28px ${fam}`)]);
  } catch {}
  const logo = await loadLogo();

  const H = PAD * 2 + 128 + 112 + 56 + d.meta.length * 52 + 40 + d.files.length * 124 + (d.rounding ? 52 : 0) + 40 + 100 + 36 + 40;
  const scale = 1;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const c = canvas.getContext("2d")!;
  c.scale(scale, scale);
  c.textBaseline = "alphabetic";

  c.fillStyle = "#fff";
  c.fillRect(0, 0, W, H);

  let y = PAD;
  // Header: logo + nama + lencana status
  if (logo) c.drawImage(logo, PAD, y, 88, 88);
  c.fillStyle = INK;
  c.font = `800 60px ${fam}`;
  c.fillText("Paper", PAD + 112, y + 64);
  const pw = c.measureText("Paper").width;
  c.fillStyle = BLUE;
  c.fillText("Mate", PAD + 112 + pw, y + 64);

  const badge = d.paid ? "LUNAS" : d.statusLabel.toUpperCase();
  c.font = `800 26px ${fam}`;
  const bw = c.measureText(badge).width + 56;
  c.fillStyle = d.paid ? "#6ffbbe" : "#e2e7ff";
  rr(c, W - PAD - bw, y + 22, bw, 52, 26);
  c.fill();
  c.fillStyle = d.paid ? "#002113" : BLUE;
  c.fillText(badge, W - PAD - bw + 28, y + 58);
  y += 88 + 40;

  // Judul + kode
  c.fillStyle = MUTED;
  c.font = `800 24px ${fam}`;
  c.fillText("STRUK TRANSAKSI DIGITAL", PAD, y + 24);
  c.fillStyle = BLUE;
  c.font = `800 72px ${fam}`;
  c.fillText(d.code.split("").join(String.fromCharCode(0x200a)), PAD, y + 24 + 80);
  y += 112;

  // Kotak metadata
  const mh = 56 + d.meta.length * 52;
  c.fillStyle = "#f2f3ff";
  rr(c, PAD, y, W - PAD * 2, mh, 24);
  c.fill();
  d.meta.forEach(([k, v], i) => {
    const by = y + 28 + i * 52 + 34;
    c.fillStyle = MUTED;
    c.font = `500 28px ${fam}`;
    c.textAlign = "left";
    c.fillText(k, PAD + 32, by);
    c.fillStyle = INK;
    c.font = `800 28px ${fam}`;
    c.textAlign = "right";
    c.fillText(fit(c, v, 640), W - PAD - 32, by);
  });
  c.textAlign = "left";
  y += mh + 40;

  // Daftar berkas
  for (const f of d.files) {
    c.fillStyle = INK;
    c.font = `800 32px ${fam}`;
    c.fillText(fit(c, f.name, 700), PAD, y + 36);
    c.fillStyle = MUTED;
    c.font = `500 25px ${fam}`;
    c.fillText(fit(c, f.detail, 700), PAD, y + 36 + 40);
    c.fillStyle = INK;
    c.font = `800 32px ${fam}`;
    c.textAlign = "right";
    c.fillText(f.price, W - PAD, y + 36);
    c.textAlign = "left";
    y += 124;
  }

  if (d.rounding) {
    c.fillStyle = MUTED;
    c.font = `500 28px ${fam}`;
    c.fillText("Pembulatan", PAD, y + 34);
    c.textAlign = "right";
    c.fillText(d.rounding, W - PAD, y + 34);
    c.textAlign = "left";
    y += 52;
  }

  // Total
  y += 40;
  c.fillStyle = "#f2f3ff";
  rr(c, PAD, y, W - PAD * 2, 100, 24);
  c.fill();
  c.fillStyle = INK;
  c.font = `800 28px ${fam}`;
  c.fillText(d.totalLabel, PAD + 32, y + 62);
  c.fillStyle = BLUE;
  c.font = `800 56px ${fam}`;
  c.textAlign = "right";
  c.fillText(d.total, W - PAD - 32, y + 68);
  c.textAlign = "left";
  y += 100 + 36;

  c.fillStyle = MUTED;
  c.font = `500 24px ${fam}`;
  c.textAlign = "center";
  c.fillText("Isi dokumen tidak disimpan di struk ini · Terima kasih telah mencetak di PaperMate", W / 2, y + 24);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas"))), "image/png"));
}
