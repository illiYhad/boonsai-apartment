"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { BLOCKED_MESSAGE, hasSupabaseEnv, mockBlocked } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/service";
import { RATE_LIMIT, RATE_WINDOW_MS, takeRateSlot, validateInquiry, type InquiryState } from "@/lib/inquiry";

const RATE_MESSAGE = "ส่งข้อมูลบ่อยเกินไป กรุณาลองใหม่ในอีก 1 ชั่วโมง หรือทัก LINE @371dkpvl";

async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  // เก็บแค่แฮช ไม่เก็บ IP ดิบ (PDPA)
  return createHash("sha256").update(`boonsai:${ip}`).digest("hex").slice(0, 32);
}

/** ฟอร์มฝากเบอร์ (นัดดูห้อง) — anon insert ไม่ได้ตาม RLS → บันทึกผ่าน service role ที่นี่เท่านั้น */
export async function submitInquiry(_prev: InquiryState, form: FormData): Promise<InquiryState> {
  // กับดักบอท: ช่องซ่อนที่คนจริงไม่เห็น ถ้ามีค่า → ตอบเหมือนสำเร็จแต่ไม่บันทึก
  if (String(form.get("website") ?? "") !== "") return { ok: true, message: "ส่งข้อมูลแล้ว แอดมินจะโทรกลับ" };

  if (mockBlocked) return { ok: false, message: BLOCKED_MESSAGE };

  const parsed = validateInquiry(form);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const ipHash = await clientIpHash();
  if (!takeRateSlot(ipHash)) return { ok: false, message: RATE_MESSAGE };

  if (!hasSupabaseEnv) return { ok: true, testMode: true, message: "ส่งสำเร็จ (โหมดทดสอบ) — ยังไม่ได้บันทึกจริง" };

  const sb = createServiceSupabase();
  if (!sb) return { ok: false, message: BLOCKED_MESSAGE };

  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count, error: countErr } = await sb.from("inquiries").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
  if (countErr) return { ok: false, message: "ส่งไม่สำเร็จ กรุณาทัก LINE @371dkpvl" };
  if ((count ?? 0) >= RATE_LIMIT) return { ok: false, message: RATE_MESSAGE };

  const { error } = await sb.from("inquiries").insert({ ...parsed.value, ip_hash: ipHash, consent_at: new Date().toISOString() });
  if (error) return { ok: false, message: "ส่งไม่สำเร็จ กรุณาทัก LINE @371dkpvl" };
  return { ok: true, message: "ส่งข้อมูลแล้ว แอดมินจะโทรกลับ" };
}
