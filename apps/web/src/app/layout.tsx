import type { Metadata, Viewport } from "next";
import "./globals.css";

const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const ogImage = { url: "/og.png", width: 1200, height: 630, alt: "PaperMate - Self-Print Kiosk" };
const title = "PaperMate - Self-Print Kiosk";
const description = "Cetak dokumen mandiri dari HP: scan QR, upload, bayar, langsung tercetak.";

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title,
  description,
  robots: { index: false },
  openGraph: { title, description, siteName: "PaperMate", locale: "id_ID", type: "website", images: [ogImage] },
  twitter: { card: "summary_large_image", title, description, images: [ogImage.url] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
