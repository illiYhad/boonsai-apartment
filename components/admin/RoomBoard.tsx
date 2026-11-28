"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FLOOR_PLAN, GROUP_OF, KIND_LABEL, type DashRoom, type Group, type Kind } from "@/lib/dashboard";

const TONE: Record<Kind, string> = {
  vacant: "bg-ok-bg text-ok-ink border-[#9ED3B4]",
  waiting: "bg-[#FEF3C7] text-[#92400E] border-[#F5D08A]",
  occupied: "bg-[#E7E5E0] text-ink border-line-strong",
  leased: "bg-white text-ink border-line-strong",
  family: "bg-[#E0F2FE] text-[#075985] border-[#9CD3F2]",
  staff: "bg-[#E0F2FE] text-[#075985] border-[#9CD3F2]",
  daily: "bg-[#F3E8FF] text-[#6B21A8] border-[#D8B4FE]",
  other: "bg-[#EEF0EF] text-body border-line-strong",
  maintenance: "bg-pet text-pet-ink border-[#E7B878]",
  absent: "bg-white text-subtle border-line-strong border-dashed",
};

const FILTERS: { id: Group | "all"; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "vacant", label: "ว่าง" },
  { id: "waiting", label: "รอเอกสาร" },
  { id: "holder", label: "ครอบครัว/พนักงาน" },
  { id: "daily", label: "รายวัน" },
  { id: "leased", label: "มีผู้เช่า" },
];

const panel = "min-w-0 rounded-3xl border border-line bg-white p-4 lg:p-6";
const h2 = "m-0 font-head text-xl font-bold";

