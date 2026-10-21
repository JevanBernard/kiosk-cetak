"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_FILE_BYTES, formatRupiah, kindFromMime } from "@kioskcetak/shared";
import { ApiError, api } from "@/lib/client";
import { I, MIcon, Shell, Stepper, machineLabel, mmss, useCountdown } from "../mobile/ui";

type FileView = {
  id: string;
  name: string;
  kind: string;
  status: string;
  error: string | null;
  pages: number | null;
  sides: number | null;
  price: number | null;
  options: { color: boolean; duplex: boolean; copies: number; nup: number } | null;
};
type OrderData = {
  machine: {
    name: string;
    code: string | null;
    location: string | null;
    hardware: { paperPct: number; ink: number; duplex: boolean };
    availability: { state: "available" | "busy" | "unavailable"; reason: string | null };
    whatsapp: string | null;
  };
  sessionExpiresAt: string;
  view: null | {
    order: { code: string; status: string; pay_expires_at: string | null; total: number; paid_at: string | null };
    files: FileView[];
    totals: { subtotal: number; total: number; rounding: number };
    estimateSeconds?: number;
  };
};
type Upload = { key: string; name: string; progress: number; error?: string };

const DRAFT = ["DIBUAT", "DIUPLOAD", "DIATUR"];
const PRINTING = ["LUNAS", "MENCETAK", "CETAK_ULANG"];
const PROCESSING = ["pending", "uploaded", "processing"];
const PAY_WINDOW_SECONDS = 300;

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

const fileIcon = (kind: string) => (kind === "pdf" ? I.file : kind === "pptx" ? I.slides : kind === "image" ? I.image : I.file);

/**
 * Halaman HP: mengunggah dokumen, memantau pembayaran/pencetakan, dan mengunduh nota.
 * Preview, pengaturan cetak, ringkasan harga, dan QRIS ada di layar kiosk.
 */
