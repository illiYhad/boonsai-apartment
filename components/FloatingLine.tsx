"use client";

import { useEffect, useState } from "react";

/** ปุ่ม LINE ลอยมุมขวาล่าง · ซ่อนตอนเลื่อนถึงส่วน "นัดดูห้อง" (#contact) เพื่อไม่บังฟอร์ม/ปุ่มส่งบนมือถือ */
export function FloatingLine({ href }: { href: string }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const target = document.getElementById("contact");
    if (!target) return;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting), { threshold: 0 });
    io.observe(target);
    return () => io.disconnect();
  }, []);
  return (
    <a
      href={href}
      aria-label="ทัก LINE @371dkpvl"
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : 0}
      className={`fixed right-4 bottom-4 z-20 inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-line-green px-5 font-semibold text-white no-underline shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-opacity hover:text-white ${hidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.3 9.3 9.3 0 0 1-3-.5L3 21l1.6-4.4A7.9 7.9 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
      </svg>
      ทัก LINE
    </a>
  );
}
