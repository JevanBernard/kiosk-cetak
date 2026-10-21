"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { NUP_VALUES, formatRupiah, priceFile, type PriceConfig, type PrintOptions } from "@kioskcetak/shared";
import { api, fmtTime } from "@/lib/client";
import Preview from "../../order/Preview";

export type KioskFile = {
  id: string;
  name: string;
  kind: string;
  status: string;
  error: string | null;
  pages: number | null;
  options: PrintOptions | null;
  sides: number | null;
  price: number | null;
};
export type KioskView = {
  files: KioskFile[];
  totals: { subtotal: number; total: number; rounding: number };
  ready: boolean;
  minTotal: number;
  estimateSeconds: number;
};

type Sync = "ok" | "saving" | "invalid";
type Props = { machineId: string; kioskKey: string; refresh: () => Promise<void> | void };

/** Semua panggilan dari layar kiosk membawa kunci kiosk (?k=) sebagai pengganti sesi HP. */
function useKioskApi(machineId: string, kioskKey: string) {
  return useCallback(
    <T,>(path: string, init?: RequestInit & { json?: unknown }) => api<T>(`/api/kiosk/${machineId}${path}?k=${encodeURIComponent(kioskKey)}`, init),
    [machineId, kioskKey],
  );
}

export function DraftScreen({
  view, config, caps, onCancel, ...p
}: Props & {
  view: KioskView | null;
  config: PriceConfig;
  caps: { duplex: boolean; color: boolean };
  onCancel: () => void;
}) {
  const call = useKioskApi(p.machineId, p.kioskKey);
  const files = view?.files ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sync, setSync] = useState<Record<string, Sync>>({});
  const [payErr, setPayErr] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [live, setLive] = useState<Record<string, PrintOptions>>({}); // opsi yang sedang diedit, agar preview langsung berubah

  const active = files.find((f) => f.id === activeId) ?? files.find((f) => f.status === "ready") ?? files[0] ?? null;
  const report = useCallback((id: string, s: Sync) => setSync((m) => (m[id] === s ? m : { ...m, [id]: s })), []);
  const blocked = Object.values(sync).some((s) => s !== "ok");
  const total = view?.totals.total ?? 0;
  const tooLow = !!view?.ready && total < (view?.minTotal ?? 0);
  const canPay = !!view?.ready && !blocked && !tooLow && !paying;

  async function pay() {
    setPaying(true);
    setPayErr(null);
    try {
      await call("/pay", { method: "POST" });
      await p.refresh();
    } catch (e: any) {
      setPayErr(e.message);
      await p.refresh();
    } finally {
      setPaying(false);
    }
  }

  async function removeFile(id: string) {
    await call(`/files/${id}`, { method: "DELETE" }).catch(() => {});
    await p.refresh();
  }

  return (
    <main className="k-page">
      <div className="k-draft">
        <section className="k-card md k-dleft">
          <div className="k-panel-h">
            <h2>Preview Hasil Cetak</h2>
            {active?.pages && <span className="k-pill fixed">{active.name} · {active.pages} hal</span>}
          </div>
          <div className="k-preview">
            {!active && <div className="k-empty">Menunggu dokumen dari HP Anda...<small>Unggah file lewat HP, preview akan muncul di sini.</small></div>}
            {active && active.status === "error" && <div className="k-empty bad">{active.error ?? "File tidak dapat diproses."}<small>Hapus file ini lalu unggah ulang dari HP (simpan sebagai PDF tanpa password).</small></div>}
            {active && active.status !== "error" && active.status !== "ready" && (
              <div className="k-empty"><div className="k-spin small" />{active.kind === "docx" || active.kind === "pptx" ? "Mengonversi ke PDF..." : "Memproses file..."}</div>
            )}
            {active?.status === "ready" && active.options && active.pages && !("error" in priceFile(active.options, active.pages, config)) && (
              <Preview
                key={active.id}
                endpoint={`/api/kiosk/${p.machineId}/files/${active.id}/preview?k=${encodeURIComponent(p.kioskKey)}`}
                fileId={active.id}
                pages={active.pages}
                options={live[active.id] ?? active.options}
                kind={active.kind}
                zoom={1.7}
              />
            )}
          </div>
        </section>

        <div className="k-dright">
          <section className="k-card k-panel">
            <div className="k-panel-h">
              <h2>Dokumen Anda ({files.length})</h2>
              <span className="k-pill high">Unggah lagi lewat HP</span>
            </div>
            <div className="k-files">
              {files.map((f) => (
                <div key={f.id} className={`k-file${active?.id === f.id ? " on" : ""}`} onClick={() => setActiveId(f.id)}>
                  <div className="n"><b>{f.name}</b><small>{f.status === "ready" ? `${f.pages} halaman` : f.status === "error" ? "Gagal diproses" : "Memproses..."}</small></div>
                  {f.price !== null && <span className="k-num p">{formatRupiah(f.price)}</span>}
                  <button className="k-x" aria-label={`Hapus ${f.name}`} onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}>×</button>
                </div>
              ))}
              {files.length === 0 && <div className="k-hint">Belum ada dokumen.</div>}
            </div>
          </section>

          {active?.status === "ready" && active.options && active.pages && (
            <OptionsCard key={active.id} file={active} config={config} caps={caps} call={call} report={report} refresh={p.refresh} onOpts={(o) => setLive((m) => ({ ...m, [active.id]: o }))} />
          )}

        </div>
      </div>
      <section className="k-card md k-paybar">
        <div className="k-paysum">
          <div className="k-paysum-t">
            <small>Total ({files.filter((f) => f.price !== null).length} dokumen{view && view.totals.rounding > 0 ? `, termasuk pembulatan ${formatRupiah(view.totals.rounding)}` : ""})</small>
            <b className="k-num">{formatRupiah(total)}</b>
          </div>
          <div className="k-paysum-n">
            {tooLow && <span className="k-err">Total minimal {formatRupiah(view!.minTotal)}. Tambah halaman atau salinan.</span>}
            {payErr && <span className="k-err">{payErr}</span>}
            {!tooLow && !payErr && view?.ready && <span className="k-hint">Perkiraan cetak {Math.max(1, Math.round(view.estimateSeconds / 60))} menit. Harga dikunci saat pembayaran dibuat; waktu bayar 5 menit.</span>}
            {!view?.ready && <span className="k-hint">Menunggu dokumen siap diproses...</span>}
          </div>
        </div>
        {!confirmCancel ? (
          <button className="k-btn ghost k-paybtn" onClick={() => setConfirmCancel(true)}>Batalkan</button>
        ) : (
          <div className="k-confirm">
            <span>Batalkan dan hapus dokumen?</span>
            <button className="k-btn danger" onClick={onCancel}>Ya, batalkan</button>
            <button className="k-btn ghost" onClick={() => setConfirmCancel(false)}>Tidak</button>
          </div>
        )}
        <button className="k-btn primary k-paybtn" disabled={!canPay} onClick={pay}>{paying ? "Menyiapkan pembayaran..." : `Bayar ${formatRupiah(total)}`}</button>
      </section>
    </main>
  );
}

