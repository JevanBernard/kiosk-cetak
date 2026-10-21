"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  MAX_FILE_BYTES,
  NUP_VALUES,
  formatRupiah,
  kindFromMime,
  priceFile,
  type PriceConfig,
  type PrintOptions,
} from "@kioskcetak/shared";
import { ApiError, STATUS_LABEL, api, fmtTime } from "@/lib/client";
import Preview from "./Preview";

type FileView = {
  id: string;
  name: string;
  kind: string;
  status: string;
  error: string | null;
  pages: number | null;
  options: PrintOptions | null;
  sides: number | null;
  price: number | null;
  optionError: string | null;
};
type OrderData = {
  machine: { name: string; availability: { state: "available" | "busy" | "unavailable"; reason: string | null }; whatsapp: string | null; capabilities: { duplex: boolean; color: boolean } };
  config: PriceConfig;
  view: null | {
    order: { code: string; status: string; pay_expires_at: string | null; total: number };
    files: FileView[];
    totals: { subtotal: number; total: number; rounding: number };
    estimateSeconds: number;
    ready: boolean;
    minTotal: number;
  };
};
type Qr = { qrString: string; amount: number; expiresAt: string; code: string };
type Upload = { key: string; name: string; progress: number; error?: string };

const DRAFT = ["DIBUAT", "DIUPLOAD", "DIATUR"];
const PRINTING = ["LUNAS", "MENCETAK", "CETAK_ULANG"];

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

function mimeOf(f: File) {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? f.type;
}

function putFile(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error("Unggahan gagal. Periksa koneksi lalu coba lagi.")));
    xhr.onerror = () => reject(new Error("Koneksi terputus. Coba unggah ulang."));
    xhr.send(form);
  });
}

