"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { guard, type AdminResult } from "@/lib/admin";
import { PHOTO_BUCKET } from "@/lib/supabase/env";

// ทุก action เริ่มด้วย guard() = ล็อกอิน + is_admin() (ไม่พึ่งแค่ proxy) แล้วเขียนผ่าน session ของแอดมิน → RLS ตรวจซ้ำที่ DB

const ok = (message: string): AdminResult => ({ ok: true, message });
const bad = (message: string): AdminResult => ({ ok: false, message });
const DB_FAIL = "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง";

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}
/** ว่าง → null · ไม่ใช่ตัวเลข/ติดลบ/ใหญ่เกิน → undefined */
function money(raw: string): number | null | undefined {
  if (raw === "") return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : undefined;
}
function refresh(...paths: string[]) {
  revalidatePath("/"); // หน้าสาธารณะ static (revalidate 60) → ให้เปลี่ยนทันที
  for (const p of paths) revalidatePath(p);
}

/* ---------- ห้อง ---------- */

export async function setRoomStatus(_p: AdminResult, form: FormData): Promise<AdminResult> {
  const g = await guard();
  if ("result" in g) return g.result;
  const status = str(form, "status");
  if (!["available", "occupied", "maintenance"].includes(status)) return bad("สถานะไม่ถูกต้อง");
  const { error } = await g.sb.from("rooms").update({ status }).eq("id", str(form, "id"));
  if (error) return bad(DB_FAIL);
  refresh("/admin/rooms");
  return ok("บันทึกแล้ว");
}

export async function updateRoom(_p: AdminResult, form: FormData): Promise<AdminResult> {
  const g = await guard();
  if ("result" in g) return g.result;
  const room_number = str(form, "room_number");
  if (!room_number || [...room_number].length > 12) return bad("เลขห้องต้องมี 1–12 ตัวอักษร");
  const price_override = money(str(form, "price_override"));
  if (price_override === undefined) return bad("ราคาไม่ถูกต้อง");
  const { error } = await g.sb.from("rooms").update({ room_number, price_override }).eq("id", str(form, "id"));
  if (error) return bad(error.code === "23505" ? "มีเลขห้องนี้อยู่แล้ว" : DB_FAIL);
  refresh("/admin/rooms");
  return ok("บันทึกแล้ว");
}

export async function addRoom(_p: AdminResult, form: FormData): Promise<AdminResult> {
  const g = await guard();
  if ("result" in g) return g.result;
  const room_number = str(form, "room_number");
  const floor = Number(str(form, "floor"));
  const room_type_id = str(form, "room_type_id");
  if (!room_number || [...room_number].length > 12) return bad("เลขห้องต้องมี 1–12 ตัวอักษร");
  if (!Number.isInteger(floor) || floor < 1 || floor > 6) return bad("ชั้นต้องเป็น 1–6");
  if (!room_type_id) return bad("เลือกประเภทห้อง");
  const { error } = await g.sb.from("rooms").insert({ room_number, floor, room_type_id }); // สถานะเริ่มต้น = เต็ม (ปลอดภัยกว่า)
  if (error) return bad(error.code === "23505" ? "มีเลขห้องนี้อยู่แล้ว" : DB_FAIL);
  refresh("/admin/rooms");
  return ok(`เพิ่มห้อง ${room_number} แล้ว (สถานะเริ่มต้น: เต็ม)`);
}

/* ---------- ราคา / ค่าใช้จ่าย ---------- */

export async function savePrice(_p: AdminResult, form: FormData): Promise<AdminResult> {
  const g = await guard();
  if ("result" in g) return g.result;
  const price = money(str(form, "price_per_month"));
  if (price === undefined || price === null) return bad("กรอกราคาเป็นตัวเลข");
  const floor = Number(str(form, "floor"));
  if (!Number.isInteger(floor) || floor < 1 || floor > 6) return bad("ชั้นต้องเป็น 1–6");
  const room_type_id = str(form, "room_type_id");
  if (!room_type_id) return bad("เลือกประเภทห้อง");
  // upsert: ใช้ทั้ง "แก้ราคาแถวเดิม" และ "เพิ่มชั้น/ประเภทใหม่"
  const { error } = await g.sb.from("floor_prices").upsert({ floor, room_type_id, price_per_month: price }, { onConflict: "floor,room_type_id" });
  if (error) return bad(DB_FAIL);
  refresh("/admin/prices");
  return ok("บันทึกแล้ว");
}