function OptionsCard({
  file, config, caps, call, report, refresh, onOpts,
}: {
  file: KioskFile;
  config: PriceConfig;
  caps: { duplex: boolean; color: boolean };
  call: <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>;
  report: (id: string, s: Sync) => void;
  refresh: () => Promise<void> | void;
  onOpts: (o: PrintOptions) => void;
}) {
  const [o, setO] = useState<PrintOptions>(file.options!);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const priced = priceFile(o, file.pages!, config);
  const colorOk = config.allow_color && caps.color;
  const duplexOk = config.allow_duplex && caps.duplex;
  const nups = config.allow_nup ? NUP_VALUES : [1 as const];

  const pending = useRef<PrintOptions | null>(null); // perubahan yang belum terkirim ke server

  async function save(next: PrintOptions) {
    pending.current = null;
    try {
      await call(`/files/${file.id}`, { method: "PUT", json: next });
      await refresh();
      report(file.id, "ok");
    } catch {
      report(file.id, "invalid");
    }
  }

  // Berpindah file saat perubahan masih tertunda: kirim sekarang agar tidak hilang dan tombol Bayar tetap terkunci sampai tersimpan.
  useEffect(() => {
    report(file.id, "ok"); // dibuka ulang dari nilai server yang valid
    return () => {
      clearTimeout(timer.current);
      if (pending.current) {
        report(file.id, "saving");
        void save(pending.current);
      } else {
        report(file.id, "ok"); // perubahan tak valid dibuang, server masih memegang nilai valid terakhir
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  function change(patch: Partial<PrintOptions>) {
    const next = { ...o, ...patch };
    setO(next);
    onOpts(next);
    clearTimeout(timer.current);
    pending.current = null;
    if ("error" in priceFile(next, file.pages!, config)) {
      report(file.id, "invalid");
      return;
    }
    report(file.id, "saving");
    pending.current = next;
    timer.current = setTimeout(() => save(next), 350);
  }

  const seg = (on: boolean, label: string, click: () => void, disabled = false) => (
    <button className={on ? "on" : ""} disabled={disabled} onClick={click}>{label}</button>
  );

  return (
    <section className="k-card k-panel k-opts">
      <div className="k-panel-h"><h2>Pengaturan Cetak</h2>{!("error" in priced) && <b className="k-num k-fp">{formatRupiah(priced.total)}</b>}</div>
      <div className="k-og">
        <div><label>Warna</label><div className="k-seg">{seg(!o.color, "Hitam-putih", () => change({ color: false }))}{seg(o.color, "Warna", () => change({ color: true }), !colorOk)}</div></div>
        <div><label>Sisi kertas</label><div className="k-seg">{seg(!o.duplex, "1 sisi", () => change({ duplex: false }))}{seg(o.duplex, "Bolak-balik", () => change({ duplex: true }), !duplexOk)}</div></div>
        <div><label>Orientasi</label><div className="k-seg">{seg(o.orientation === "portrait", "Potret", () => change({ orientation: "portrait" }))}{seg(o.orientation === "landscape", "Lanskap", () => change({ orientation: "landscape" }))}</div></div>
        <div>
          <label>Salinan (maks {config.max_copies})</label>
          <div className="k-step-in">
            <button onClick={() => change({ copies: Math.max(1, o.copies - 1) })} disabled={o.copies <= 1}>−</button>
            <b className="k-num">{o.copies}</b>
            <button onClick={() => change({ copies: Math.min(config.max_copies, o.copies + 1) })} disabled={o.copies >= config.max_copies}>+</button>
          </div>
        </div>
      </div>
      <div><label>Halaman per lembar</label><div className="k-seg">{nups.map((n) => seg(o.nup === n, n === 1 ? "1 (normal)" : String(n), () => change({ nup: n })))}</div></div>
      <div>
        <label>Halaman yang dicetak (kosong = semua)</label>
        <input className="k-input" value={o.range} placeholder="Contoh: 1-3, 5, 8-10" onChange={(e) => change({ range: e.target.value })} />
      </div>
      {(!colorOk || !duplexOk) && <div className="k-hint">{!colorOk && "Cetak warna sedang tidak tersedia. "}{!duplexOk && "Bolak-balik sedang tidak tersedia."}</div>}
      {"error" in priced ? <div className="k-err">{priced.error}</div> : <div className="k-hint">{priced.sides} sisi × {formatRupiah(priced.unitPrice)} × {o.copies} salinan</div>}
    </section>
  );
}

/**
 * Layar bayar. Dua mode: QRIS langsung (qrString = isi QRIS, dipindai aplikasi e-wallet) atau halaman checkout
 * (qrString = URL, dipindai kamera HP lalu pengguna memilih metode bayar).
 */
export function PayScreen({
  qrString, amount, code, left, onCancel,
}: {
  qrString: string | null;
  amount: number;
  code: string;
  left: number;
  onCancel: () => void;
}) {
  const [img, setImg] = useState("");
  useEffect(() => {
    if (qrString) QRCode.toDataURL(qrString, { margin: 1, width: 720, errorCorrectionLevel: "M" }).then(setImg);
  }, [qrString]);
  const mock = qrString?.startsWith("MOCKQRIS");
  const checkout = !!qrString && /^https?:\/\//.test(qrString);
  return (
    <main className="k-main">
      <div className="k-center wide">
        <h1 className="k-title pay">{checkout ? <>Scan untuk <em>memilih metode bayar</em></> : <>Scan <em>QRIS</em> untuk membayar</>}</h1>
        <div className="k-payrow">
          <div className="k-qrwrap">{img ? <img className="k-qr" src={img} alt={checkout ? "Scan untuk membayar" : "QRIS pembayaran"} /> : <div className="k-qr-ph">Menyiapkan pembayaran...</div>}</div>
          <div className="k-payinfo">
            <div className="k-card md k-total"><small>Total bayar</small><b className="k-num">{formatRupiah(amount)}</b></div>
            <div className={`k-timer small k-num${left < 60 ? " low" : ""}`}>{fmtTime(left)}</div>
            {checkout ? (
              <ol className="k-paysteps">
                <li>Scan QR ini dengan <b>kamera HP</b>, atau tekan <b>Pilih metode pembayaran</b> di halaman HP Anda</li>
                <li>Pilih metode: transfer VA bank, e-wallet, QRIS, atau kartu</li>
                <li>Setelah berhasil, mesin langsung mencetak. Nota bisa diunduh di HP.</li>
              </ol>
            ) : (
              <ol className="k-paysteps">
                <li>Buka GoPay, OVO, Dana, ShopeePay, atau m-banking di HP Anda</li>
                <li>Pilih <b>Scan / Bayar</b>, arahkan ke QR di layar ini</li>
                <li>Setelah berhasil, mesin langsung mencetak. Nota bisa diunduh di HP.</li>
              </ol>
            )}
          </div>
        </div>
        <div className="k-hint">Kode transaksi: <b>{code}</b></div>
        {mock && (
          <button className="k-btn ghost" onClick={() => api("/api/dev/mock-pay", { method: "POST", json: { code } }).catch((e) => alert(e.message))}>Simulasi bayar (mode uji)</button>
        )}
        <button className="k-btn ghost" onClick={onCancel}>Batalkan pembayaran</button>
      </div>
    </main>
  );
}
