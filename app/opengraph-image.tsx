import { ImageResponse } from "next/og";

// OG ใช้ตัวอักษรล้วน ไม่ใช้รูปจากโปสเตอร์ (ใบ B1 ข้อ 5) · ภาษาอังกฤษเพื่อไม่ต้องฝังฟอนต์ไทยใน ImageResponse
export const alt = "Boonsai Apartment · Pet Friendly · near BTS Pu Chao, Samut Prakan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0E5A4C", color: "#FFFFFF" }}>
        <div style={{ fontSize: 34, color: "#FCEBD2", marginBottom: 24 }}>Pet Friendly</div>
        <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.1 }}>Boonsai Apartment</div>
        <div style={{ fontSize: 40, marginTop: 28, color: "#DCEDE8" }}>Near BTS Pu Chao · Samut Prakan</div>
        <div style={{ fontSize: 40, marginTop: 12, color: "#DCEDE8" }}>From 2,200 THB / month · LINE @371dkpvl</div>
      </div>
    ),
    size,
  );
}