export async function saveFees(_p: AdminResult, form: FormData): Promise<AdminResult> {
  const g = await guard();
  if ("result" in g) return g.result;
  const patch: Record<string, number> = {};
  for (const key of ["common_fee", "water_rate", "electric_rate", "parking_fee"]) {
    const n = money(str(form, key));
    if (n === undefined || n === null) return bad("กรอกทุกช่องเป็นตัวเลข");
    patch[key] = n;
  }
  const slots = Number(str(form, "parking_slots"));
  if (!Number.isInteger(slots) || slots < 0 || slots > 500) return bad("จำนวนช่องจอดต้องเป็นจำนวนเต็ม");
  patch.parking_slots = slots;
  // site_settings มีแถวเดียว (singleton) → อัปเดตทุกแถวที่ RLS ให้เห็น
  const { data, error } = await g.sb.from("site_settings").update(patch).eq("singleton", true).select("id");
  if (error) return bad(DB_FAIL);
  if (!data?.length) return bad("ไม่พบแถวตั้งค่าเว็บ — แจ้งพี่หยัด");
  refresh("/admin/prices");
  return ok("บันทึกแล้ว · หน้าเว็บอัปเดตทันที");
}

/* ---------- ฝากเบอร์ ---------- */

export async function setInquiryStatus(_p: AdminResult, form: FormData): Promise<AdminResult> {
  const g = await guard();
  if ("result" in g) return g.result;
  const status = str(form, "status");
  if (!["new", "contacted", "closed"].includes(status)) return bad("สถานะไม่ถูกต้อง");
  // closed_at เริ่มนับ 90 วันก่อนลบอัตโนมัติ · เปิดเรื่องกลับ → ล้างค่า
  const closed_at = status === "closed" ? new Date().toISOString() : null;
  const { error } = await g.sb.from("inquiries").update({ status, closed_at }).eq("id", str(form, "id"));
  if (error) return bad(DB_FAIL);
  revalidatePath("/admin/inquiries");
  return ok("บันทึกแล้ว");
}

/* ---------- รูป ---------- */

const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadPhoto(_p: AdminResult, form: FormData): Promise<AdminResult> {
  const g = await guard();
  if ("result" in g) return g.result;
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return bad("เลือกไฟล์รูปก่อน");
  const ext = MIME_EXT[file.type];
  if (!ext) return bad("รับเฉพาะ JPG · PNG · WebP");
  if (file.size > MAX_BYTES) return bad("ไฟล์ใหญ่เกิน 5 MB");
  const room_type_id = str(form, "room_type_id") || null;
  const alt_text = str(form, "alt_text").slice(0, 120);

  const path = `${randomUUID()}.${ext}`;
  const up = await g.sb.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return bad("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");

  const { data: last } = await g.sb.from("photos").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await g.sb.from("photos").insert({ path, alt_text, room_type_id, sort_order: (last?.sort_order ?? 0) + 1, is_published: true });
  if (error) {
    await g.sb.storage.from(PHOTO_BUCKET).remove([path]); // ไม่ทิ้งไฟล์กำพร้า
    return bad(DB_FAIL);
  }
  refresh("/admin/photos");
  return ok("อัปโหลดแล้ว");
}

export async function updatePhoto(_p: AdminResult, form: FormData): Promise<AdminResult> {
  const g = await guard();
  if ("result" in g) return g.result;
  const patch: Record<string, unknown> = {};
  if (form.has("room_type_id")) patch.room_type_id = str(form, "room_type_id") || null;
  if (form.has("alt_text")) patch.alt_text = str(form, "alt_text").slice(0, 120);
  if (form.has("publish")) patch.is_published = str(form, "publish") === "1";
  if (!Object.keys(patch).length) return bad("ไม่มีอะไรให้บันทึก");
  const { error } = await g.sb.from("photos").update(patch).eq("id", str(form, "id"));
  if (error) return bad(DB_FAIL);
  refresh("/admin/photos");
  return ok("บันทึกแล้ว");
}

/** เลื่อนรูปขึ้น/ลง: จัดลำดับทั้งหมดใหม่เป็น 1..n แล้วสลับกับตัวข้างเคียง */
export async function movePhoto(_p: AdminResult, form: FormData): Promise<AdminResult> {
  const g = await guard();
  if ("result" in g) return g.result;
  const dir = str(form, "dir") === "up" ? -1 : 1;
  const id = str(form, "id");
  const { data, error } = await g.sb.from("photos").select("id,sort_order").order("sort_order").order("id");
  if (error || !data) return bad(DB_FAIL);
  const ids = data.map((r) => r.id as string);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ok("อยู่ปลายสุดแล้ว");
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const results = await Promise.all(ids.map((pid, idx) => g.sb.from("photos").update({ sort_order: idx + 1 }).eq("id", pid)));
  if (results.some((r) => r.error)) return bad(DB_FAIL);
  refresh("/admin/photos");
  return ok("เลื่อนแล้ว");
}

export async function deletePhoto(_p: AdminResult, form: FormData): Promise<AdminResult> {
  const g = await guard();
  if ("result" in g) return g.result;
  const id = str(form, "id");
  const { data: row } = await g.sb.from("photos").select("path").eq("id", id).maybeSingle();
  const { error } = await g.sb.from("photos").delete().eq("id", id);
  if (error) return bad(DB_FAIL);
  if (row?.path) await g.sb.storage.from(PHOTO_BUCKET).remove([row.path as string]);
  refresh("/admin/photos");
  return ok("ลบแล้ว");
}
