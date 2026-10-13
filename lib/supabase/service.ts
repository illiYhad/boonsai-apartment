import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

// ⚠ ฝั่ง server เท่านั้น — ใช้เฉพาะบันทึก inquiries จาก Server Action หลังตรวจรูปแบบ + rate limit แล้ว (anon ไม่มี policy insert)
export function createServiceSupabase(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
