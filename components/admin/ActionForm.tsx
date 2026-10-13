"use client";

import { useActionState } from "react";
import type { AdminResult } from "@/lib/admin";

/** ฟอร์มหลังบ้านทั่วไป: ส่ง Server Action แล้วโชว์ผลใต้ฟอร์ม (หน้าไม่เด้งกลับขึ้นบน) */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnOk = false,
}: {
  action: (prev: AdminResult, form: FormData) => Promise<AdminResult>;
  children: React.ReactNode;
  className?: string;
  resetOnOk?: boolean;
}) {
  const [state, formAction, pending] = useActionState<AdminResult, FormData>(async (prev, form) => {
    const res = await action(prev, form);
    if (resetOnOk && res?.ok) (document.activeElement as HTMLElement | null)?.closest("form")?.reset();
    return res;
  }, null);
  return (
    <form action={formAction} className={className} aria-busy={pending}>
      <fieldset disabled={pending} className="m-0 contents border-0 p-0">
        {children}
      </fieldset>
      {state && (
        <p role="status" className={`m-0 mt-2 col-span-full w-full text-sm font-medium ${state.ok ? "text-ok-ink" : "text-[#A32020]"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
