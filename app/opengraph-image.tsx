import { ImageResponse } from "next/og";

// OG ใช้ตัวอักษรล้วน ไม่ใช้รูปจากโปสเตอร์ (ใบ B1 ข้อ 5) · ภาษาอังกฤษเพื่อไม่ต้องฝังฟอนต์ไทยใน ImageResponse
export const alt = "Boonsai Apartment · Pet Friendly · near BTS Pu Chao, Samut Prakan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#3B2618", color: "#FBF3E6" }}>
        <div style={{ fontSize: 34, color: "#E9A45B", marginBottom: 24 }}>Pet Friendly</div>
        <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.1 }}>Boonsai Apartment</div>
        <div style={{ fontSize: 40, marginTop: 28, color: "#E8D3B6" }}>Near BTS Pu Chao · Samut Prakan</div>
        <div style={{ fontSize: 40, marginTop: 12, color: "#E8D3B6" }}>From 2,200 THB / month · LINE @371dkpvl</div>
      </div>
    ),
    size,
  );
}
