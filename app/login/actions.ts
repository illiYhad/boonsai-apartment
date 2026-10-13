"use server";

import { redirect } from "next/navigation";
import { BLOCKED_MESSAGE, hasSupabaseEnv, mockBlocked } from "@/lib/supabase/env";
import { createServerSupabase } from "@/lib/supabase/server";

export type LoginState = { message: string } | null;

/** กันเด้งออกนอกเว็บ: รับเฉพาะ path ภายใน /admin */
function safeNext(raw: string): string {
  return raw.startsWith("/admin") && !raw.startsWith("//") ? raw : "/admin/rooms";
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (mockBlocked) return { message: BLOCKED_MESSAGE };
  const next = safeNext(String(form.get("next") ?? ""));
  if (!hasSupabaseEnv) redirect(next); // โหมดทดสอบบนเครื่อง dev: ไม่มีฐานข้อมูลให้ล็อกอิน
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { message: "กรอกอีเมลและรหัสผ่าน" };

  const sb = await createServerSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  const { data: isAdmin } = await sb.rpc("is_admin");
  if (isAdmin !== true) {
    await sb.auth.signOut();
    return { message: "บัญชีนี้ไม่มีสิทธิ์แอดมิน" };
  }
  redirect(next);
}

export async function logout() {
  if (hasSupabaseEnv && !mockBlocked) {
    const sb = await createServerSupabase();
    await sb.auth.signOut();
  }
  redirect("/login");
}
