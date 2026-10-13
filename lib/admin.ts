import type { SupabaseClient } from "@supabase/supabase-js";
import { BLOCKED_MESSAGE, hasSupabaseEnv, mockBlocked } from "@/lib/supabase/env";
import { createServerSupabase } from "@/lib/supabase/server";

export type AdminResult = { ok: boolean; message: string } | null;

export type AdminCtx =
  | { kind: "ok"; sb: SupabaseClient }
  | { kind: "mock" } // ไม่มี Supabase env (เครื่อง dev) → โหมดทดสอบ ไม่บันทึกจริง
  | { kind: "blocked" } // production ไม่มี env → 503
  | { kind: "denied" }; // ยังไม่ล็อกอิน หรือไม่ใช่แอดมิน

/** ด่านสิทธิ์ของทุกหน้า/ทุก Server Action ในหลังบ้าน: ล็อกอินแล้ว + is_admin() เป็นจริง (RLS ฝั่ง DB เป็นด่านสุดท้ายอีกชั้น) */
export async function adminCtx(): Promise<AdminCtx> {
  if (mockBlocked) return { kind: "blocked" };
  if (!hasSupabaseEnv) return { kind: "mock" };
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { kind: "denied" };
  const { data: isAdmin } = await sb.rpc("is_admin");
  if (isAdmin !== true) return { kind: "denied" };
  return { kind: "ok", sb };
}

export const MOCK_MESSAGE = "โหมดทดสอบ — ยังไม่ได้บันทึกจริง (ยังไม่ได้ต่อฐานข้อมูล)";

/** ใช้ต้นทุก Server Action: ได้ client ของแอดมิน หรือผลลัพธ์ที่ต้องคืนผู้ใช้ทันที */
export async function guard(): Promise<{ sb: SupabaseClient } | { result: NonNullable<AdminResult> }> {
  const ctx = await adminCtx();
  if (ctx.kind === "ok") return { sb: ctx.sb };
  if (ctx.kind === "mock") return { result: { ok: true, message: MOCK_MESSAGE } };
  if (ctx.kind === "blocked") return { result: { ok: false, message: BLOCKED_MESSAGE } };
  return { result: { ok: false, message: "หมดเวลาล็อกอิน กรุณาเข้าสู่ระบบใหม่" } };
}
