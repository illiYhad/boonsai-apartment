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

export const getSiteData = cache(async (): Promise<SiteData> => {
  if (!hasSupabaseEnv) {
    return { settings: SEED_SETTINGS, cards: buildCards(SEED_ROOM_TYPES, SEED_FLOOR_PRICES, SEED_ROOMS), amenities: SEED_AMENITIES, source: "seed" };
  }
  const sb = await createServerSupabase();
  const [s, t, p, r, a] = await Promise.all([
    sb.from("site_settings").select("name,line_oa,phone,address_text,google_maps_url,nearby_places").limit(1).maybeSingle(),
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
