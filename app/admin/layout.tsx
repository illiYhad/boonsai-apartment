import type { Metadata } from "next";
import { logout } from "@/app/login/actions";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata: Metadata = { title: "หลังบ้าน · บุญใสอพาร์ทเม้นท์", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream pb-16">
      <header className="sticky top-0 z-10 border-b border-line bg-white">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-3 px-4 py-2.5">
          <div className="font-head text-lg font-bold leading-tight">หลังบ้านบุญใส</div>
          <form action={logout}>
            <button type="submit" className="min-h-11 cursor-pointer rounded-[10px] border border-line-strong bg-white px-4 text-sm font-medium">
              ออกจากระบบ
            </button>
          </form>
        </div>
        <AdminNav />
      </header>
      {!hasSupabaseEnv && <div className="mx-auto mt-3 max-w-[760px] px-4"><p className="m-0 rounded-xl bg-pet px-4 py-2.5 text-sm text-pet-ink">โหมดทดสอบ — ยังไม่ได้ต่อฐานข้อมูล ข้อมูลเป็นตัวอย่าง และการกดบันทึกจะไม่เปลี่ยนอะไรจริง</p></div>}
      <main className="mx-auto flex max-w-[760px] flex-col gap-5 px-4 pt-4">{children}</main>
    </div>
  );
}
