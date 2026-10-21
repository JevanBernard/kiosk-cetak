import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = decodeURIComponent(params.code).toUpperCase();
  const title = `Struk PaperMate ${code}`;
  const description = "Lihat status dan struk transaksi cetak mandiri di PaperMate.";
  return { title, description, openGraph: { title, description, type: "website", siteName: "PaperMate", images: [{ url: "/og.png", width: 1200, height: 630, alt: "PaperMate - Self-Print Kiosk" }] }, twitter: { card: "summary_large_image", title, description, images: ["/og.png"] } };
}

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
