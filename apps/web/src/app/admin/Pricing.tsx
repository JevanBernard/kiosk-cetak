"use client";
import { useState } from "react";
import { formatRupiah } from "@kioskcetak/shared";
import { api } from "@/lib/client";
import { A, AIcon, PageHead, availLabel, availTone, type Machine, type Overview } from "./ui";

type Toast = (text: string, bad?: boolean) => void;

export default function Pricing({ ov, reload, toast }: { ov: Overview; reload: () => void; toast: Toast }) {
  const [sel, setSel] = useState(ov.machines[0]?.id ?? "");
  const m = ov.machines.find((x) => x.id === sel) ?? ov.machines[0];
  return (
    <>
      <PageHead
        kicker="Pengaturan Mesin / Tarif & Hardware"
        title="Pengaturan Harga & Konfigurasi Mesin"
        sub="Atur 4 kombinasi tarif per sisi, aturan pembulatan, batas salinan, dan ambang peringatan bahan habis pakai. Perubahan tidak memengaruhi order yang sudah menampilkan QRIS."
      />
      {ov.machines.length > 1 && (
        <div className="a-card sm" style={{ flexDirection: "row", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div className="a-tile-ico" style={{ background: "var(--a-primary-fixed)", color: "var(--a-primary)" }}><AIcon d={A.store} size={22} /></div>
          <div className="a-field" style={{ flex: 1, minWidth: "14rem" }}>
            <label>Cakupan Konfigurasi</label>
            <select className="a-in" value={m?.id} onChange={(e) => setSel(e.target.value)}>
              {ov.machines.map((x) => <option key={x.id} value={x.id}>{x.code ? `#${x.code} · ` : ""}{x.name}{x.location ? ` — ${x.location}` : ""}</option>)}
            </select>
          </div>
          {m && <span className={`a-badge ${availTone(m.availability.state)}`}>{availLabel(m.availability.state)}</span>}
        </div>
      )}
      {m ? <Form key={m.id} m={m} reload={reload} toast={toast} /> : <div className="a-card"><div className="a-empty">Belum ada mesin. Tambahkan mesin di menu Dashboard.</div></div>}
    </>
  );
}

const NUM = (k: string) => k;

function Form({ m, reload, toast }: { m: Machine; reload: () => void; toast: Toast }) {
  const [v, setV] = useState<Record<string, any>>({ ...m.settings, name: m.name, code: m.code ?? "", location: m.location ?? "" });
  const [disc, setDisc] = useState(() => {
    const s = m.settings;
    return s && s.price_bw_single > 0 ? Math.max(0, Math.min(25, Math.round((1 - s.price_bw_duplex / s.price_bw_single) * 100))) : 10;
  });
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState({ pages: 40, copies: 2, color: false, duplex: true });
  const set = (k: string, val: any) => setV((x) => ({ ...x, [k]: val }));
  const num = (k: string) => Number(v[k]) || 0;
  const pct = (single: number, duplex: number) => (single > 0 ? Math.round((1 - duplex / single) * 100) : 0);

  const applyDiscount = () => {
    setV((x) => ({
      ...x,
      price_bw_duplex: Math.round(Number(x.price_bw_single) * (1 - disc / 100)),
      price_color_duplex: Math.round(Number(x.price_color_single) * (1 - disc / 100)),
    }));
    toast(`Tarif bolak-balik dihitung dengan diskon ${disc}%. Klik Simpan untuk menerapkan.`);
  };

  const save = async () => {
    setBusy(true);
    try {
      const { machine_id, ...rest } = v;
      const patch: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(rest)) if (val !== "" && val !== undefined) patch[k] = val;
      await api(`/api/admin/machines/${m.id}`, { method: "PATCH", json: patch });
      toast("Pengaturan disimpan. Harga baru berlaku untuk order berikutnya.");
      reload();
    } catch (e: any) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  const tiles: { key: string; title: string; sub: string; icon: string; color: boolean; duplex: boolean; single: string }[] = [
    { key: "price_bw_single", title: "Hitam Putih — 1 Sisi", sub: "Simplex (monokrom standar)", icon: A.file, color: false, duplex: false, single: "" },
    { key: "price_bw_duplex", title: "Hitam Putih — Bolak-Balik", sub: "Duplex (hemat kertas)", icon: A.duplex, color: false, duplex: true, single: "price_bw_single" },
    { key: "price_color_single", title: "Warna Penuh — 1 Sisi", sub: "Simplex (CMYK)", icon: A.ink, color: true, duplex: false, single: "" },
    { key: "price_color_duplex", title: "Warna Penuh — Bolak-Balik", sub: "Duplex (CMYK 2 sisi)", icon: A.ink, color: true, duplex: true, single: "price_color_single" },
  ];

  // Simulasi: sisi = halaman (N-up diabaikan); tarif sesuai pilihan; total dibulatkan ke atas sesuai aturan pembulatan.
  const unit = num(sim.color ? (sim.duplex ? "price_color_duplex" : "price_color_single") : sim.duplex ? "price_bw_duplex" : "price_bw_single");
  const raw = Math.max(0, sim.pages) * unit * Math.max(1, sim.copies);
  const step = num("rounding") || 100;
  const total = Math.ceil(raw / step) * step;
  const noDisc = Math.max(0, sim.pages) * num(sim.color ? "price_color_single" : "price_bw_single") * Math.max(1, sim.copies);

  return (
    <>
      <section className="a-card md">
        <h2 className="a-h2"><AIcon d={A.store} size={22} />Identitas Mesin</h2>
        <div className="a-g3">
          <div className="a-field"><label>Nama mesin</label><input className="a-in" value={v.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="a-field"><label>Kode mesin (unik, mis. 001)</label><input className="a-in a-mono" value={v.code} maxLength={8} onChange={(e) => set("code", e.target.value)} /></div>
          <div className="a-field"><label>Lokasi (tampil di layar kiosk)</label><input className="a-in" value={v.location} placeholder="Perpustakaan Pusat Lt. 1" onChange={(e) => set("location", e.target.value)} /></div>
        </div>
      </section>

      <div className="a-split">
        <section className="a-card md a-c8">
          <div className="a-row">
            <div><h2 className="a-h2">Matriks 4 Kombinasi Tarif Per Sisi</h2><p className="a-sub">Harga dihitung per sisi kertas (simplex vs duplex).</p></div>
            <span className="a-badge ok" style={{ fontSize: 12, padding: "4px 12px" }}><AIcon d={A.eco} size={14} />Diskon duplex: {pct(num("price_bw_single"), num("price_bw_duplex"))}%</span>
          </div>
          <div className="a-g2">
            {tiles.map((t) => {
              const d = t.single ? pct(num(t.single), num(t.key)) : 0;
              const active = t.color ? !!v.allow_color : t.duplex ? !!v.allow_duplex : true;
              return (
                <div key={t.key} className="a-tile">
                  <div className="a-tile-h">
                    <div className="l">
                      <div className={`a-tile-ico${t.color ? " c" : ""}`}><AIcon d={t.icon} size={20} /></div>
                      <div><h3 className="a-lab">{t.title}</h3><span className="a-sub">{t.sub}</span></div>
                    </div>
                    {t.duplex ? <span className={`a-badge ${d > 0 ? "ok" : "mute"}`}>{d > 0 ? `Hemat ${d}%` : "Tarif sama"}</span> : <span className={`a-badge ${active ? "pri" : "mute"}`}>{active ? "Aktif" : "Nonaktif"}</span>}
                  </div>
                  <div className="a-field">
                    <label>Tarif jual per sisi</label>
                    <div className="a-price"><span>Rp</span><input type="number" inputMode="numeric" min={0} value={v[t.key] ?? ""} onChange={(e) => set(t.key, e.target.value === "" ? "" : Number(e.target.value))} /><span>/ sisi</span></div>
                  </div>
                  {t.color && (
                    <div className="a-tog">
                      <div><div className="a-lab" style={{ fontSize: 12 }}>Buka Opsi Warna</div><span className="a-sub">Matikan jika tinta warna kritis</span></div>
                      <label className="a-sw"><input type="checkbox" checked={!!v.allow_color} onChange={(e) => set("allow_color", e.target.checked)} /><i /></label>
                    </div>
                  )}
                  {t.duplex && !t.color && (
                    <div className="a-tog">
                      <div><div className="a-lab" style={{ fontSize: 12 }}>Buka Opsi Bolak-Balik</div><span className="a-sub">Berlaku untuk hitam-putih dan warna</span></div>
                      <label className="a-sw"><input type="checkbox" checked={!!v.allow_duplex} onChange={(e) => set("allow_duplex", e.target.checked)} /><i /></label>
                    </div>
                  )}
                  {!t.color && !t.duplex && <div className="a-sub">Tarif dasar. Tidak dapat dinonaktifkan.</div>}
                  {t.color && t.duplex && <div className="a-sub">Mengikuti pengaturan Warna dan Bolak-Balik.</div>}
                </div>
              );
            })}
          </div>

          <div className="a-box" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div className="a-gap" style={{ flexWrap: "nowrap" }}>
              <AIcon d={A.eco} size={24} />
              <div><div className="a-lab" style={{ fontSize: 12 }}>Hitung tarif bolak-balik otomatis</div><span className="a-sub">Isi tarif duplex dari tarif 1 sisi dikurangi diskon.</span></div>
            </div>
            <div className="a-gap">
              <input type="range" min={0} max={25} value={disc} onChange={(e) => setDisc(Number(e.target.value))} style={{ width: "9rem", accentColor: "var(--a-primary-c)" }} />
              <span className="a-badge pri a-num" style={{ minWidth: "3rem", justifyContent: "center", fontSize: 12 }}>{disc}%</span>
              <button className="a-btn sm" onClick={applyDiscount}>Terapkan</button>
            </div>
          </div>
        </section>

        <aside className="a-card md a-c4">
          <div className="a-row"><h2 className="a-h2"><AIcon d={A.chart} size={22} />Simulasi Harga</h2><span className="a-badge info">Interaktif</span></div>
          <p className="a-sub">Uji dampak tarif saat ini pada contoh dokumen sebelum disimpan.</p>
          <div className="a-g2" style={{ gap: ".5rem" }}>
            <div className="a-field"><label>Halaman</label><input className="a-in" type="number" min={1} value={sim.pages} onChange={(e) => setSim({ ...sim, pages: Number(e.target.value) })} /></div>
            <div className="a-field"><label>Salinan</label><input className="a-in" type="number" min={1} value={sim.copies} onChange={(e) => setSim({ ...sim, copies: Number(e.target.value) })} /></div>
          </div>
          <div className="a-seg solid">
            <button className={!sim.color ? "on" : ""} onClick={() => setSim({ ...sim, color: false })}>Hitam-putih</button>
            <button className={sim.color ? "on" : ""} onClick={() => setSim({ ...sim, color: true })}>Warna</button>
          </div>
          <div className="a-seg solid">
            <button className={!sim.duplex ? "on" : ""} onClick={() => setSim({ ...sim, duplex: false })}>1 sisi</button>
            <button className={sim.duplex ? "on" : ""} onClick={() => setSim({ ...sim, duplex: true })}>Bolak-balik</button>
          </div>
          <div className="a-box">
            <div className="a-row"><span className="a-sub">Sisi cetak × salinan</span><b className="a-num">{sim.pages} × {sim.copies}</b></div>
            <div className="a-row"><span className="a-sub">Tarif per sisi</span><b className="a-num">{formatRupiah(unit)}</b></div>
            {sim.duplex && noDisc > raw && <div className="a-row"><span className="a-sub">Tanpa diskon duplex</span><b className="a-num" style={{ textDecoration: "line-through", color: "var(--a-outline)" }}>{formatRupiah(noDisc)}</b></div>}
            <div className="a-row"><span className="a-sub">Pembulatan ke Rp {step}</span><b className="a-num">{formatRupiah(total - raw)}</b></div>
            <div className="a-row" style={{ paddingTop: 8 }}><span className="a-lab">Total dibayar pengguna</span><b className="a-h2 a-num" style={{ color: "var(--a-primary)" }}>{formatRupiah(total)}</b></div>
          </div>
          <span className="a-sub">Simulasi sederhana: satu sisi per halaman, N-up tidak diperhitungkan. Kerugian bahan tidak dihitung.</span>
        </aside>
      </div>

      <div className="a-g2" style={{ alignItems: "start" }}>
        <section className="a-card md">
          <h2 className="a-h2"><AIcon d={A.money} size={22} />Aturan Pembulatan & Order</h2>
          <div className="a-field">
            <label>Pembulatan total order</label>
            <div className="a-g2" style={{ gap: ".5rem" }}>
              {[100, 500].map((r) => (
                <label key={r} className="a-radio"><input type="radio" name="rounding" checked={Number(v.rounding) === r} onChange={() => set("rounding", r)} /><div><b>Bulatkan ke Rp {r}</b><span>{r === 100 ? "Rp 1.440 → Rp 1.500" : "Rp 1.150 → Rp 1.500"}</span></div></label>
              ))}
            </div>
          </div>
          <div className="a-g2" style={{ gap: ".75rem" }}>
            <div className="a-field"><label>Total minimal order (Rp)</label><input className="a-in" type="number" value={v.min_total ?? ""} onChange={(e) => set(NUM("min_total"), e.target.value === "" ? "" : Number(e.target.value))} /></div>
            <div className="a-field"><label>Maks salinan per file</label><input className="a-in" type="number" value={v.max_copies ?? ""} onChange={(e) => set("max_copies", e.target.value === "" ? "" : Number(e.target.value))} /></div>
          </div>
          <div className="a-tog a-box" style={{ flexDirection: "row" }}>
            <div><div className="a-lab" style={{ fontSize: 12 }}>Banyak halaman per lembar (N-up)</div><span className="a-sub">Izinkan 2, 4, 6 halaman dalam satu sisi kertas.</span></div>
            <label className="a-sw"><input type="checkbox" checked={!!v.allow_nup} onChange={(e) => set("allow_nup", e.target.checked)} /><i /></label>
          </div>
          <div className="a-field"><label>WhatsApp admin (628xxx) untuk tombol "Laporkan masalah"</label><input className="a-in a-mono" value={v.admin_whatsapp ?? ""} onChange={(e) => set("admin_whatsapp", e.target.value)} placeholder="6281234567890" /></div>
        </section>

        <section className="a-card md">
          <h2 className="a-h2"><AIcon d={A.shield} size={22} />Ambang Batas Bahan Habis Pakai</h2>
          <div className="a-box">
            <div className="a-g2" style={{ gap: ".75rem" }}>
              <div className="a-field"><label>Kapasitas kertas (lembar)</label><input className="a-in" type="number" value={v.paper_capacity ?? ""} onChange={(e) => set("paper_capacity", e.target.value === "" ? "" : Number(e.target.value))} /></div>
              <div className="a-field"><label>Peringatan kertas ≤ (lembar)</label><input className="a-in" type="number" value={v.paper_warn ?? ""} onChange={(e) => set("paper_warn", e.target.value === "" ? "" : Number(e.target.value))} /></div>
              <div className="a-field"><label>Sisi hitam-putih per isi ulang</label><input className="a-in" type="number" value={v.ink_bw_capacity ?? ""} onChange={(e) => set("ink_bw_capacity", e.target.value === "" ? "" : Number(e.target.value))} /></div>
              <div className="a-field"><label>Sisi warna per isi ulang</label><input className="a-in" type="number" value={v.ink_color_capacity ?? ""} onChange={(e) => set("ink_color_capacity", e.target.value === "" ? "" : Number(e.target.value))} /></div>
              <div className="a-field"><label>Peringatan tinta ≤ (%)</label><input className="a-in" type="number" value={v.ink_warn_pct ?? ""} onChange={(e) => set("ink_warn_pct", e.target.value === "" ? "" : Number(e.target.value))} /></div>
              <div className="a-field"><label>Alert jika offline &gt; (menit)</label><input className="a-in" type="number" value={v.offline_alert_minutes ?? ""} onChange={(e) => set("offline_alert_minutes", e.target.value === "" ? "" : Number(e.target.value))} /></div>
            </div>
          </div>
          <span className="a-sub">Estimasi tinta dihitung dari jumlah sisi tercetak sejak isi ulang terakhir, bukan dari sensor printer.</span>
        </section>
      </div>

      <div className="a-card md" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <span className="a-sub a-gap"><AIcon d={A.shield} size={16} />Setiap perubahan pengaturan dicatat di Log Sistem.</span>
        <button className="a-btn pri" disabled={busy} onClick={save}><AIcon d={A.check} size={16} />{busy ? "Menyimpan..." : "Simpan Semua Perubahan"}</button>
      </div>
    </>
  );
}
