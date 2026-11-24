"use client";

import { useActionState } from "react";
import { submitInquiry } from "@/app/actions";
import { NAME_MAX, type InquiryState } from "@/lib/inquiry";

const input = "min-h-12 rounded-[14px] border-2 border-cb-border bg-white px-3.5 font-[inherit] text-cb-brown";

export function InquiryForm() {
  const [state, action, pending] = useActionState<InquiryState, FormData>(submitInquiry, null);

  return (
    <form action={action} className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5 rounded-[28px] bg-[#FFFAF2] p-6 text-cb-brown">
      <div className="font-display text-xl font-medium">ฝากเบอร์ไว้ แอดมินโทรกลับ</div>
      <label className="flex flex-col gap-1.5 text-sm">
        ชื่อเล่น
        <input name="guest_name" type="text" required maxLength={NAME_MAX} autoComplete="nickname" className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        เบอร์โทร
        <input name="phone" type="tel" required inputMode="tel" autoComplete="tel" placeholder="08x-xxx-xxxx" className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        วันที่สะดวกมาดู
        <input name="preferred_date" type="date" className={input} />
      </label>
      {/* กับดักบอท — คนจริงมองไม่เห็น */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          เว็บไซต์
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-2.5 text-sm">
        <input name="has_pet" type="checkbox" className="size-5" />
        มีสัตว์เลี้ยงมาด้วย
      </label>
      <label className="flex min-h-11 items-start gap-2.5 text-[13px] text-cb-muted">
        <input name="consent" type="checkbox" required className="mt-0.5 size-5 shrink-0" />
        ยินยอมให้ใช้ข้อมูลนี้เพื่อติดต่อนัดดูห้องเท่านั้น
      </label>
      <button type="submit" disabled={pending} className="min-h-13 cursor-pointer rounded-full border-0 bg-cb-brown text-base font-semibold text-cb-cream disabled:opacity-60">
        {pending ? "กำลังส่ง…" : "ส่งข้อมูล"}
      </button>
      {state && (
        <p role="status" className={`m-0 rounded-[10px] px-3 py-2 text-sm ${state.ok ? "bg-ok-bg text-ok-ink" : "bg-red-50 text-red-800"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
