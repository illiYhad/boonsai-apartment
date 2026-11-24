import type { Metadata, Viewport } from "next";
import { Anuphan, IBM_Plex_Sans_Thai, Mitr } from "next/font/google";
import "./globals.css";

const anuphan = Anuphan({ subsets: ["thai", "latin"], weight: ["500", "600", "700"], variable: "--font-anuphan", display: "swap" });
const mitr = Mitr({ subsets: ["thai", "latin"], weight: ["400", "500", "600"], variable: "--font-mitr", display: "swap" });
const plex = IBM_Plex_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

const TITLE = "บุญใสอพาร์ทเม้นท์ · ห้องพักใกล้ BTS ปู่เจ้า เลี้ยงสัตว์ได้ สมุทรปราการ";
const DESCRIPTION =
  "ห้องพักรายเดือนใกล้ BTS ปู่เจ้าและอิมพีเรียลเวิลด์ สำโรง สมุทรปราการ เลี้ยงสัตว์ได้ (Pet Friendly) เริ่มต้น 2,200 บาท/เดือน กล้องวงจรปิด 24 ชม. คีย์การ์ด ที่จอดรถ ทัก LINE @371dkpvl";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://boonsai.balehmstudio.com"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, locale: "th_TH", type: "website", siteName: "บุญใสอพาร์ทเม้นท์" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = { themeColor: "#3B2618" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${anuphan.variable} ${mitr.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
