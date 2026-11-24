import { cache } from "react";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabase } from "@/lib/supabase/server";
import { SEED_AMENITIES, SEED_FLOOR_PRICES, SEED_ROOM_TYPES, SEED_ROOMS, SEED_SETTINGS } from "./seed";
import type { Amenity, FloorPrice, Room, RoomCard, RoomType, SiteData, SiteSettings } from "./types";

/** floor_prices × room_types × rooms → การ์ด (ห้องว่าง = rooms ที่ available + published ในชั้น/ประเภทเดียวกัน) */
export function buildCards(types: RoomType[], prices: FloorPrice[], rooms: Room[]): RoomCard[] {
  const typeMap = new Map(types.filter((t) => t.is_published).map((t) => [t.id, t]));
  return prices
    .filter((p) => typeMap.has(p.room_type_id))
    .map((p) => ({
      floor: p.floor,
      typeName: typeMap.get(p.room_type_id)!.name,
      price: Number(p.price_per_month),
      available: rooms.filter((r) => r.is_published && r.status === "available" && r.floor === p.floor && r.room_type_id === p.room_type_id).length,
    }))
    .sort((a, b) => a.floor - b.floor || b.price - a.price);
}

const baht = (n: number) => Number(n).toLocaleString("en-US");

/** ค่าใช้จ่ายอื่นในหัวข้อ "ห้องและราคา" — อ่านจาก site_settings (เดิมเป็นค่าคงที่ใน B1) */
export function buildFees(s: SiteSettings): { label: string; value: string }[] {
  return [
    { label: "ค่าส่วนกลาง", value: `${baht(s.common_fee)} บาท/เดือน` },
    { label: "ค่าน้ำ", value: `${baht(s.water_rate)} บาท/หน่วย` },
    { label: "ค่าไฟ", value: `${baht(s.electric_rate)} บาท/หน่วย` },
    { label: `ที่จอดรถ (${s.parking_slots} ช่อง)`, value: `${baht(s.parking_fee)} บาท/คัน/เดือน` },
  ];
}

export const getSiteData = cache(async (): Promise<SiteData> => {
  if (!hasSupabaseEnv) {
    return { settings: SEED_SETTINGS, cards: buildCards(SEED_ROOM_TYPES, SEED_FLOOR_PRICES, SEED_ROOMS), amenities: SEED_AMENITIES, source: "seed" };
  }
  const sb = await createServerSupabase();
  const [s, t, p, r, a] = await Promise.all([
    sb.from("site_settings").select("name,line_oa,phone,address_text,google_maps_url,map_lat,map_lng,nearby_places,common_fee,water_rate,electric_rate,parking_fee,parking_slots").limit(1).maybeSingle(),
    sb.from("room_types").select("id,name,description,is_published"),
    sb.from("floor_prices").select("floor,room_type_id,price_per_month"),
    sb.from("rooms").select("room_number,floor,room_type_id,status,is_published"),
    sb.from("amenities").select("name").order("sort_order"),
  ]);
  const err = s.error ?? t.error ?? p.error ?? r.error ?? a.error;
  if (err) throw new Error(`โหลดข้อมูลไม่สำเร็จ: ${err.message}`);
  return {
    settings: (s.data as SiteSettings | null) ?? SEED_SETTINGS,
    cards: buildCards((t.data ?? []) as RoomType[], (p.data ?? []) as FloorPrice[], (r.data ?? []) as Room[]),
    amenities: (a.data ?? []) as Amenity[],
    source: "db",
  };
});

/** การ์ดที่โชว์บนหน้าแรก: เฉพาะที่มีห้องว่าง > 0 เรียงราคาถูก→แพง (ชั้นที่เต็มไม่โชว์ราคา) */
export function visibleCards(cards: RoomCard[]): RoomCard[] {
  return cards.filter((c) => c.available > 0).sort((a, b) => a.price - b.price || a.floor - b.floor);
}

/** ข้อความ "ชั้น 1–3 เต็มแล้ว" จากชั้นที่มีราคาในระบบแต่ไม่มีห้องว่างเลย · ไม่มีชั้นเต็ม → null */
export function fullFloorsLabel(cards: RoomCard[]): string | null {
  const floors = [...new Set(cards.map((c) => c.floor))].sort((a, b) => a - b);
  const full = floors.filter((f) => !cards.some((c) => c.floor === f && c.available > 0));
  if (!full.length) return null;
  const parts: string[] = [];
  for (let i = 0; i < full.length; ) {
    let j = i;
    while (j + 1 < full.length && full[j + 1] === full[j] + 1) j++;
    parts.push(j > i ? `${full[i]}–${full[j]}` : `${full[i]}`);
    i = j + 1;
  }
  return `ชั้น ${parts.join(", ")} เต็มแล้ว`;
}
