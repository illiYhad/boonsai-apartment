// ใช้ได้ทั้ง server และ client (ค่า NEXT_PUBLIC_* ถูกฝังตอน build)
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
/** มี Supabase env ครบ → อ่าน DB · ไม่มี → อ่าน seed ในโค้ด (lib/data/seed.ts) */
export const hasSupabaseEnv = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
export const PHOTO_BUCKET = "boonsai-photos";

const isProduction = process.env.NODE_ENV === "production";
/** production ไม่มี Supabase env และไม่ได้ตั้ง ALLOW_MOCK_IN_PRODUCTION=1 → หลังบ้าน/การบันทึกตอบ 503 (แพทเทิร์นเดียวกับ web-ks3) */
export const mockBlocked = isProduction && !hasSupabaseEnv && process.env.ALLOW_MOCK_IN_PRODUCTION !== "1";
export const BLOCKED_MESSAGE = "ระบบยังไม่ได้ตั้งค่าฐานข้อมูล — ติดต่อผู้ดูแล";
