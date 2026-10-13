import type { Metadata } from "next";
import { BLOCKED_MESSAGE, hasSupabaseEnv, mockBlocked } from "@/lib/supabase/env";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "เข้าสู่ระบบแอดมิน · บุญใสอพาร์ทเม้นท์", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string }> }) {
  const { next = "", denied } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-accent font-head text-xl font-bold text-white">บ</div>
        <div>
          <h1 className="m-0 font-head text-xl font-bold leading-tight">หลังบ้านแอดมิน</h1>
          <div className="text-[13px] text-subtle">บุญใสอพาร์ทเม้นท์</div>
        </div>
      </div>
      {denied && <p className="m-0 rounded-xl bg-pet px-4 py-3 text-sm text-pet-ink">บัญชีนี้ไม่มีสิทธิ์แอดมิน — ล็อกอินด้วยบัญชีแอดมิน</p>}
      {mockBlocked ? (
        <p className="m-0 rounded-xl bg-white p-5">{BLOCKED_MESSAGE}</p>
      ) : (
        <div className="rounded-[20px] bg-white p-6">
          {!hasSupabaseEnv && <p className="mt-0 mb-4 rounded-lg bg-[#EEF1F0] px-3 py-2 text-sm text-[#2F3B38]">โหมดทดสอบ: ยังไม่ได้ต่อฐานข้อมูล กดเข้าได้เลย (ไม่บันทึกจริง)</p>}
          <LoginForm next={next} mock={!hasSupabaseEnv} />
        </div>
      )}
    </main>
  );
}
