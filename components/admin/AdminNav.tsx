"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/rooms", label: "ห้อง" },
  { href: "/admin/prices", label: "ราคา" },
  { href: "/admin/inquiries", label: "ฝากเบอร์" },
  { href: "/admin/photos", label: "รูป" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="mx-auto grid max-w-[760px] grid-cols-4 px-2" aria-label="เมนูหลังบ้าน">
      {TABS.map((t) => {
        const active = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 items-center justify-center border-b-[3px] text-[15px] font-semibold no-underline ${active ? "border-accent text-accent" : "border-transparent text-muted"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
