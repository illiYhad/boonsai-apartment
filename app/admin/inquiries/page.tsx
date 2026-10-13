import { ActionForm } from "@/components/admin/ActionForm";
import { card, errorBox, h1, notice, when } from "@/components/admin/ui";
import { INQUIRY_RETENTION_DAYS, loadInquiries, type InquiryStatus } from "@/lib/admin-data";
import { setInquiryStatus } from "../actions";

const STATUS: { value: InquiryStatus; label: string; on: string }[] = [
  { value: "new", label: "ใหม่", on: "bg-accent text-white border-accent" },
  { value: "contacted", label: "ติดต่อแล้ว", on: "bg-[#B76E00] text-white border-[#B76E00]" },
  { value: "closed", label: "ปิดเรื่อง", on: "bg-[#4E5553] text-white border-[#4E5553]" },
];

export default async function InquiriesPage() {
  const { data: list, error } = await loadInquiries();
  const fresh = list.filter((i) => i.status === "new").length;

  return (
    <>
      <div>
        <h1 className={h1}>ฝากเบอร์</h1>
        <p className="mt-1 mb-0 text-sm text-muted">ใหม่ {fresh} รายการ · รายการที่ปิดเรื่องแล้วจะถูกลบเองหลัง {INQUIRY_RETENTION_DAYS} วัน</p>
      </div>
      {error && <p className={errorBox}>โหลดข้อมูลไม่สำเร็จ: {error}</p>}
      {!error && list.length === 0 && <p className={notice}>ยังไม่มีคนฝากเบอร์</p>}

      {list.map((i) => (
        <div key={i.id} className={`${card} flex flex-col gap-3 ${i.status === "closed" ? "opacity-70" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-head text-lg font-bold">{i.guest_name}</div>
              <div className="text-[13px] text-muted">ฝากเมื่อ {when(i.created_at)}</div>
            </div>
            <a href={`tel:${i.phone}`} className="inline-flex min-h-12 shrink-0 items-center rounded-xl bg-line-green px-4 text-[17px] font-bold text-white no-underline hover:text-white">
              โทร {i.phone}
            </a>
          </div>
          <div className="flex flex-wrap gap-2 text-[13px] font-semibold">
            {i.has_pet && <span className="rounded-full bg-pet px-3 py-1 text-pet-ink">มีสัตว์เลี้ยง</span>}
            {i.preferred_date && <span className="rounded-full bg-[#EEF1F0] px-3 py-1 text-[#2F3B38]">สะดวกมาดู {new Date(i.preferred_date).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" })}</span>}
            {i.status === "closed" && i.closed_at && (
              <span className="rounded-full bg-[#E6E8E7] px-3 py-1 text-[#4E5553]">
                ลบเองวันที่ {new Date(new Date(i.closed_at).getTime() + INQUIRY_RETENTION_DAYS * 86_400_000).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" })}
              </span>
            )}
          </div>
          <ActionForm action={setInquiryStatus} className="grid grid-cols-3 gap-2">
            <input type="hidden" name="id" value={i.id} />
            {STATUS.map((s) => (
              <button
                key={s.value}
                type="submit"
                name="status"
                value={s.value}
                aria-pressed={i.status === s.value}
                className={`min-h-12 cursor-pointer rounded-xl border-2 text-[15px] font-bold disabled:opacity-60 ${i.status === s.value ? s.on : "border-line-strong bg-white text-ink"}`}
              >
                {s.label}
              </button>
            ))}
          </ActionForm>
        </div>
      ))}
    </>
  );
}
