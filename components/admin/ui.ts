// คลาส Tailwind ร่วมของหลังบ้าน — ปุ่ม/ช่องกรอกสูง ≥ 44px (min-h-11) ใช้ได้ที่จอ 390px
export const card = "rounded-[18px] bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)]";
export const field = "min-h-11 w-full min-w-0 rounded-[10px] border border-line-strong bg-white px-3 text-base font-[inherit]";
export const label = "flex min-w-0 flex-col gap-1 text-[13px] font-medium text-muted";
export const btn = "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border border-line-strong bg-white px-4 text-[15px] font-semibold text-ink no-underline disabled:opacity-60";
export const btnPrimary = "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border-0 bg-accent px-5 text-[15px] font-semibold text-white no-underline disabled:opacity-60";
export const h1 = "m-0 font-head text-2xl font-bold";
export const notice = "m-0 rounded-xl bg-[#EEF1F0] px-4 py-3 text-sm text-[#2F3B38]";
export const errorBox = "m-0 rounded-xl bg-[#FBE4E4] px-4 py-3 text-sm text-[#7A1A1A]";

export const baht = (n: number) => Number(n).toLocaleString("en-US");
export const when = (iso: string) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(iso));
