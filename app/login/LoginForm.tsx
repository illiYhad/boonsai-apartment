"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const input = "min-h-12 rounded-[10px] border border-line-strong bg-white px-3 text-base font-[inherit]";

export function LoginForm({ next, mock }: { next: string; mock: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        อีเมล
        <input name="email" type="email" required={!mock} autoComplete="username" className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        รหัสผ่าน
        <input name="password" type="password" required={!mock} autoComplete="current-password" className={input} />
      </label>
      {state && (
        <p role="alert" className="m-0 text-sm font-medium text-[#A32020]">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-12 cursor-pointer rounded-[12px] border-0 bg-accent text-[17px] font-semibold text-white disabled:opacity-60">
        {pending ? "กำลังเข้าสู่ระบบ…" : mock ? "เข้าหลังบ้าน (โหมดทดสอบ)" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
