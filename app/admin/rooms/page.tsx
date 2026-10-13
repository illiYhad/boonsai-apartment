import { ActionForm } from "@/components/admin/ActionForm";
import { baht, btn, btnPrimary, card, errorBox, field, h1, label } from "@/components/admin/ui";
import { loadRooms } from "@/lib/admin-data";
import type { RoomStatus } from "@/lib/data/types";
import { addRoom, setRoomStatus, updateRoom } from "../actions";

const STATUSES: { value: RoomStatus; label: string; on: string }[] = [
  { value: "available", label: "ว่าง", on: "bg-ok-ink text-white border-ok-ink" },
  { value: "occupied", label: "เต็ม", on: "bg-[#4E5553] text-white border-[#4E5553]" },
  { value: "maintenance", label: "ซ่อม", on: "bg-[#B76E00] text-white border-[#B76E00]" },
];

export default async function RoomsPage() {
  const { data, error } = await loadRooms();
  const { rooms, types } = data;
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
  const count = (s: RoomStatus) => rooms.filter((r) => r.status === s).length;

  return (
    <>
      <div>
        <h1 className={h1}>ห้อง</h1>
        <p className="mt-1 mb-0 text-sm text-muted">
          ว่าง {count("available")} · เต็ม {count("occupied")} · ซ่อม {count("maintenance")} — แตะปุ่มสถานะครั้งเดียว หน้าเว็บอัปเดตทันที
        </p>
      </div>
      {error && <p className={errorBox}>โหลดข้อมูลไม่สำเร็จ: {error}</p>}

      {floors.map((floor) => (
        <section key={floor} className="flex flex-col gap-3">
          <h2 className="m-0 font-head text-lg font-bold">ชั้น {floor}</h2>
          {rooms
            .filter((r) => r.floor === floor)
            .map((r) => (
              <div key={r.id} id={`room-${r.room_number}`} className={`${card} flex flex-col gap-3`}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-head text-xl font-bold">{r.room_number}</div>
                  <div className="min-w-0 text-right text-sm text-muted">
                    {typeName.get(r.room_type_id) ?? "—"}
                    {r.price_override !== null && <div className="font-semibold text-ink">ราคาห้องนี้ {baht(r.price_override)} บาท</div>}
                  </div>
                </div>
                <ActionForm action={setRoomStatus} className="grid grid-cols-3 gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      type="submit"
                      name="status"
                      value={s.value}
                      aria-pressed={r.status === s.value}
                      className={`min-h-14 cursor-pointer rounded-xl border-2 text-lg font-bold disabled:opacity-60 ${r.status === s.value ? s.on : "border-line-strong bg-white text-ink"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </ActionForm>
                <details>
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent">แก้เลขห้อง / ราคาเฉพาะห้อง</summary>
                  <ActionForm action={updateRoom} className="mt-2 grid grid-cols-2 gap-3">
                    <input type="hidden" name="id" value={r.id} />
                    <label className={label}>
                      เลขห้อง
                      <input name="room_number" defaultValue={r.room_number} required maxLength={12} className={field} />
                    </label>
                    <label className={label}>
                      ราคาเฉพาะห้อง (บาท/เดือน)
                      <input name="price_override" defaultValue={r.price_override ?? ""} inputMode="numeric" placeholder="ว่าง = ใช้ราคาชั้น" className={field} />
                    </label>
                    <button type="submit" className={`${btnPrimary} col-span-2`}>
                      บันทึก
                    </button>
                  </ActionForm>
                </details>
              </div>
            ))}
        </section>
      ))}

      <details className={card}>
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">+ เพิ่มห้อง</summary>
        <ActionForm action={addRoom} resetOnOk className="mt-2 grid grid-cols-2 gap-3">
          <label className={label}>
            เลขห้อง
            <input name="room_number" required maxLength={12} className={field} />
          </label>
          <label className={label}>
            ชั้น
            <select name="floor" required className={field} defaultValue="">
              <option value="" disabled>เลือก</option>
              {[1, 2, 3, 4, 5, 6].map((f) => (
                <option key={f} value={f}>ชั้น {f}</option>
              ))}
            </select>
          </label>
          <label className={`${label} col-span-2`}>
            ประเภทห้อง
            <select name="room_type_id" required className={field} defaultValue="">
              <option value="" disabled>เลือก</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <p className="col-span-2 m-0 text-[13px] text-muted">ห้องใหม่เริ่มที่สถานะ “เต็ม” — แตะ “ว่าง” เมื่อพร้อมให้เช่า</p>
          <button type="submit" className={`${btn} col-span-2`}>เพิ่มห้อง</button>
        </ActionForm>
      </details>
    </>
  );
}
