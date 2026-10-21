"use client";
import { useEffect, useState } from "react";

type Ad = { src: string; alt?: string; seconds?: number };

const isVideo = (src: string) => /\.(mp4|webm)$/i.test(src);

/**
 * Slot sponsor di layar idle. Daftar iklan dibaca dari /ads/ads.json (lihat public/ads/README.txt);
 * bila kosong atau gagal dimuat, tampil kartu "Ruang Sponsor" agar tata letak tidak bergeser.
 */
export default function AdSlot({ whatsapp }: { whatsapp: string | null }) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [i, setI] = useState(0);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/ads/ads.json", { cache: "no-store" });
        const json = await res.json();
        if (!stop && Array.isArray(json)) setAds(json.filter((a) => a && typeof a.src === "string"));
      } catch {
        /* biarkan daftar terakhir */
      }
    };
    load();
    const t = setInterval(load, 120_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const ad = ads.length ? ads[i % ads.length] : null;
  useEffect(() => {
    if (ads.length < 2) return;
    const t = setTimeout(() => setI((n) => (n + 1) % ads.length), Math.max(3, ad?.seconds ?? 10) * 1000);
    return () => clearTimeout(t);
  }, [ads.length, i, ad?.seconds]);

  if (!ad) {
    return (
      <section className="k-card k-ad empty">
        <span className="k-ad-tag">Sponsor</span>
        <b>Ruang Sponsor</b>
        <p>Pasang iklan bisnis Anda di layar ini{whatsapp ? <> — hubungi <span className="k-num">+{whatsapp}</span></> : ""}.</p>
      </section>
    );
  }
  return (
    <section className="k-card k-ad">
      <span className="k-ad-tag">Iklan</span>
      {isVideo(ad.src) ? (
        <video key={ad.src} src={ad.src} autoPlay muted loop playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={ad.src} src={ad.src} alt={ad.alt ?? "Iklan sponsor"} />
      )}
    </section>
  );
}
