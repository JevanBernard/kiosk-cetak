"use client";
import { useEffect, useRef, useState } from "react";
import { nupGrid, parsePageRange, type PrintOptions } from "@kioskcetak/shared";
import { api } from "@/lib/client";

const PDFJS_VERSION = "3.11.174";
const A4 = 210 / 297;

/**
 * Preview per sisi kertas, dirender di browser (FR-OPT-04): memperhitungkan rentang, N-up,
 * orientasi, dan hitam-putih. Mengunduh PDF lewat URL bertanda tangan berumur 5 menit.
 */
export default function Preview({ fileId, pages, options, kind }: { fileId: string; pages: number; options: PrintOptions; kind: string }) {
  const [doc, setDoc] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState(4);
  const [notA4, setNotA4] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { url } = await api<{ url: string }>(`/api/order/files/${fileId}/preview`);
        const pdfjs: any = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
        const d = await pdfjs.getDocument({ url }).promise;
        const p1 = await d.getPage(1);
        const v = p1.getViewport({ scale: 1 });
        if (!dead) {
          setNotA4(Math.abs(Math.min(v.width, v.height) / Math.max(v.width, v.height) - A4) > 0.03);
          setDoc(d);
        }
      } catch (e: any) {
        if (!dead) setErr("Preview tidak dapat ditampilkan, tetapi file tetap bisa dicetak.");
      }
    })();
    return () => {
      dead = true;
    };
  }, [fileId]);

  const sel = parsePageRange(options.range, pages);
  const selected = "pages" in sel ? sel.pages : [];
  const sheetCount = Math.ceil(selected.length / options.nup);
  const key = JSON.stringify([options.range, options.nup, options.orientation, options.color, show]);

  useEffect(() => {
    if (!doc || !box.current) return;
    let dead = false;
    const root = box.current;
    root.innerHTML = "";
    (async () => {
      const landscape = options.orientation === "landscape";
      const W = landscape ? 300 : 212;
      const H = landscape ? 212 : 300;
      const { cols, rows } = nupGrid(options.nup, options.orientation);
      const n = Math.min(sheetCount, show);
      for (let s = 0; s < n; s++) {
        const canvas = document.createElement("canvas");
        const dpr = window.devicePixelRatio || 1;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + "px";
        canvas.style.height = H + "px";
        if (!options.color) canvas.style.filter = "grayscale(1)";
        const ctx = canvas.getContext("2d")!;
        ctx.scale(dpr, dpr);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, W, H);
        root.appendChild(canvas);
        const slice = selected.slice(s * options.nup, (s + 1) * options.nup);
        for (let i = 0; i < slice.length; i++) {
          if (dead) return;
          const page = await doc.getPage(slice[i]);
          const base = page.getViewport({ scale: 1 });
          const pad = options.nup === 1 ? 0 : 4;
          const cw = W / cols - pad * 2;
          const ch = H / rows - pad * 2;
          const scale = Math.min(cw / base.width, ch / base.height);
          const vp = page.getViewport({ scale: scale * dpr });
          const tmp = document.createElement("canvas");
          tmp.width = vp.width;
          tmp.height = vp.height;
          await page.render({ canvasContext: tmp.getContext("2d")!, viewport: vp }).promise;
          const x = (i % cols) * (W / cols) + pad + (cw - base.width * scale) / 2;
          const y = Math.floor(i / cols) * (H / rows) + pad + (ch - base.height * scale) / 2;
          ctx.drawImage(tmp, x, y, base.width * scale, base.height * scale);
          if (options.nup > 1) {
            ctx.strokeStyle = "#ccc";
            ctx.strokeRect(x, y, base.width * scale, base.height * scale);
          }
        }
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, key]);

  if (err) return <div className="muted">{err}</div>;
  return (
    <div className="stack">
      {kind !== "pdf" && kind !== "image" && (
        <div className="banner warn">Hasil konversi bisa sedikit berbeda dari tampilan di Word/PowerPoint (font, tata letak). Periksa preview, atau unggah PDF untuk hasil paling akurat.</div>
      )}
      {notA4 && <div className="banner">Ukuran halaman bukan A4, akan disesuaikan otomatis (fit to page).</div>}
      {!doc && <div className="muted">Memuat preview...</div>}
      <div className="sheets" ref={box} />
      {doc && (
        <div className="row between">
          <span className="muted">{sheetCount} sisi kertas{sheetCount > show ? `, menampilkan ${show}` : ""}</span>
          {sheetCount > show && <button className="small" onClick={() => setShow(show + 4)}>Tampilkan lebih banyak</button>}
        </div>
      )}
    </div>
  );
}
