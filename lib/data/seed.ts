import type { Amenity, FloorPrice, Room, RoomType, SiteSettings } from "./types";

// ข้อมูลจาก DATA_REAL_Boonsai_v1.md (2026-10-12 22:35) เท่านั้น — ห้ามแต่งเพิ่ม · ตรงกับ supabase/sql/003_seed.sql

export const SEED_SETTINGS: SiteSettings = {
  name: "บุญใสอพาร์ทเม้นท์",
  line_oa: "@371dkpvl",
  phone: "02-050-6449",
  // อ.เมืองสมุทรปราการ = ตามดราฟ · รอพี่ไอซ์ยืนยันอำเภอ
  address_text: "72/4 ภาณุวงศ์ 3 ต.บางเมืองใหม่ อ.เมืองสมุทรปราการ จ.สมุทรปราการ 10270",
  // หมุดจริงจากลิงก์ที่พี่หยัดส่ง 2026-10-13 (ตรงกับ supabase/sql/007_map_pin.sql)
  google_maps_url: "https://maps.app.goo.gl/LE14ijHxav1jwxNUA",
  map_lat: 13.6356438,
  map_lng: 100.5943656,
  nearby_places: [
    { name: "BTS ปู่เจ้า", note: "ประมาณ 5 นาที" },
    { name: "อิมพีเรียลเวิลด์ สำโรง", note: "ประมาณ 5 นาที" },
    { name: "ทางด่วนกาญจนาภิเษก", note: "เข้า-ออกสะดวก" },
  ],
  // ค่าใช้จ่ายอื่น (DATA_REAL) — ใน DB อยู่คอลัมน์ site_settings (005_fees.sql) แอดมินแก้เองที่ /admin/prices
  common_fee: 200,
  water_rate: 20,
  electric_rate: 11,
  parking_fee: 1000,
  parking_slots: 13,
};

export const T_PLAIN = "00000000-0000-4000-8000-000000000001";
export const T_AIR = "00000000-0000-4000-8000-000000000002";
export const T_FULL = "00000000-0000-4000-8000-000000000003";

export const SEED_ROOM_TYPES: RoomType[] = [
  { id: T_FULL, name: "Full Unit · 2 เตียง + แอร์", description: "", is_published: true },
  { id: T_AIR, name: "ห้องแอร์", description: "", is_published: true },
  { id: T_PLAIN, name: "ห้องเปล่า (ไม่มีแอร์)", description: "", is_published: true },
];

export const SEED_FLOOR_PRICES: FloorPrice[] = [
  { floor: 1, room_type_id: T_PLAIN, price_per_month: 2500 },
  { floor: 2, room_type_id: T_PLAIN, price_per_month: 3000 },
  { floor: 3, room_type_id: T_PLAIN, price_per_month: 2500 },
  { floor: 4, room_type_id: T_FULL, price_per_month: 4500 },
  { floor: 4, room_type_id: T_AIR, price_per_month: 3500 },
  { floor: 4, room_type_id: T_PLAIN, price_per_month: 2400 },
  { floor: 5, room_type_id: T_PLAIN, price_per_month: 2300 },
  { floor: 6, room_type_id: T_PLAIN, price_per_month: 2200 },
];

const avail = (room_number: string, floor: number, room_type_id: string): Room => ({ room_number, floor, room_type_id, status: "available", is_published: true });

/** เฉพาะห้องว่างตามโปรฯ ก.ย. 2569 · ห้องเต็มยังไม่ได้ลง (ไม่มีเลขห้อง) — แอดมินเพิ่มใน B2
 *  ชั้น 4 ห้องเปล่าว่าง 2 ห้อง ไม่มีเลขในโปสเตอร์ → เลขชั่วคราว "4-ว่าง-1/2" รอพี่ไอซ์ให้เลขจริง */
export const SEED_ROOMS: Room[] = [
  avail("401", 4, T_FULL), avail("402", 4, T_FULL),
  avail("410", 4, T_AIR), avail("414", 4, T_AIR),
  avail("4-ว่าง-1", 4, T_PLAIN), avail("4-ว่าง-2", 4, T_PLAIN),
  avail("504", 5, T_PLAIN), avail("505", 5, T_PLAIN), avail("506", 5, T_PLAIN), avail("508", 5, T_PLAIN),
  avail("606", 6, T_PLAIN), avail("610", 6, T_PLAIN), avail("612", 6, T_PLAIN), avail("615", 6, T_PLAIN),
];

export const SEED_AMENITIES: Amenity[] = [
  "กล้องวงจรปิด 24 ชม.", "ระบบคีย์การ์ด", "Wi-Fi พื้นที่ส่วนกลาง", "เครื่องซักผ้าหยอดเหรียญ",
  "ตู้กดน้ำหยอดเหรียญ", "แม่บ้านทำความสะอาดส่วนกลาง", "ที่จอดรถ 13 คัน",
].map((name) => ({ name }));
