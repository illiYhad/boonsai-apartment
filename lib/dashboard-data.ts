import { adminCtx } from "@/lib/admin";
import type { Loaded } from "@/lib/admin-data";
import { buildDashboard, currentPeriod, type Dashboard, type LeaseInput, type RoomInput } from "@/lib/dashboard";
import { SEED_ROOMS } from "@/lib/data/seed";

export type LiveTable = "rooms" | "leases" | "meter_readings";
export type DashboardData = { dashboard: Dashboard; liveTables: LiveTable[]; loadedAt: string };

/** ตารางยังไม่ถูกสร้างบนฐาน (Postgres 42P01 · PostgREST PGRST205) ไม่ถือเป็นข้อผิดพลาด */
const isMissingTable = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205";

export async function loadDashboard(): Promise<Loaded<DashboardData>> {
  const now = new Date();
  const loadedAt = now.toISOString();
  const empty = (): DashboardData => ({ dashboard: buildDashboard({ rooms: [], leases: null, meterRoomIds: null }), liveTables: [], loadedAt });

  const ctx = await adminCtx();
  if (ctx.kind === "mock") {
    const rooms = SEED_ROOMS.map((r) => ({ id: r.room_number, room_number: r.room_number, status: r.status }));
    return { mock: true, data: { dashboard: buildDashboard({ rooms, leases: null, meterRoomIds: null }), liveTables: [], loadedAt } };
  }
  if (ctx.kind !== "ok") return { mock: false, error: "ไม่มีสิทธิ์เข้าถึง", data: empty() };

  // เลือกเฉพาะคอลัมน์ที่ไม่ใช่ข้อมูลส่วนตัว: ไม่ดึงผู้เช่า เลขบัตร เบอร์ หรือค่าเช่า
  const [rooms, leases, meters] = await Promise.all([
    ctx.sb.from("rooms").select("id,room_number,status"),
    ctx.sb.from("leases").select("room_id,occupancy_type").eq("status", "ACTIVE"),
    ctx.sb.from("meter_readings").select("room_id").eq("period", currentPeriod(now)).not("room_id", "is", null),
  ]);
  const failed = rooms.error ?? [leases.error, meters.error].find((e) => e && !isMissingTable(e));
  if (failed) return { mock: false, error: failed.message, data: empty() };

  const liveTables: LiveTable[] = ["rooms"];
  if (!leases.error) liveTables.push("leases");
  if (!meters.error) liveTables.push("meter_readings");
  const dashboard = buildDashboard({
    rooms: (rooms.data ?? []) as RoomInput[],
    leases: leases.error ? null : ((leases.data ?? []) as LeaseInput[]),
    meterRoomIds: meters.error ? null : (meters.data ?? []).map((m) => m.room_id as string),
  });
  return { mock: false, data: { dashboard, liveTables, loadedAt } };
}
