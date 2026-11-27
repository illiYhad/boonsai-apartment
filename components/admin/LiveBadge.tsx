"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { LiveTable } from "@/lib/dashboard-data";
import { hasSupabaseEnv, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

const POLL_MS = 60_000;

/**
 * ป้ายสถานะ "สด" + ตัวดึงข้อมูลใหม่ · Realtime ใช้ session ของแอดมิน จึงผ่าน RLS is_admin() · ใช้เหตุการณ์เป็นแค่สัญญาณให้ดึงใหม่ ไม่อ่านเนื้อแถว
 * ขึ้น "สด" เมื่อ Supabase ยืนยันว่ารับฟังครบทุกตารางแล้วเท่านั้น · ไม่ครบหรือหลุด = "ไม่สด" และดึงใหม่ทุก 60 วิ
 */
export function LiveBadge({ tables, loadedAt }: { tables: LiveTable[]; loadedAt: string }) {
  const router = useRouter();
  const [pending, startRefresh] = useTransition();
  const [live, setLive] = useState(false);
  const key = tables.join(",");

  useEffect(() => {
    if (!hasSupabaseEnv || !key) return;
    const sb = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const names = key.split(",");
    const ready = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400); // รวมหลายเหตุการณ์ที่มาพร้อมกันเป็นการดึงครั้งเดียว
    };
    const mark = (name: string, ok: boolean) => {
      if (ok) ready.add(name);
      else ready.delete(name);
      setLive(ready.size === names.length && navigator.onLine);
    };
    // แยกช่องละตาราง: ตารางหนึ่งยังไม่เปิด Realtime จะไม่ทำให้ตารางอื่นหยุดตาม
    const channels = names.map((name) =>
      sb
        .channel(`dashboard-${name}`)
        .on("postgres_changes", { event: "*", schema: "public", table: name }, refresh)
        .on("system", {}, (msg: { extension?: string; status?: string }) => {
          if (msg.extension !== "postgres_changes") return;
          const ok = msg.status === "ok";
          mark(name, ok);
          if (ok) refresh(); // เผื่อมีการเปลี่ยนระหว่างที่ยังไม่ได้ฟัง
        })
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") mark(name, false);
        }),
    );
    const offline = () => setLive(false);
    const online = () => {
      setLive(ready.size === names.length);
      refresh();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      for (const c of channels) void sb.removeChannel(c);
    };
  }, [key, router]);

  useEffect(() => {
    if (live) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [live, router]);

  const time = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(loadedAt));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span role="status" className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${live ? "bg-ok-bg text-ok-ink" : "bg-pet text-pet-ink"}`}>
        <span aria-hidden="true" className={`size-2 rounded-full ${live ? "bg-ok-ink" : "bg-pet-ink"}`} />
        {live ? "สด · อัปเดตเอง" : "ไม่สด · ดึงใหม่ทุก 60 วิ"}
      </span>
      <button type="button" disabled={pending} onClick={() => startRefresh(() => router.refresh())} className="min-h-11 cursor-pointer rounded-xl border border-line-strong bg-white px-4 text-sm font-semibold text-ink disabled:opacity-60">
        รีเฟรช
      </button>
      <span className="text-sm text-muted tabular-nums">ล่าสุด {time} น.</span>
    </div>
  );
}
