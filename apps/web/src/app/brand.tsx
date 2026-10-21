import "./brand.css";

/** Logo PaperMate: ubin biru dengan dokumen, centang, dan baki cetak. Dipakai juga sebagai ikon tab (app/icon.svg). */
export function LogoMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`pm-mark ${className}`} width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="PaperMate">
      <defs>
        <linearGradient id="pm-bg" x1="8" y1="0" x2="88" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f5fe6" />
          <stop offset="1" stopColor="#1a3aa6" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="24" fill="url(#pm-bg)" />
      <rect x="18" y="15" width="38" height="48" rx="6" fill="#6b97ff" opacity=".9" transform="rotate(-8 37 39)" />
      <path d="M33 17h25l14 14v38a5 5 0 0 1-5 5H33a5 5 0 0 1-5-5V22a5 5 0 0 1 5-5z" fill="#fff" />
      <path d="M58 17v9a5 5 0 0 0 5 5h9z" fill="#cddcff" />
      <rect x="35" y="29" width="14" height="3.2" rx="1.6" fill="#2f66f0" />
      <rect x="35" y="36" width="30" height="2.4" rx="1.2" fill="#c4cde0" />
      <rect x="35" y="41.5" width="25" height="2.4" rx="1.2" fill="#c4cde0" />
      <rect x="35" y="47" width="30" height="2.4" rx="1.2" fill="#c4cde0" />
      <rect x="35" y="54" width="30" height="13" rx="3.5" fill="#eef3ff" stroke="#cfd9f0" />
      <circle cx="42" cy="60.5" r="3.7" fill="#1f8bff" />
      <path d="M40.1 60.6l1.4 1.4 2.5-2.7" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="48" y="59.4" width="12" height="2.3" rx="1.15" fill="#1f5fe0" />
      <rect x="24" y="82" width="48" height="7" rx="3.5" fill="#11307f" />
      <rect x="32" y="84.4" width="32" height="2.2" rx="1.1" fill="#35c8ff" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`pm-word ${className}`}>Paper<em>Mate</em></span>;
}

/**
 * Logo lengkap: ikon + nama + pil tagline.
 * `dot` menampilkan titik status hijau dan `chip` lencana kemampuan (logo alternatif, dipakai di layar kiosk).
 */
export function Brand({
  size = 40, tagline = "Self-Print Kiosk", dot = false, chip, className = "",
}: {
  size?: number;
  tagline?: string | false;
  dot?: boolean;
  chip?: string;
  className?: string;
}) {
  return (
    <div className={`pm-brand ${className}`} style={{ ["--pm-size" as string]: `${size}px` }}>
      <LogoMark size={size} />
      <div className="pm-text">
        <Wordmark />
        {tagline && <span className="pm-tag">{dot && <i className="pm-dot" />}{tagline}</span>}
      </div>
      {chip && (
        <span className="pm-chip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 7h13l-4-4M17 17H4l4 4" /></svg>
          {chip}
        </span>
      )}
    </div>
  );
}
