import { cache } from "react";
import { adminCtx } from "@/lib/admin";
import { SEED_FLOOR_PRICES, SEED_ROOM_TYPES, SEED_ROOMS, SEED_SETTINGS } from "@/lib/data/seed";
import type { FloorPrice, RoomStatus, RoomType, SiteSettings } from "@/lib/data/types";

export type AdminRoom = { id: string; room_number: string; floor: number; room_type_id: string; status: RoomStatus; price_override: number | null };
export type AdminPhoto = { id: string; path: string; alt_text: string; room_type_id: string | null; sort_order: number; is_published: boolean };
export type InquiryStatus = "new" | "contacted" | "closed";
export type AdminInquiry = { id: string; guest_name: string; phone: string; has_pet: boolean; preferred_date: string | null; status: InquiryStatus; created_at: string; closed_at: string | null };

export const INQUIRY_RETENTION_DAYS = 90;

export type Loaded<T> = { mock: boolean; error?: string; data: T };

function fail<T>(data: T, message: string): Loaded<T> {
  return { mock: false, data, error: message };
}

export const loadRooms = cache(async (): Promise<Loaded<{ rooms: AdminRoom[]; types: RoomType[] }>> => {
  const ctx = await adminCtx();
  if (ctx.kind === "mock") {
    const rooms = SEED_ROOMS.map((r) => ({ id: r.room_number, room_number: r.room_number, floor: r.floor, room_type_id: r.room_type_id, status: r.status, price_override: null }));
    return { mock: true, data: { rooms, types: SEED_ROOM_TYPES } };
  }
  if (ctx.kind !== "ok") return fail({ rooms: [], types: [] }, "ไม่มีสิทธิ์เข้าถึง");
  const [r, t] = await Promise.all([
    ctx.sb.from("rooms").select("id,room_number,floor,room_type_id,status,price_override").order("floor").order("room_number"),
    ctx.sb.from("room_types").select("id,name,description,is_published").order("name"),
  ]);
  if (r.error || t.error) return fail({ rooms: [], types: [] }, (r.error ?? t.error)!.message);
  return { mock: false, data: { rooms: (r.data ?? []) as AdminRoom[], types: (t.data ?? []) as RoomType[] } };
});

export const loadPrices = cache(async (): Promise<Loaded<{ prices: FloorPrice[]; types: RoomType[]; settings: SiteSettings }>> => {
  const ctx = await adminCtx();
  if (ctx.kind === "mock") return { mock: true, data: { prices: SEED_FLOOR_PRICES, types: SEED_ROOM_TYPES, settings: SEED_SETTINGS } };
  const empty = { prices: [], types: [], settings: SEED_SETTINGS };
  if (ctx.kind !== "ok") return fail(empty, "ไม่มีสิทธิ์เข้าถึง");
  const [p, t, s] = await Promise.all([
    ctx.sb.from("floor_prices").select("floor,room_type_id,price_per_month").order("floor"),
    ctx.sb.from("room_types").select("id,name,description,is_published").order("name"),
    ctx.sb.from("site_settings").select("name,line_oa,phone,address_text,google_maps_url,nearby_places,common_fee,water_rate,electric_rate,parking_fee,parking_slots").limit(1).maybeSingle(),
  ]);
  const err = p.error ?? t.error ?? s.error;
  if (err) return fail(empty, err.message);
  return { mock: false, data: { prices: (p.data ?? []) as FloorPrice[], types: (t.data ?? []) as RoomType[], settings: (s.data as SiteSettings | null) ?? SEED_SETTINGS } };
});

// ตัวอย่างล้วน ๆ สำหรับโหมดทดสอบ (ไม่มีฐานข้อมูล) ไว้ดูหน้าตา — ไม่ใช่ข้อมูลลูกค้าจริง และไม่เคยถูกเขียนลง DB
const MOCK_INQUIRIES: AdminInquiry[] = [
  { id: "mock-1", guest_name: "ตัวอย่าง ทดสอบ", phone: "0800000001", has_pet: true, preferred_date: null, status: "new", created_at: "2026-10-13T02:10:00Z", closed_at: null },
  { id: "mock-2", guest_name: "ตัวอย่าง สอง", phone: "0800000002", has_pet: false, preferred_date: "2026-10-20", status: "contacted", created_at: "2026-10-12T09:30:00Z", closed_at: null },
];

export const loadInquiries = cache(async (): Promise<Loaded<AdminInquiry[]>> => {
  const ctx = await adminCtx();
  if (ctx.kind === "mock") return { mock: true, data: MOCK_INQUIRIES };
  if (ctx.kind !== "ok") return fail([], "ไม่มีสิทธิ์เข้าถึง");
  // ลบอัตโนมัติ: ปิดเรื่องมาเกิน 90 วัน (ทำตอนเปิดหน้า · policy "admin delete inquiries") — ผิดพลาดก็ไม่ขวางการแสดงรายการ
  const cutoff = new Date(Date.now() - INQUIRY_RETENTION_DAYS * 86_400_000).toISOString();
  await ctx.sb.from("inquiries").delete().eq("status", "closed").lt("closed_at", cutoff);
  const { data, error } = await ctx.sb.from("inquiries").select("id,guest_name,phone,has_pet,preferred_date,status,created_at,closed_at").order("created_at", { ascending: false });
  if (error) return fail([], error.message);
  const order: Record<InquiryStatus, number> = { new: 0, contacted: 1, closed: 2 };
  const list = ((data ?? []) as AdminInquiry[]).sort((a, b) => order[a.status] - order[b.status]); // sort เสถียร → ในกลุ่มเดียวกันใหม่สุดก่อน
  return { mock: false, data: list };
});

export const loadPhotos = cache(async (): Promise<Loaded<{ photos: AdminPhoto[]; types: RoomType[] }>> => {
  const ctx = await adminCtx();
  if (ctx.kind === "mock") return { mock: true, data: { photos: [], types: SEED_ROOM_TYPES } };
  if (ctx.kind !== "ok") return fail({ photos: [], types: [] }, "ไม่มีสิทธิ์เข้าถึง");
  const [p, t] = await Promise.all([
    ctx.sb.from("photos").select("id,path,alt_text,room_type_id,sort_order,is_published").order("sort_order"),
    ctx.sb.from("room_types").select("id,name,description,is_published").order("name"),
  ]);
  if (p.error || t.error) return fail({ photos: [], types: [] }, (p.error ?? t.error)!.message);
  return { mock: false, data: { photos: (p.data ?? []) as AdminPhoto[], types: (t.data ?? []) as RoomType[] } };
});
