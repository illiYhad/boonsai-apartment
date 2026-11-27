// ตรรกะแดชบอร์ดหลังบ้าน (K-BS-DASH.1a) · ฟังก์ชันล้วน ไม่ต่อฐานข้อมูล · ไม่รับข้อมูลส่วนตัว (เลขห้อง + สถานะเท่านั้น)
import type { RoomStatus } from "@/lib/data/types";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
const upper = (floor: number) => ({ floor, left: range(floor * 100 + 1, floor * 100 + 8), right: range(floor * 100 + 9, floor * 100 + 16) });

/** ผังปีกตึก (พี่หยัด 2026-11-24 09:34 · 108A เพิ่ม 10:20) · ที่เดียวในระบบ ห้ามเดาปีกจากเลขห้องที่อื่น */
export const FLOOR_PLAN: { floor: number; left: string[]; right: string[] }[] = [
  { floor: 1, left: range(101, 105), right: ["106", "107", "108", "108A", "109", "110"] },
  { floor: 2, left: range(201, 204), right: range(205, 208) },
  upper(3), upper(4), upper(5), upper(6),
];

export type Kind = "vacant" | "waiting" | "occupied" | "leased" | "family" | "staff" | "daily" | "other" | "maintenance" | "absent";

/** ห้องที่ตัดสินแล้ว (ผังพี่ไอซ์ 2026-11-24) · ฐานยังไม่มีคอลัมน์ประเภทการใช้ห้อง จึงเก็บเป็นค่าคงที่ */
const FIXED_USE: Record<string, { kind: "daily" | "other"; note: string }> = {
  "102": { kind: "other", note: "ร้าน Moon & Sun" },
  "104": { kind: "daily", note: "ห้องรายวัน · Airbnb" },
  "105": { kind: "daily", note: "ห้องรายวัน · Airbnb" },
  "106": { kind: "other", note: "ห้องเก็บของ" },
};
const FIXED_HOLDER: Record<string, "family" | "staff"> = { "107": "family", "108": "family", "108A": "family", "109": "family", "110": "family", "208": "staff" };

export const KIND_LABEL: Record<Kind, { short: string; label: string }> = {
  vacant: { short: "ว่าง", label: "ว่าง" },
  waiting: { short: "รอเอกสาร", label: "มีคนเช่า · รอเอกสาร" },
  occupied: { short: "มีคนอยู่", label: "มีคนอยู่" },
  leased: { short: "มีผู้เช่า", label: "มีผู้เช่า · มีสัญญาในระบบ" },
  family: { short: "ครอบครัว", label: "ครอบครัวพี่ไอซ์" },
  staff: { short: "พนักงาน", label: "ห้องพนักงาน" },
  daily: { short: "รายวัน", label: "ห้องรายวัน · Airbnb" },
  other: { short: "ไม่ใช่ห้องพัก", label: "ไม่ใช่ห้องพัก" },
  maintenance: { short: "ซ่อม", label: "ปิดซ่อม" },
  absent: { short: "ไม่มีในระบบ", label: "ยังไม่มีห้องนี้ในระบบ" },
};

export type Group = "vacant" | "waiting" | "holder" | "daily" | "leased";
export const GROUP_OF: Record<Kind, Group | null> = {
  vacant: "vacant", waiting: "waiting", family: "holder", staff: "holder", daily: "daily", leased: "leased",
  occupied: null, other: null, maintenance: null, absent: null,
};

export type RoomInput = { id: string; room_number: string; status: RoomStatus };
export type LeaseInput = { room_id: string; occupancy_type: string };
export type DashInput = {
  rooms: RoomInput[];
  /** null = ยังไม่มีตารางสัญญาบนฐาน */
  leases: LeaseInput[] | null;
  /** room_id ที่จดมิเตอร์เดือนนี้แล้ว · null = ยังไม่มีตารางมิเตอร์ */
  meterRoomIds: string[] | null;
};

export type DashRoom = { no: string; floor: number; wing: "left" | "right"; kind: Kind; note: string; missing: string[] };

export type Dashboard = {
  rooms: DashRoom[];
  hasLeases: boolean;
  /** นับเฉพาะห้องรายเดือนที่มีในฐาน (ไม่รวมรายวัน และห้องที่ไม่ใช่ห้องพัก) */
  monthly: number;
  occupied: number;
  vacant: number;
  waiting: number | null;
  holders: number;
  meter: { done: number; total: number } | null;
  absent: string[];
  outsidePlan: string[];
};

function classify(no: string, room: RoomInput | undefined, lease: LeaseInput | undefined, hasLeases: boolean): Kind {
  if (!room) return "absent";
  const fixed = FIXED_USE[no];
  if (fixed) return fixed.kind;
  if (lease?.occupancy_type === "STAFF") return "staff";
  if (lease?.occupancy_type === "OWNER_FAMILY") return "family";
  if (lease) return "leased";
  if (FIXED_HOLDER[no]) return FIXED_HOLDER[no];
  if (room.status === "available") return "vacant";
  if (room.status === "maintenance") return "maintenance";
  return hasLeases ? "waiting" : "occupied";
}

const LIVING: Kind[] = ["waiting", "occupied", "leased", "family", "staff"];

export function buildDashboard({ rooms, leases, meterRoomIds }: DashInput): Dashboard {
  const byNo = new Map(rooms.map((r) => [r.room_number, r]));
  const leaseByRoom = new Map((leases ?? []).map((l) => [l.room_id, l]));
  const metered = meterRoomIds === null ? null : new Set(meterRoomIds);
  const meter = { done: 0, total: 0 };
  const out: DashRoom[] = [];

  for (const f of FLOOR_PLAN) {
    for (const wing of ["left", "right"] as const) {
      for (const no of f[wing]) {
        const room = byNo.get(no);
        const lease = room ? leaseByRoom.get(room.id) : undefined;
        const kind = classify(no, room, lease, leases !== null);
        const missing: string[] = [];
        if (kind === "absent") missing.push("ยังไม่มีห้องนี้ในตารางห้อง");
        if (kind === "waiting") missing.push("ยังไม่มีผู้เช่าหรือสัญญาในระบบ");
        if (lease && room?.status === "available") missing.push("มีสัญญาอยู่ แต่สถานะห้องยังเป็น “ว่าง” (หน้าเว็บยังแสดงว่าว่าง)");
        if (room && metered && LIVING.includes(kind) && kind !== "family" && kind !== "staff") {
          meter.total += 1;
          if (metered.has(room.id)) meter.done += 1;
          else missing.push("ยังไม่ได้จดมิเตอร์เดือนนี้");
        }
        out.push({ no, floor: f.floor, wing, kind, note: FIXED_USE[no]?.note ?? "", missing });
      }
    }
  }

  const count = (...kinds: Kind[]) => out.filter((r) => kinds.includes(r.kind)).length;
  const planned = new Set(out.map((r) => r.no));
  return {
    rooms: out,
    hasLeases: leases !== null,
    monthly: out.length - count("daily", "other", "absent"),
    occupied: count(...LIVING),
    vacant: count("vacant"),
    waiting: leases === null ? null : count("waiting"),
    holders: count("family", "staff"),
    meter: metered === null ? null : meter,
    absent: out.filter((r) => r.kind === "absent").map((r) => r.no),
    outsidePlan: rooms.map((r) => r.room_number).filter((n) => !planned.has(n)),
  };
}

/** งวดมิเตอร์ของเดือนปัจจุบันตามเวลาไทย (YYYY-MM-01) */
export function currentPeriod(now: Date): string {
  return `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(now).slice(0, 7)}-01`;
}
