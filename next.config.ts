import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // อัปโหลดรูปจากหน้า /admin/photos (ไฟล์ ≤ 5MB + ส่วนเกิน multipart) — ค่าเริ่มต้น 1MB ไม่พอ
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

export default nextConfig;
