// ตรวจฟอร์มฝากเบอร์ + จำกัดจำนวนครั้ง (ใช้ใน app/actions.ts) — แยกไว้ให้ทดสอบได้โดยไม่ต้องมี Next

export type InquiryInput = { guest_name: string; phone: string; preferred_date: string | null; has_pet: boolean };
export type InquiryState = { ok: boolean; message: string; testMode?: boolean } | null;

export const NAME_MAX = 40;
export const RATE_LIMIT = 3;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

/** เบอร์ไทย 9–10 หลัก ขึ้นต้นด้วย 0 (ตัดขีด/ช่องว่างก่อน) */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  return /^0\d{8,9}$/.test(digits) ? digits : null;
}

export function validateInquiry(form: FormData): { ok: true; value: InquiryInput } | { ok: false; message: string } {
  const name = String(form.get("guest_name") ?? "").trim();
  if (!name) return { ok: false, message: "กรุณากรอกชื่อเล่น" };
  if ([...name].length > NAME_MAX) return { ok: false, message: `ชื่อยาวได้ไม่เกิน ${NAME_MAX} ตัวอักษร` };

  const phone = normalizePhone(String(form.get("phone") ?? ""));
  if (!phone) return { ok: false, message: "เบอร์โทรไม่ถูกต้อง (ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0)" };

  if (form.get("consent") !== "on") return { ok: false, message: "กรุณาติ๊กยินยอมให้ใช้ข้อมูลเพื่อติดต่อกลับ" };

  const dateRaw = String(form.get("preferred_date") ?? "").trim();
  let preferred_date: string | null = null;
  if (dateRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw) || Number.isNaN(Date.parse(dateRaw))) return { ok: false, message: "วันที่ไม่ถูกต้อง" };
    preferred_date = dateRaw;
  }
  return { ok: true, value: { guest_name: name, phone, preferred_date, has_pet: form.get("has_pet") === "on" } };
}

// จำกัดในหน่วยความจำ (ใช้ได้ทั้งโหมดทดสอบและ DB) · บน serverless แต่ละ instance นับแยก → โหมด DB นับซ้ำจากตาราง inquiries อีกชั้น
const hits = new Map<string, number[]>();

/** true = ยังส่งได้ (และนับครั้งนี้แล้ว) · false = เกินโควตา */
export function takeRateSlot(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
