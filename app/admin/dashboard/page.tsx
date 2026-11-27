import { LiveBadge } from "@/components/admin/LiveBadge";
import { RoomBoard } from "@/components/admin/RoomBoard";
import { errorBox } from "@/components/admin/ui";
import { loadDashboard } from "@/lib/dashboard-data";

const AFTER_TENANTS = "เริ่มแสดงหลังเปิดใช้ระบบผู้เช่า";
const AFTER_METERS = "เริ่มแสดงหลังเปิดใช้ระบบมิเตอร์";
const box = "flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-white p-4 lg:p-6";

export default async function DashboardPage() {
  const { data, error } = await loadDashboard();
  const { dashboard: d, liveTables, loadedAt } = data;

  const kpis = [
    { label: "มีคนอยู่ (รายเดือน)", value: `${d.occupied}/${d.monthly}`, note: d.monthly ? `${Math.round((d.occupied * 100) / d.monthly)}% · ไม่นับรายวันและห้องที่ไม่ใช่ห้องพัก` : "ยังไม่มีข้อมูลห้อง", color: "text-ink" },
    { label: "ห้องว่าง", value: String(d.vacant), note: "ตามสถานะในหน้าห้อง", color: "text-ok-ink" },
    { label: "มีคนเช่า · รอเอกสาร", value: d.waiting === null ? null : String(d.waiting), note: d.waiting === null ? AFTER_TENANTS : "ยังไม่มีสัญญาในระบบ", color: "text-[#92400E]" },
    { label: "ครอบครัว/พนักงาน", value: String(d.holders), note: "ตามผังตึกและประเภทสัญญา", color: "text-[#075985]" },
  ];
  const todos = [
    {
      title: d.waiting === null ? "ข้อมูลผู้เช่า" : `อัปเดตผู้เช่า ${d.waiting} ห้อง`,
      sub: d.waiting === null ? AFTER_TENANTS : "มีคนอยู่แต่ยังไม่มีสัญญาในระบบ",
    },
    {
      title: d.meter ? `จดมิเตอร์เดือนนี้ ${d.meter.done}/${d.meter.total} ห้อง` : "มิเตอร์เดือนนี้",
      sub: d.meter ? "นับห้องรายเดือนที่มีคนอยู่ ไม่รวมครอบครัว/พนักงาน" : AFTER_METERS,
    },
    { title: "ติดต่อสำนักงาน", sub: "เริ่มแสดงหลังเปิดใช้ระบบข้อความ" },
    { title: "แจ้ง ตม.30", sub: "เริ่มแสดงหลังเปิดใช้ระบบ ตม.30" },
  ];

  return (
    // เลย์เอาต์หลังบ้านกว้าง 760px · แดชบอร์ดขยายเต็มจอคอมตามแบบ
    <div className="flex flex-col gap-4 lg:relative lg:left-1/2 lg:w-[min(1320px,calc(100vw-48px))] lg:-translate-x-1/2 lg:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-head text-2xl font-bold lg:text-[32px]">ภาพรวมตึก</h1>
          <p className="m-0 text-muted">6 ชั้น · 82 ห้อง + 108A</p>
        </div>
        <LiveBadge tables={liveTables} loadedAt={loadedAt} />
      </div>
      {error && <p className={errorBox}>โหลดข้อมูลไม่สำเร็จ: {error}</p>}

      {!error && (
        <>
          <section aria-label="สรุปตัวเลข" className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-4">
            {kpis.map((k) => (
              <div key={k.label} className={box}>
                <span className="text-sm font-medium text-muted">{k.label}</span>
                <span className={`font-head text-3xl font-bold leading-tight tabular-nums lg:text-[40px] ${k.color}`}>{k.value ?? "—"}</span>
                <span className="text-[13px] text-subtle">{k.note}</span>
              </div>
            ))}
          </section>

          {(d.absent.length > 0 || d.outsidePlan.length > 0) && (
            <p className="m-0 rounded-xl bg-pet px-4 py-3 text-sm text-pet-ink">
              {d.absent.length > 0 && `ห้องในผังที่ยังไม่มีในระบบ ${d.absent.length} ห้อง (ตัวเลขด้านบนไม่นับ): ${d.absent.join(" · ")}`}
              {d.absent.length > 0 && d.outsidePlan.length > 0 && <br />}
              {d.outsidePlan.length > 0 && `ห้องในระบบที่ไม่อยู่ในผัง: ${d.outsidePlan.join(" · ")}`}
            </p>
          )}

          <RoomBoard rooms={d.rooms}>
            <section aria-labelledby="todo-h" className="rounded-3xl border border-line bg-white p-4 lg:p-6">
              <h2 id="todo-h" className="m-0 mb-2 font-head text-xl font-bold">ต้องทำวันนี้</h2>
              <ul className="m-0 flex list-none flex-col p-0">
                {todos.map((t) => (
                  <li key={t.title} className="flex flex-col border-t border-line py-3">
                    <span className="text-[15px] font-semibold">{t.title}</span>
                    <span className="text-[13px] text-subtle">{t.sub}</span>
                  </li>
                ))}
              </ul>
            </section>
          </RoomBoard>

          <section aria-labelledby="money-h" className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-white p-4 lg:p-6">
            <h2 id="money-h" className="m-0 font-head text-xl font-bold">การเงินเดือนนี้</h2>
            <span className="rounded-full bg-[#FEF3C7] px-3 py-1 text-[13px] font-semibold text-[#92400E]">เริ่มแสดงหลังเปิดใช้ระบบบิล (หลังออกบิลเดือนแรก)</span>
          </section>
        </>
      )}
    </div>
  );
}