export default function OrderPage() {
  const [data, setData] = useState<OrderData | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [qr, setQr] = useState<Qr | null>(null);
  const [qrImg, setQrImg] = useState("");
  const [now, setNow] = useState(Date.now());
  const [payErr, setPayErr] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [fileState, setFileState] = useState<Record<string, "ok" | "saving" | "invalid">>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await api<OrderData>("/api/order"));
      setFatal(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const why = new URLSearchParams(window.location.search).get("e");
        setFatal(why === "qr" ? "QR sudah kedaluwarsa atau sudah dipakai. Scan QR terbaru di layar mesin." : "Sesi berakhir. Scan ulang QR di layar mesin.");
        setData(null);
      }
    }
  }, []);

  const status = data?.view?.order.status;
  const anyProcessing = data?.view?.files.some((f) => ["pending", "uploaded", "processing"].includes(f.status));
  const fast = status === "MENUNGGU_BAYAR" || (status && PRINTING.includes(status)) || anyProcessing || !data;

  useEffect(() => {
    if (fatal) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await refresh();
      if (!stop) t = setTimeout(loop, fast ? 1500 : 4000);
    };
    loop();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [refresh, fast, fatal]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Muat ulang QR bila halaman dibuka lagi saat masih menunggu bayar (pay idempoten pada order yang sama)
  useEffect(() => {
    if (status === "MENUNGGU_BAYAR" && !qr) {
      api<Qr>("/api/order/pay", { method: "POST" }).then(setQr).catch(() => {});
    }
    if (status !== "MENUNGGU_BAYAR" && qr) setQr(null);
  }, [status, qr]);

  useEffect(() => {
    if (qr) QRCode.toDataURL(qr.qrString, { margin: 1, width: 640, errorCorrectionLevel: "M" }).then(setQrImg);
  }, [qr]);

  async function uploadAll(list: FileList | null) {
    if (!list || !data) return;
    for (const file of Array.from(list)) {
      const key = Math.random().toString(36).slice(2);
      const upd = (p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));
      setUploads((u) => [...u, { key, name: file.name, progress: 0 }]);
      try {
        const mime = mimeOf(file);
        if (!kindFromMime(mime)) throw new Error("Format tidak didukung. Gunakan PDF, DOCX, PPTX, JPG, atau PNG. Dari Word/PowerPoint lain, simpan sebagai PDF dulu.");
        if (file.size > MAX_FILE_BYTES) throw new Error("File lebih dari 50 MB.");
        if (file.size === 0) throw new Error("File kosong.");
        const slot = await api<{ fileId: string; uploadUrl: string }>("/api/order/files", { method: "POST", json: { name: file.name, size: file.size, mime } });
        await putFile(slot.uploadUrl, file, (p) => upd({ progress: p }));
        await api(`/api/order/files/${slot.fileId}`, { method: "POST" });
        setUploads((u) => u.filter((x) => x.key !== key));
        await refresh();
      } catch (e: any) {
        upd({ error: e.message ?? "Gagal mengunggah." });
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function pay() {
    setPaying(true);
    setPayErr(null);
    try {
      setQr(await api<Qr>("/api/order/pay", { method: "POST" }));
      await refresh();
    } catch (e: any) {
      setPayErr(e.message);
      await refresh();
    } finally {
      setPaying(false);
    }
  }

  async function cancel() {
    if (!confirm("Batalkan order ini?")) return;
    await api("/api/order/cancel", { method: "POST" }).catch((e) => alert(e.message));
    setQr(null);
    await refresh();
  }

  const reportFile = useCallback((id: string, s: "ok" | "saving" | "invalid") => {
    setFileState((m) => (m[id] === s ? m : { ...m, [id]: s }));
  }, []);

  const view = data?.view ?? null;
  const avail = data?.machine.availability;
  const draft = !!status && DRAFT.includes(status);
  const blocked = Object.values(fileState).some((s) => s !== "ok");
  const waLink = useMemo(() => {
    if (!data?.machine.whatsapp || !view) return null;
    return `https://wa.me/${data.machine.whatsapp}?text=${encodeURIComponent(`Halo, saya mau lapor masalah cetak. Kode transaksi: ${view.order.code}`)}`;
  }, [data, view]);

  if (fatal) {
    return (
      <main className="wrap stack">
        <h1>KioskCetak</h1>
        <div className="banner warn">{fatal}</div>
        <p className="muted">Datang ke mesin cetak, lalu scan QR yang tampil di layarnya dengan kamera HP.</p>
        <a className="btn" href="/">Cek status dengan kode transaksi</a>
      </main>
    );
  }
  if (!data) return <main className="wrap"><p className="muted">Memuat...</p></main>;

  const canStartNew = !view || ["SELESAI", "KEDALUWARSA", "DIBATALKAN", "DIREFUND"].includes(status!);
  const showUploader = draft || (canStartNew && avail?.state === "available");
  const secondsLeft = view?.order.pay_expires_at ? (new Date(view.order.pay_expires_at).getTime() - now) / 1000 : 0;

  return (
    <main className="wrap">
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>KioskCetak</h1>
        <span className={`pill ${avail?.state === "available" ? "ok" : avail?.state === "busy" ? "warn" : "bad"}`}>{data.machine.name}</span>
      </div>

      {avail && avail.state !== "available" && !PRINTING.includes(status ?? "") && status !== "MENUNGGU_BAYAR" && (
        <div className={`banner ${avail.state === "busy" ? "warn" : "bad"}`}>
          <b>{avail.state === "busy" ? "Mesin sedang dipakai" : "Mesin tidak tersedia"}</b>
          <div>{avail.reason}</div>
          <div className="muted">Halaman ini diperbarui otomatis.</div>
        </div>
      )}

      {/* Hasil akhir order sebelumnya */}
      {status === "SELESAI" && view && (
        <div className="card stack" style={{ textAlign: "center" }}>
          <div className="big">Selesai</div>
          <p><b>Ambil dokumen di nampan.</b></p>
          <p className="muted">Kode transaksi</p>
          <div className="big">{view.order.code}</div>
          <a className="btn primary" href={`/status/${view.order.code}`}>Lihat struk</a>
          <p className="muted">Dokumenmu sudah dihapus dari sistem.</p>
        </div>
      )}
      {status === "MENUNGGU_REFUND" && view && (
        <div className="banner bad stack">
          <b>Maaf, pencetakan gagal.</b>
          <div>Dana akan dikembalikan. Isi data pengembalian dana di halaman status.</div>
          <a className="btn primary" href={`/status/${view.order.code}`}>Isi data pengembalian dana</a>
        </div>
      )}
      {status === "KEDALUWARSA" && <div className="banner warn">Waktu pembayaran habis dan order dibatalkan. Filemu sudah dihapus. Kamu bisa membuat order baru.</div>}
      {status === "DIBATALKAN" && <div className="banner">Order dibatalkan. Filemu sudah dihapus.</div>}

      {/* Sedang mencetak */}
      {view && PRINTING.includes(status!) && (
        <div className="card stack" style={{ textAlign: "center" }}>
          <h2>{STATUS_LABEL[status!]}</h2>
          <div className="bar"><i style={{ width: status === "LUNAS" ? "20%" : status === "MENCETAK" ? "65%" : "40%" }} /></div>
          <p className="muted">
            {status === "LUNAS" && "Pembayaran diterima. Menyiapkan dokumen..."}
            {status === "MENCETAK" && "Kertas akan segera keluar di nampan. Boleh tutup halaman ini; pencetakan tetap berjalan."}
            {status === "CETAK_ULANG" && "Ada kendala pada printer. Sistem mencoba mencetak ulang otomatis."}
          </p>
          <p>Kode transaksi: <b>{view.order.code}</b></p>
        </div>
      )}

      {/* Menunggu pembayaran */}
      {status === "MENUNGGU_BAYAR" && view && (
        <div className="card stack" style={{ textAlign: "center" }}>
          <h2>Scan untuk bayar (QRIS)</h2>
          {qrImg ? <img className="qr" src={qrImg} alt="QRIS" /> : <p className="muted">Menyiapkan QR...</p>}
          <div className="big">{formatRupiah(view.order.total)}</div>
          <div className={secondsLeft < 60 ? "err" : "muted"}>Sisa waktu <b>{fmtTime(secondsLeft)}</b></div>
          <p className="muted">Setelah bayar, halaman ini berubah otomatis. Kode transaksi: <b>{view.order.code}</b></p>
          {qr?.qrString.startsWith("MOCKQRIS") && (
            <button className="block" onClick={() => api("/api/dev/mock-pay", { method: "POST", json: { code: view.order.code } }).then(refresh).catch((e) => alert(e.message))}>
              Simulasi bayar (mode uji)
            </button>
          )}
          <button className="block danger" onClick={cancel}>Batalkan order</button>
        </div>
      )}

      {/* Upload */}
      {showUploader && (
        <div className="card stack">
          <h2>1. Upload dokumen</h2>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "var(--ink)" }}>
            <input type="checkbox" style={{ width: 22, minHeight: 22, marginTop: 2 }} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Saya setuju dengan <a href="/terms" target="_blank">Syarat Penggunaan</a> dan <a href="/privacy" target="_blank">Kebijakan Privasi</a>. Dokumen dihapus otomatis setelah dicetak.</span>
          </label>
          <input ref={fileInput} type="file" multiple hidden accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png" onChange={(e) => uploadAll(e.target.files)} />
          <button className="primary block" disabled={!consent} onClick={() => fileInput.current?.click()}>Pilih file</button>
          <div className="muted">PDF, Word (DOCX), PowerPoint (PPTX), JPG, PNG. Maks 50 MB per file.</div>
          {uploads.map((u) => (
            <div key={u.key}>
              <div className="row between"><span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>{u.error && <button className="small" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}>Tutup</button>}</div>
              {u.error ? <div className="err">{u.error}</div> : <div className="bar"><i style={{ width: `${Math.round(u.progress * 100)}%` }} /></div>}
            </div>
          ))}
        </div>
      )}

      {/* Daftar file + opsi */}
      {draft && view && view.files.map((f) => (
        <FileCard key={f.id} file={f} config={data.config} caps={data.machine.capabilities} report={reportFile} onChanged={refresh} />
      ))}

      {/* Ringkasan + bayar */}
      {draft && view && view.files.length > 0 && (
        <div className="card stack">
          <h2>Rincian biaya</h2>
          {view.files.filter((f) => f.price !== null).map((f) => (
            <div className="row between" key={f.id}>
              <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
              <span className="price">{formatRupiah(f.price!)}</span>
            </div>
          ))}
          {view.totals.rounding > 0 && <div className="row between muted"><span>Pembulatan</span><span>{formatRupiah(view.totals.rounding)}</span></div>}
          <div className="row between"><b>Total</b><span className="big">{formatRupiah(view.totals.total)}</span></div>
          {view.ready && <div className="muted">Perkiraan waktu cetak: {Math.max(1, Math.round(view.estimateSeconds / 60))} menit</div>}
          {view.ready && view.totals.total < view.minTotal && <div className="err">Total minimal {formatRupiah(view.minTotal)}.</div>}
          {payErr && <div className="banner bad">{payErr}</div>}
          {avail?.state === "busy" && <div className="banner warn">Mesin sedang dipakai pengguna lain. Tombol bayar aktif otomatis saat mesin tersedia.</div>}
          <button
            className="primary block"
            disabled={paying || !view.ready || blocked || avail?.state !== "available" || view.totals.total < view.minTotal}
            onClick={pay}
          >
            {paying ? "Menyiapkan..." : `Bayar ${formatRupiah(view.totals.total)}`}
          </button>
          <div className="muted">Harga dikunci saat QR pembayaran muncul. Kamu punya 5 menit untuk membayar.</div>
          <button className="block danger" onClick={cancel}>Batalkan order</button>
        </div>
      )}

      {waLink && (
        <p className="muted" style={{ textAlign: "center" }}>
          Ada masalah? <a href={waLink} target="_blank" rel="noreferrer">Laporkan masalah</a>
        </p>
      )}
    </main>
  );
}

