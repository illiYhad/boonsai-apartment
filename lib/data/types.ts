export type RoomStatus = "available" | "occupied" | "maintenance";

export type SiteSettings = {
  name: string;
  line_oa: string;
  phone: string;
  address_text: string;
  google_maps_url: string;
  map_lat: number | null;
  map_lng: number | null;
  nearby_places: { name: string; note: string }[];
  common_fee: number;
  water_rate: number;
  electric_rate: number;
  parking_fee: number;
  parking_slots: number;
};
export type RoomType = { id: string; name: string; description: string; is_published: boolean };
export type FloorPrice = { floor: number; room_type_id: string; price_per_month: number };
export type Room = { room_number: string; floor: number; room_type_id: string; status: RoomStatus; is_published: boolean };
export type Amenity = { name: string };

/** การ์ด 1 ใบในหัวข้อ "ห้องและราคา" = 1 แถวของ floor_prices */
export type RoomCard = { floor: number; typeName: string; price: number; available: number };

export type SiteData = { settings: SiteSettings; cards: RoomCard[]; amenities: Amenity[]; source: "db" | "seed" };