export default function OrderPage() {
  const [data, setData] = useState<OrderData | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
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
  const anyProcessing = data?.view?.files.some((f) => PROCESSING.includes(f.status));
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

  const sessionLeft = useCountdown(data?.sessionExpiresAt);
  const payLeft = useCountdown(data?.view?.order.pay_expires_at);

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
    if (!confirm("Batalkan order ini? Kunci mesin akan dilepas untuk antrean lain.")) return;
    await api("/api/order/cancel", { method: "POST" }).catch((e) => alert(e.message));
    await refresh();
  }

  const view = data?.view ?? null;
  const machine = data?.machine ?? null;
  const avail = machine?.availability;
  const draft = !!status && DRAFT.includes(status);
  const waLink = useMemo(() => {
    if (!machine?.whatsapp || !view) return null;
    return `https://wa.me/${machine.whatsapp}?text=${encodeURIComponent(`Halo, saya mau lapor masalah cetak. Kode transaksi: ${view.order.code}`)}`;
  }, [machine, view]);

  if (fatal) {
    return (
      <Shell tag="Unggah Dokumen">
        <div className="m-card m-live bad">
          <div className="m-live-in">
            <div className="ic"><MIcon d={I.alert} size={22} /></div>
            <div><div className="k">Sesi tidak aktif</div><h2>Scan ulang QR</h2><p>{fatal}</p></div>
          </div>
        </div>
        <div className="m-card m-stack m-center">
          <p className="m-sm">Datang ke mesin cetak, lalu scan QR yang tampil di layarnya dengan kamera HP.</p>
          <a className="m-btn soft block" href="/"><MIcon d={I.search} size={18} />Cek status dengan kode transaksi</a>
        </div>
      </Shell>
    );
  }
  if (!data || !machine) {
    return (
      <Shell tag="Unggah Dokumen">
        <div className="m-card m-stack m-center" style={{ padding: "2rem" }}><span className="m-spin" /><p className="m-sm">Memuat...</p></div>
      </Shell>
    );
  }

  const files = view?.files ?? [];
  const readyFiles = files.filter((f) => f.status === "ready");
  const totalPages = readyFiles.reduce((n, f) => n + (f.pages ?? 0), 0);
  const canStartNew = !view || ["SELESAI", "KEDALUWARSA", "DIBATALKAN", "DIREFUND"].includes(status!);
  const showUploader = draft || (canStartNew && avail?.state === "available");
  const printing = !!status && PRINTING.includes(status);
  const step = status === "SELESAI" ? 5 : printing ? 4 : status === "MENUNGGU_BAYAR" ? 3 : draft && files.length > 0 ? 2 : 1;
  const tag = status === "MENUNGGU_BAYAR" ? "Pembayaran QRIS" : printing || status === "SELESAI" ? "Status Cetak" : "Unggah Dokumen";
  const receiptBtn = view && (
    <a className="m-btn block" href={`/status/${view.order.code}`}><MIcon d={I.receipt} size={18} />Lihat &amp; unduh nota</a>
  );
  const help = waLink && (
    <a className="m-btn wa block" href={waLink} target="_blank" rel="noreferrer"><MIcon d={I.chat} size={18} />Laporkan masalah via WhatsApp Admin</a>
  );

  const stateBadge = avail?.state === "available" ? { c: "", t: "Tersedia" } : avail?.state === "busy" ? { c: "warn", t: "Dipakai" } : { c: "bad", t: "Tidak tersedia" };
  const hw = machine.hardware;

  const dock = draft && view ? (
    <>
      <div className="m-dock-t">
        <div className="m-cap">Total siap cetak</div>
        <div><b>{readyFiles.length} File</b><i>({totalPages} Hal)</i></div>
      </div>
      <div className="m-go wait"><span>Lanjut di<br />layar mesin</span><MIcon d={I.arrow} size={20} /></div>
    </>
  ) : undefined;

  return (
    <Shell tag={tag} machine={machine} sessionLeft={sessionLeft} dock={dock}>
      <Stepper step={step} />

      {/* Status mesin */}
      <div className="m-card m-machine">
        <div className="m-machine-top">
          <div className="m-machine-l">
            <div className="m-icobox"><MIcon d={I.print} size={18} /></div>
            <div><b>{machineLabel(machine)}</b><span>{machine.name}</span></div>
          </div>
          <span className={`m-badge ${stateBadge.c}`}><span className="m-dot" />{stateBadge.t}</span>
        </div>
        <div className="m-chips">
          <div className="m-hw"><small><MIcon d={I.paper} size={14} />Kertas A4</small><b className="m-num">{hw.paperPct}%</b></div>
          <div className="m-hw"><small><MIcon d={I.ink} size={14} />Tinta</small><b className="m-num">{hw.ink}%</b></div>
          <div className="m-hw"><small><MIcon d={I.duplex} size={14} />Duplex</small><b>{hw.duplex ? "Aktif" : "Nonaktif"}</b></div>
        </div>
        {avail && avail.state !== "available" && !printing && status !== "MENUNGGU_BAYAR" && !draft && (
          <p className="m-sm">{avail.reason} Halaman ini diperbarui otomatis.</p>
        )}
      </div>

      {/* Hasil akhir order sebelumnya */}
      {status === "SELESAI" && view && (
        <>
          <div className="m-card m-live ok">
            <div className="m-live-in">
              <div className="ic"><MIcon d={I.checkCircle} size={22} /></div>
              <div><div className="k">Selesai</div><h2>Ambil dokumen di nampan</h2><p>Dokumenmu sudah dihapus dari sistem.</p></div>
            </div>
          </div>
          <div className="m-card m-stack m-center">
            <div className="m-cap">Kode transaksi</div>
            <div className="m-bigcode">{view.order.code}</div>
            {receiptBtn}
          </div>
        </>
      )}
      {status === "MENUNGGU_REFUND" && view && (
        <div className="m-card m-live bad">
          <div className="m-live-in">
            <div className="ic"><MIcon d={I.alert} size={22} /></div>
            <div style={{ flex: 1 }}>
              <div className="k">Pencetakan gagal</div><h2>Maaf, cetak gagal</h2>
              <p>Dana akan dikembalikan. Isi data pengembalian dana di halaman status.</p>
              <a className="m-btn block" style={{ marginTop: ".75rem", background: "#fff", color: "var(--m-error)" }} href={`/status/${view.order.code}`}>Isi data pengembalian dana</a>
            </div>
          </div>
        </div>
      )}
      {status === "KEDALUWARSA" && (
        <div className="m-card m-live plain"><div className="m-live-in"><div className="ic"><MIcon d={I.hourglass} size={20} /></div><div><div className="k">Kedaluwarsa</div><p>Waktu pembayaran habis dan order dibatalkan. Filemu sudah dihapus. Kamu bisa membuat order baru.</p></div></div></div>
      )}
      {status === "DIBATALKAN" && (
        <div className="m-card m-live plain"><div className="m-live-in"><div className="ic"><MIcon d={I.cancel} size={20} /></div><div><div className="k">Dibatalkan</div><p>Order dibatalkan. Filemu sudah dihapus.</p></div></div></div>
      )}

      {/* Menunggu pembayaran: QRIS ada di layar kiosk */}
      {status === "MENUNGGU_BAYAR" && view && (
        <>
          <div className="m-card m-lock">
            <div className="ic"><MIcon d={I.lock} size={20} /></div>
            <div>
              <div className="m-row" style={{ justifyContent: "flex-start", gap: ".375rem", flexWrap: "wrap" }}>
                <span className="m-lab">{machine.code ? `Kiosk #${machine.code}` : machine.name} terkunci sementara</span>
                <span className="m-badge sec">Reserved</span>
              </div>
              <p>Mesin dijaga untuk antreanmu. Selesaikan scan QRIS di layar mesin sebelum waktu habis.</p>
            </div>
          </div>
          <div className="m-card m-cd">
            <div className="m-cap" style={{ display: "flex", alignItems: "center", gap: ".375rem" }}><MIcon d={I.hourglass} size={16} />Sisa waktu pembayaran</div>
            <div className={`m-cd-t m-num${(payLeft ?? 0) < 60 ? "" : " ok"}`} >{mmss(payLeft ?? 0)}</div>
            <div className="m-bar"><i style={{ width: `${Math.min(100, ((payLeft ?? 0) / PAY_WINDOW_SECONDS) * 100)}%`, background: (payLeft ?? 0) < 60 ? "var(--m-error)" : "var(--m-primary-c)" }} /></div>
          </div>
          <div className="m-card md m-stack m-center">
            <div className="m-cap">Total tagihan</div>
            <div className="m-bigcode m-num">{formatRupiah(view.order.total)}</div>
            <ol className="m-steps-l">
              <li>Buka e-wallet atau m-banking di HP ini (GoPay, OVO, Dana, ShopeePay, BCA Mobile, dll).</li>
              <li>Pilih <b>Scan / Bayar</b>, lalu arahkan kamera ke <b>QRIS di layar mesin</b>.</li>
              <li>Setelah berhasil, halaman ini berubah otomatis dan notamu bisa diunduh.</li>
            </ol>
          </div>
          <div className="m-livepill"><span className="m-spin" /><span>Menunggu konfirmasi pembayaran... (otomatis mendeteksi)</span></div>
          <div className="m-card">
            <div className="m-row" style={{ marginBottom: ".5rem" }}>
              <div><div className="m-cap">Rincian dokumen</div><div className="m-lab m-code">{view.order.code}</div></div>
              <span className="m-badge" style={{ background: "var(--m-container)", color: "var(--m-muted)" }}>{files.length} Berkas</span>
            </div>
            <div className="m-rows">
              {files.map((f) => (
                <div key={f.id} className="m-line">
                  <div className="a">
                    <span className={`m-fico ${f.kind === "pdf" ? "pdf" : f.kind === "image" ? "image" : ""}`} style={{ width: "2rem", height: "2rem" }}><MIcon d={fileIcon(f.kind)} size={18} /></span>
                    <div>
                      <b>{f.name}</b>
                      {f.options && <span>{f.sides} sisi · {f.options.color ? "Warna" : "Hitam-putih"} · {f.options.duplex ? "bolak-balik" : "1 sisi"}{f.options.nup > 1 ? ` · ${f.options.nup}-up` : ""} × {f.options.copies}</span>}
                    </div>
                  </div>
                  <span className="p m-num">{f.price !== null ? formatRupiah(f.price) : "-"}</span>
                </div>
              ))}
              {view.totals.rounding > 0 && <div className="m-line m-sm"><span>Pembulatan</span><span className="m-num">{formatRupiah(view.totals.rounding)}</span></div>}
              <div className="m-sum"><span className="m-cap">Total tagihan</span><b className="t m-num">{formatRupiah(view.order.total)}</b></div>
            </div>
          </div>
          <button className="m-btn danger block" onClick={cancel}><MIcon d={I.cancel} size={18} />Batalkan order</button>
          {help}
        </>
      )}

      {/* Sedang mencetak */}
      {view && printing && (
        <>
          <div className={`m-card m-live${status === "CETAK_ULANG" ? " plain" : ""}`}>
            <div className="m-live-in">
              <div className="ic spin"><MIcon d={status === "LUNAS" ? I.checkCircle : I.sync} size={22} /></div>
              <div>
                <div className="k">Status kiosk langsung</div>
                <h2>{status === "LUNAS" ? "Pembayaran Berhasil!" : status === "CETAK_ULANG" ? "Mencoba cetak ulang" : "Sedang mencetak"}</h2>
                <p>
                  {status === "LUNAS" && "Menyiapkan dokumen untuk dicetak. Mohon jangan tinggalkan kiosk."}
                  {status === "MENCETAK" && "Kertas akan segera keluar di nampan. Mohon jangan tinggalkan kiosk."}
                  {status === "CETAK_ULANG" && "Ada kendala pada printer. Sistem mencoba mencetak ulang otomatis."}
                </p>
              </div>
            </div>
          </div>

          <div className="m-card">
            <div className="m-row">
              <div className="m-lab m-row" style={{ justifyContent: "flex-start", gap: ".375rem" }}><MIcon d={I.pin} size={18} />Instruksi pengambilan</div>
              {!!view.estimateSeconds && <span className="m-pct"><MIcon d={I.timer} size={14} />~{Math.max(1, Math.round(view.estimateSeconds / 60))} mnt</span>}
            </div>
            <div className="m-pick">
              <div className="m-printer">
                <div className="body"><div className="leds"><i /><i /></div><div className="slot" /></div>
                <div className="sheet"><i /><i /><i /></div>
                <div className="tray" />
              </div>
              <p>Silakan berdiri dekat <em>{machine.code ? `Kiosk #${machine.code}` : machine.name}</em>. Dokumen akan keluar di baki nampan bawah.</p>
              <small>Periksa kelengkapan halaman sebelum meninggalkan lokasi. Boleh menutup halaman ini; pencetakan tetap berjalan.</small>
            </div>
          </div>

          <div className="m-card m-stack">
            <div className="m-row">
              <div><div className="m-lab">Proses cetak perangkat</div><div className="m-sm">Diperbarui otomatis dari mesin</div></div>
              <span className="m-pct m-num">{status === "LUNAS" ? 20 : status === "MENCETAK" ? 65 : 40}%</span>
            </div>
            <div className="m-tl">
              <div className="m-tl-i done"><span className="c"><MIcon d={I.check} size={16} /></span><div><b>Pembayaran terverifikasi</b><span>Lunas via QRIS</span></div></div>
              <div className={`m-tl-i ${status === "LUNAS" ? "now" : "done"}`}><span className="c"><MIcon d={status === "LUNAS" ? I.sync : I.check} size={16} /></span><div><b>Menyiapkan dokumen akhir</b><span>Mesin mengunduh dan merender PDF</span></div></div>
              <div className={`m-tl-i ${status === "LUNAS" ? "todo" : "now"}`}><span className="c"><MIcon d={I.print} size={16} /></span><div><b>{status === "CETAK_ULANG" ? "Mencetak ulang..." : "Sedang mencetak..."}</b><span>{totalPages > 0 ? `${totalPages} halaman dari ${files.length} berkas` : "Kertas keluar di nampan"}</span></div></div>
              <div className="m-tl-i todo"><span className="c"><MIcon d={I.shield} size={16} /></span><div><b>Selesai &amp; pembersihan file</b><span>File dihapus otomatis setelah cetak</span></div></div>
            </div>
          </div>

          <div className="m-card low m-privacy">
            <div className="ic"><MIcon d={I.shield} size={18} /></div>
            <div><b>Jaminan privasi dokumen</b><p>Dokumenmu dihapus otomatis dari server dan kiosk segera setelah pencetakan selesai.</p></div>
          </div>

          <div className="m-card m-stack">
            <div className="m-row"><div className="m-lab">Kode transaksi</div><span className="m-code">{view.order.code}</span></div>
            {receiptBtn}
          </div>
          {help}
        </>
      )}

      {/* Upload */}
      {showUploader && (
        <div className="m-card m-drop">
          <div className="m-drop-ico"><MIcon d={I.upload} size={28} /></div>
          <h2 className="m-h2">Unggah Berkas Tugas</h2>
          <p>Pilih dokumen dari penyimpanan, galeri, atau Google Drive di HP Anda.</p>
          <label className="m-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Saya setuju dengan <a href="/terms" target="_blank">Syarat Penggunaan</a> dan <a href="/privacy" target="_blank">Kebijakan Privasi</a>. Dokumen dihapus otomatis setelah dicetak.</span>
          </label>
          <input ref={fileInput} type="file" multiple hidden accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png" onChange={(e) => uploadAll(e.target.files)} />
          <button className="m-btn" disabled={!consent} onClick={() => fileInput.current?.click()}>
            <MIcon d={I.plus} size={18} />Pilih File Dokumen
          </button>
          <div className="m-sm" style={{ display: "flex", alignItems: "center", gap: ".25rem", fontSize: 10, fontWeight: 700 }}>
            <MIcon d={I.info} size={14} />Format: PDF, DOCX, PPTX, JPG, PNG (Maks {Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)
          </div>
        </div>
      )}

      {/* Unggahan berjalan */}
      {uploads.length > 0 && (
        <div className="m-card m-stack">
          {uploads.map((u) => (
            <div key={u.key} className="m-up">
              <div className="m-row">
                <span className="m-lab" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{u.name}</span>
                {u.error ? <button className="m-x" aria-label="Tutup" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}><MIcon d={I.cancel} size={16} /></button> : <span className="m-sm m-num">{Math.round(u.progress * 100)}%</span>}
              </div>
              {u.error ? <div className="m-sm" style={{ color: "var(--m-error)" }}>{u.error}</div> : <div className="m-bar"><i style={{ width: `${Math.round(u.progress * 100)}%` }} /></div>}
            </div>
          ))}
        </div>
      )}

      {/* Daftar file terunggah */}
      {draft && files.length > 0 && (
        <div className="m-stack">
          <div className="m-list-h">
            <div className="l"><span className="m-lab">Berkas Terpilih</span><span className="m-badge" style={{ background: "var(--m-high)", color: "var(--m-primary)" }}>{files.length} File</span></div>
          </div>
          {files.map((f) => (
            <div key={f.id} className="m-card m-file">
              <div className="m-file-l">
                <div className={`m-fico ${f.kind === "pdf" ? "pdf" : f.kind === "image" ? "image" : ""}`}><MIcon d={fileIcon(f.kind)} size={24} /></div>
                <div style={{ minWidth: 0 }}>
                  <b>{f.name}</b>
                  {f.status === "ready" && <div className="meta">{f.pages} halaman</div>}
                  {f.status === "error" ? (
                    <div className="err">{f.error ?? "File tidak dapat diproses. Simpan sebagai PDF (tanpa password), lalu unggah ulang."}</div>
                  ) : (
                    <div className="st">
                      {f.status === "ready" ? (
                        <span className="m-badge"><MIcon d={I.checkCircle} size={12} />Siap Cetak</span>
                      ) : (
                        <span className="m-badge sec"><span className="m-spin" style={{ width: ".75rem", height: ".75rem", borderWidth: 2 }} />{f.kind === "docx" || f.kind === "pptx" ? "Mengonversi ke PDF..." : "Memproses file..."}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button className="m-x" title="Hapus berkas" aria-label={`Hapus ${f.name}`} onClick={() => removeFile(f.id)}><MIcon d={I.trash} size={16} /></button>
            </div>
          ))}
        </div>
      )}

      {draft && view && (
        <>
          <div className="m-card low m-tip">
            <div className="ic"><MIcon d={I.bulb} size={16} /></div>
            <p><b>Lanjutkan di layar mesin.</b> Atur warna, jumlah salinan, dan lihat preview serta harga di layar mesin, lalu bayar dengan QRIS. Kamu masih bisa menambah file dari HP ini sebelum membayar. Hasil konversi DOCX &amp; PPTX bisa sedikit berbeda; upload PDF untuk hasil paling akurat.</p>
          </div>
          <button className="m-btn danger block" onClick={cancel}><MIcon d={I.cancel} size={18} />Batalkan order</button>
        </>
      )}

      {!printing && status !== "MENUNGGU_BAYAR" && status !== "SELESAI" && help}
      <div className="m-links">
        <a href="/">Cek status dengan kode transaksi</a> · <a href="/privacy">Privasi</a> · <a href="/terms">Syarat</a>
      </div>
    </Shell>
  );
}