function FileCard({
  file, config, caps, report, onChanged,
}: {
  file: FileView;
  config: PriceConfig;
  caps: { duplex: boolean; color: boolean };
  report: (id: string, s: "ok" | "saving" | "invalid") => void;
  onChanged: () => Promise<void> | void;
}) {
  const [opts, setOpts] = useState<PrintOptions | null>(file.options);
  const [showPreview, setShowPreview] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const ready = file.status === "ready" && !!file.pages && !!opts;

  useEffect(() => {
    if (!opts && file.options) setOpts(file.options); // opsi default tiba setelah file selesai diproses
  }, [file.options, opts]);

  const priced = ready ? priceFile(opts!, file.pages!, config) : null;
  const error = priced && "error" in priced ? priced.error : null;

  useEffect(() => {
    if (!ready) report(file.id, "saving");
    return () => report(file.id, "ok");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, file.id]);

  function change(patch: Partial<PrintOptions>) {
    const next = { ...opts!, ...patch };
    setOpts(next);
    clearTimeout(timer.current);
    const r = priceFile(next, file.pages!, config);
    if ("error" in r) {
      report(file.id, "invalid");
      return;
    }
    report(file.id, "saving");
    timer.current = setTimeout(async () => {
      try {
        await api(`/api/order/files/${file.id}`, { method: "PUT", json: next });
        await onChanged();
        report(file.id, "ok");
      } catch {
        report(file.id, "invalid");
      }
    }, 350);
  }

  async function remove() {
    await api(`/api/order/files/${file.id}`, { method: "DELETE" }).catch(() => {});
    await onChanged();
  }

  const header = (
    <div className="row between">
      <div className="grow" style={{ overflow: "hidden" }}>
        <b style={{ overflowWrap: "anywhere" }}>{file.name}</b>
        {file.pages && <div className="muted">{file.pages} halaman</div>}
      </div>
      <button className="small danger" onClick={remove}>Hapus</button>
    </div>
  );

  if (file.status === "error") {
    return (
      <div className="card stack">
        {header}
        <div className="banner bad">{file.error ?? "File tidak dapat diproses."}</div>
        <div className="muted">Saran: buka dokumen, simpan sebagai PDF (tanpa password), lalu unggah ulang.</div>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="card stack">
        {header}
        <div className="muted">{file.kind === "docx" || file.kind === "pptx" ? "Mengonversi ke PDF..." : "Memproses file..."}</div>
        <div className="bar"><i style={{ width: "60%" }} /></div>
      </div>
    );
  }

  const o = opts!;
  const seg = (on: boolean, label: string, onClick: () => void, disabled = false, title?: string) => (
    <button className={on ? "on" : ""} onClick={onClick} disabled={disabled} title={title}>{label}</button>
  );
  const colorOk = config.allow_color && caps.color;
  const duplexOk = config.allow_duplex && caps.duplex;
  const nupValues = config.allow_nup ? NUP_VALUES : [1 as const];

  return (
    <div className="card stack">
      {header}
      <div className="grid2">
        <div>
          <label>Warna</label>
          <div className="seg">
            {seg(!o.color, "Hitam-putih", () => change({ color: false }))}
            {seg(o.color, "Warna", () => change({ color: true }), !colorOk, "Warna sedang tidak tersedia")}
          </div>
        </div>
        <div>
          <label>Sisi kertas</label>
          <div className="seg">
            {seg(!o.duplex, "1 sisi", () => change({ duplex: false }))}
            {seg(o.duplex, "Bolak-balik", () => change({ duplex: true }), !duplexOk, "Bolak-balik sedang tidak tersedia")}
          </div>
        </div>
      </div>
      {(!colorOk || !duplexOk) && <div className="muted">{!colorOk && "Cetak warna sedang tidak tersedia. "}{!duplexOk && "Bolak-balik sedang tidak tersedia."}</div>}
      <div className="grid2">
        <div className="field">
          <label>Salinan (maks {config.max_copies})</label>
          <input type="number" inputMode="numeric" min={1} max={config.max_copies} value={o.copies} onChange={(e) => change({ copies: Math.trunc(Number(e.target.value)) || 0 })} />
        </div>
        <div className="field">
          <label>Halaman per lembar</label>
          <select value={o.nup} onChange={(e) => change({ nup: Number(e.target.value) as PrintOptions["nup"] })}>
            {nupValues.map((n) => <option key={n} value={n}>{n === 1 ? "1 (normal)" : n}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Halaman yang dicetak (kosong = semua)</label>
        <input value={o.range} placeholder="Contoh: 1-3, 5, 8-10" onChange={(e) => change({ range: e.target.value })} />
      </div>
      <div className="field">
        <label>Orientasi kertas</label>
        <div className="seg">
          {seg(o.orientation === "portrait", "Potret", () => change({ orientation: "portrait" }))}
          {seg(o.orientation === "landscape", "Lanskap", () => change({ orientation: "landscape" }))}
        </div>
      </div>
      {error ? (
        <div className="err">{error}</div>
      ) : (
        priced && !("error" in priced) && (
          <div className="row between">
            <span className="muted">{priced.sides} sisi × {formatRupiah(priced.unitPrice)} × {o.copies} salinan</span>
            <span className="price">{formatRupiah(priced.total)}</span>
          </div>
        )
      )}
      <button className="small" onClick={() => setShowPreview(!showPreview)}>{showPreview ? "Tutup preview" : "Lihat preview"}</button>
      {showPreview && !error && <Preview fileId={file.id} pages={file.pages!} options={o} kind={file.kind} />}
    </div>
  );
}
