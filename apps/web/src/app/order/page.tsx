"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_FILE_BYTES, formatRupiah, kindFromMime } from "@kioskcetak/shared";
import { ApiError, STATUS_LABEL, api, fmtTime } from "@/lib/client";

type FileView = {
  id: string;
  name: string;
  kind: string;
  status: string;
  error: string | null;
  pages: number | null;
};
type OrderData = {
  machine: { name: string; availability: { state: "available" | "busy" | "unavailable"; reason: string | null }; whatsapp: string | null };
  view: null | {
    order: { code: string; status: string; pay_expires_at: string | null; total: number; paid_at: string | null };
    files: FileView[];
  };
};
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

/**
 * Halaman HP: hanya untuk mengunggah dokumen, lalu (setelah pembayaran) mengunduh nota.
 * Preview, pengaturan cetak, ringkasan harga, dan QRIS ada di layar kiosk.
 */
export default function OrderPage() {
  const [data, setData] = useState<OrderData | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [now, setNow] = useState(Date.now());
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

  async function removeFile(id: string) {
    await api(`/api/order/files/${id}`, { method: "DELETE" }).catch(() => {});
    await refresh();
  }

  async function cancel() {
    if (!confirm("Batalkan order ini?")) return;
    await api("/api/order/cancel", { method: "POST" }).catch((e) => alert(e.message));
    await refresh();
  }

  const view = data?.view ?? null;
  const avail = data?.machine.availability;
  const draft = !!status && DRAFT.includes(status);
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
  const receiptBtn = view && (
    <a className="btn primary block" href={`/status/${view.order.code}`}>Lihat &amp; unduh nota</a>
  );

  return (
    <main className="wrap">
      <div className="row between" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>KioskCetak</h1>
        <span className={`pill ${avail?.state === "available" ? "ok" : avail?.state === "busy" ? "warn" : "bad"}`}>{data.machine.name}</span>
      </div>

      {avail && avail.state !== "available" && !PRINTING.includes(status ?? "") && status !== "MENUNGGU_BAYAR" && !draft && (
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
          {receiptBtn}
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
          {receiptBtn}
        </div>
      )}

      {/* Menunggu pembayaran: QRIS ada di layar kiosk */}
      {status === "MENUNGGU_BAYAR" && view && (
        <div className="card stack" style={{ textAlign: "center" }}>
          <h2>Bayar lewat QRIS di layar mesin</h2>
          <div className="big">{formatRupiah(view.order.total)}</div>
          <div className={secondsLeft < 60 ? "err" : "muted"}>Sisa waktu <b>{fmtTime(secondsLeft)}</b></div>
          <ol className="muted" style={{ textAlign: "left", paddingLeft: 20, margin: 0 }}>
            <li>Buka aplikasi e-wallet atau m-banking di HP ini (GoPay, OVO, Dana, ShopeePay, dll).</li>
            <li>Pilih <b>Scan / Bayar</b>, lalu arahkan kamera ke QRIS di layar mesin.</li>
            <li>Setelah berhasil, halaman ini berubah otomatis dan notamu bisa diunduh.</li>
          </ol>
          <p className="muted">Kode transaksi: <b>{view.order.code}</b></p>
          <button className="block danger" onClick={cancel}>Batalkan order</button>
        </div>
      )}

      {/* Upload */}
      {showUploader && (
        <div className="card stack">
          <h2>Upload dokumen</h2>
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

      {/* Daftar file terunggah */}
      {draft && view && view.files.length > 0 && (
        <div className="card stack">
          <h2>Dokumen terunggah</h2>
          {view.files.map((f) => (
            <div key={f.id} className="row between">
              <div className="grow" style={{ overflow: "hidden" }}>
                <b style={{ overflowWrap: "anywhere" }}>{f.name}</b>
                <div className={f.status === "error" ? "err" : "muted"}>
                  {f.status === "ready" && `Siap · ${f.pages} halaman`}
                  {f.status === "error" && (f.error ?? "File tidak dapat diproses. Simpan sebagai PDF (tanpa password), lalu unggah ulang.")}
                  {["pending", "uploaded", "processing"].includes(f.status) && (f.kind === "docx" || f.kind === "pptx" ? "Mengonversi ke PDF..." : "Memproses file...")}
                </div>
              </div>
              <button className="small danger" onClick={() => removeFile(f.id)}>Hapus</button>
            </div>
          ))}
        </div>
      )}
      {draft && view && (
        <div className="banner stack">
          <b>Lanjutkan di layar mesin.</b>
          <div>Atur warna dan jumlah salinan, lihat preview serta harga di layar mesin, lalu bayar dengan QRIS. Kamu bisa menambah file dari HP ini sebelum membayar.</div>
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
