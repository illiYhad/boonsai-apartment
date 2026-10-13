import { ActionForm } from "@/components/admin/ActionForm";
import { btn, btnPrimary, card, errorBox, field, h1, label } from "@/components/admin/ui";
import { loadPrices } from "@/lib/admin-data";
import { saveFees, savePrice } from "../actions";

export default async function PricesPage() {
  const { data, error } = await loadPrices();
  const { prices, types, settings } = data;
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const floors = [...new Set(prices.map((p) => p.floor))].sort((a, b) => a - b);

  return (
    <>
      <div>
        <h1 className={h1}>ราคา</h1>
        <p className="mt-1 mb-0 text-sm text-muted">ราคาต่อเดือนรายชั้น · ค่าใช้จ่ายอื่น — บันทึกแล้วหน้าเว็บอัปเดตทันที</p>
      </div>
      {error && <p className={errorBox}>โหลดข้อมูลไม่สำเร็จ: {error}</p>}

      {floors.map((floor) => (
        <section key={floor} className="flex flex-col gap-3">
          <h2 className="m-0 font-head text-lg font-bold">ชั้น {floor}</h2>
          {prices
            .filter((p) => p.floor === floor)
            .map((p) => (
              <ActionForm key={`${p.floor}-${p.room_type_id}`} action={savePrice} className={`${card} grid grid-cols-[1fr_auto] items-end gap-3`}>
                <input type="hidden" name="floor" value={p.floor} />
                <input type="hidden" name="room_type_id" value={p.room_type_id} />
                <label className={label}>
                  {typeName.get(p.room_type_id) ?? "—"} (บาท/เดือน)
                  <input name="price_per_month" defaultValue={Number(p.price_per_month)} required inputMode="numeric" className={`${field} text-lg font-semibold`} />
                </label>
                <button type="submit" className={btnPrimary}>บันทึก</button>
              </ActionForm>
            ))}
        </section>
      ))}

      <details className={card}>
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">+ เพิ่มราคาชั้น/ประเภทใหม่</summary>
        <ActionForm action={savePrice} resetOnOk className="mt-2 grid grid-cols-2 gap-3">
          <label className={label}>
            ชั้น
            <select name="floor" required className={field} defaultValue="">
              <option value="" disabled>เลือก</option>
              {[1, 2, 3, 4, 5, 6].map((f) => (
                <option key={f} value={f}>ชั้น {f}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            ราคา (บาท/เดือน)
            <input name="price_per_month" required inputMode="numeric" className={field} />
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
          <button type="submit" className={`${btn} col-span-2`}>บันทึกราคา</button>
        </ActionForm>
      </details>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 font-head text-lg font-bold">ค่าใช้จ่ายอื่น</h2>
        <ActionForm action={saveFees} className={`${card} grid grid-cols-2 gap-3`}>
          <label className={label}>
            ค่าส่วนกลาง (บาท/เดือน)
            <input name="common_fee" defaultValue={Number(settings.common_fee)} required inputMode="decimal" className={field} />
          </label>
          <label className={label}>
            ที่จอดรถ (บาท/คัน/เดือน)
            <input name="parking_fee" defaultValue={Number(settings.parking_fee)} required inputMode="decimal" className={field} />
          </label>
          <label className={label}>
            ค่าน้ำ (บาท/หน่วย)
            <input name="water_rate" defaultValue={Number(settings.water_rate)} required inputMode="decimal" className={field} />
          </label>
          <label className={label}>
            ค่าไฟ (บาท/หน่วย)
            <input name="electric_rate" defaultValue={Number(settings.electric_rate)} required inputMode="decimal" className={field} />
          </label>
          <label className={`${label} col-span-2`}>
            จำนวนช่องจอดรถ
            <input name="parking_slots" defaultValue={settings.parking_slots} required inputMode="numeric" className={field} />
          </label>
          <button type="submit" className={`${btnPrimary} col-span-2`}>บันทึกค่าใช้จ่าย</button>
        </ActionForm>
      </section>
    </>
  );
}