/** ผังห้อง + กรองสถานะ + แผงข้างของห้องที่เลือก · จอเล็กเลือกดูทีละชั้น */
export function RoomBoard({ rooms, children }: { rooms: DashRoom[]; children: React.ReactNode }) {
  const [filter, setFilter] = useState<Group | "all">("all");
  const [floor, setFloor] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useRef<HTMLElement>(null);
  const room = rooms.find((r) => r.no === selected);
  const count = (id: Group | "all") => (id === "all" ? rooms.length : rooms.filter((r) => GROUP_OF[r.kind] === id).length);
  const present = new Set(rooms.map((r) => r.kind));
  const onFloor = rooms.filter((r) => r.floor === floor);
  const floorTodo = onFloor.filter((r) => r.missing.length > 0);

  const pick = (no: string) => {
    setSelected(no);
    if (window.matchMedia("(max-width: 1023px)").matches) requestAnimationFrame(() => detail.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <section aria-labelledby="map-h" className={`${panel} flex flex-col gap-4 lg:flex-[999]`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="map-h" className={h2}>ผังห้องทั้งตึก</h2>
          <div role="group" aria-label="กรองสถานะ" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={`min-h-11 cursor-pointer rounded-full border px-4 text-sm font-medium ${filter === f.id ? "border-accent bg-accent text-white" : "border-line-strong bg-white text-ink"}`}>
                {f.label} <span className="tabular-nums">{count(f.id)}</span>
              </button>
            ))}
          </div>
        </div>

        <div role="group" aria-label="เลือกชั้น" className="grid grid-cols-6 gap-1 lg:hidden">
          {FLOOR_PLAN.map((f) => (
            <button key={f.floor} type="button" aria-pressed={floor === f.floor} onClick={() => setFloor(f.floor)} className={`min-h-11 cursor-pointer rounded-xl border px-0 text-[13px] font-semibold ${floor === f.floor ? "border-accent bg-accent text-white" : "border-line bg-white text-body"}`}>
              ชั้น {f.floor}
            </button>
          ))}
        </div>

        {/* คอมเรียงชั้นบนอยู่บนเหมือนตัวตึก */}
        <div className="flex flex-col-reverse gap-4">
          {FLOOR_PLAN.map((f) => {
            const list = rooms.filter((r) => r.floor === f.floor);
            return (
              <div key={f.floor} className={`${floor === f.floor ? "flex" : "hidden"} flex-col gap-2 lg:flex lg:flex-row lg:gap-4`}>
                <div className="flex items-baseline justify-between lg:w-16 lg:flex-none lg:flex-col lg:items-start lg:justify-start lg:pt-5">
                  <span className="font-head text-base font-semibold">ชั้น {f.floor}</span>
                  <span className="text-xs text-subtle tabular-nums">ว่าง {list.filter((r) => r.kind === "vacant").length}/{list.length}</span>
                </div>
                <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-2 lg:gap-4">
                  {(["left", "right"] as const).map((wing) => (
                    <div key={wing} className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs font-medium text-muted">{wing === "left" ? "ปีกซ้าย" : "ปีกขวา"}</span>
                      <div className="grid grid-cols-4 gap-2 lg:grid-cols-[repeat(auto-fill,minmax(64px,1fr))]">
                        {list.filter((r) => r.wing === wing).map((r) => {
                          const dim = filter !== "all" && GROUP_OF[r.kind] !== filter;
                          return (
                            <button
                              key={r.no}
                              type="button"
                              onClick={() => pick(r.no)}
                              aria-pressed={selected === r.no}
                              aria-label={`ห้อง ${r.no} ${KIND_LABEL[r.kind].label}`}
                              className={`flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center rounded-xl px-0.5 py-1.5 leading-tight ${TONE[r.kind]} ${selected === r.no ? "border-2 !border-accent" : "border"} ${dim ? "opacity-30" : ""}`}
                            >
                              <span className="text-base font-semibold tabular-nums">{r.no}</span>
                              <span className="text-center text-xs font-medium">{KIND_LABEL[r.kind].short}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <ul aria-label="คำอธิบายสี" className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 border-t border-line p-0 pt-3 text-[13px] text-body">
          {(Object.keys(KIND_LABEL) as Kind[]).filter((k) => present.has(k)).map((k) => (
            <li key={k} className="flex items-center gap-2">
              <span aria-hidden="true" className={`size-4 rounded border ${TONE[k]}`} />
              {KIND_LABEL[k].label}
            </li>
          ))}
        </ul>

        <p className="m-0 rounded-xl bg-cream px-4 py-3 text-sm text-body lg:hidden">
          <span className="font-semibold">ชั้นนี้ต้องอัปเดต: </span>
          {floorTodo.length === 0 ? "ไม่มีรายการค้าง" : `${floorTodo.length} ห้อง`}
          {floorTodo.length > 0 && (
            <button type="button" onClick={() => pick(floorTodo[0].no)} className="mt-2 block min-h-11 w-full cursor-pointer rounded-xl border-0 bg-accent px-4 text-[15px] font-semibold text-white">
              ดูห้องแรกที่ค้าง ({floorTodo[0].no})
            </button>
          )}
        </p>
      </section>

      <aside className="flex min-w-0 flex-col gap-4 lg:min-w-[300px] lg:flex-[320]">
        <section ref={detail} aria-live="polite" className={`${panel} flex flex-col gap-3`}>
          {room ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={h2}>ห้อง <span className="tabular-nums">{room.no}</span></h2>
                <span className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${TONE[room.kind]}`}>{KIND_LABEL[room.kind].label}</span>
              </div>
              {room.note && <p className="m-0 text-[15px] text-body">{room.note}</p>}
              {room.missing.length > 0 ? (
                <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[15px] text-body">
                  {room.missing.map((m) => <li key={m}>{m}</li>)}
                </ul>
              ) : (
                <p className="m-0 text-[15px] text-body">ไม่มีรายการค้างจากข้อมูลที่ระบบตรวจได้ตอนนี้</p>
              )}
              <Link href={room.kind === "absent" ? "/admin/rooms" : `/admin/rooms#room-${room.no}`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-[15px] font-semibold text-white no-underline hover:text-white">
                {room.kind === "absent" ? "ไปหน้าห้อง (เพิ่มห้อง)" : "ไปหน้าห้อง"}
              </Link>
            </>
          ) : (
            <>
              <h2 className={h2}>รายละเอียดห้อง</h2>
              <p className="m-0 text-[15px] text-muted">กดห้องในผังเพื่อดูสถานะและสิ่งที่ยังขาด</p>
            </>
          )}
        </section>
        {children}
      </aside>
    </div>
  );
}
