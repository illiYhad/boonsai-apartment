-- 011_bills_insert_draft_only.sql · บุญใสอพาร์ทเม้นท์ · บังคับบิลใหม่ต้องเป็น DRAFT (insert เป็น ISSUED/PAID/VOID ตรง ๆ ไม่ได้)
-- วันที่: 2026-11-23 · รหัสใบ: K-BS-BILL.1a-011 (ใบโคลท์ TO_KOLT_20261123-2102_boonsai-bill-1a-011-insert-draft-only · อลิส 20:33 ข้อ 3)
-- ⚠ โคลท์เขียนไฟล์เท่านั้น ไม่ได้รันบนฐานจริง · พี่หยัดรันเองหลังพี่ศิลาตรวจรอบ 2 พร้อม 010
-- ลำดับรัน: หลัง 010_billing.sql (ต้องมีตาราง public.bills) · ไม่แก้ 010 · ไม่แตะ rooms
-- รันซ้ำได้: ใช่ (create or replace · drop trigger if exists แล้วสร้างใหม่)
-- ย้อนกลับ: rollback_011_bills_insert_draft_only.sql
-- เหตุผล: trigger ใน 010 (bills_guard_trg) คุมเฉพาะ UPDATE/DELETE · ถ้า insert บิลเป็น ISSUED/PAID ตรง ๆ จะข้ามการล็อกและ issued_at ที่ระบบตั้งให้

create or replace function public.bills_insert_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'DRAFT' then
    raise exception 'new bill must be DRAFT (got %): issue it by updating status DRAFT -> ISSUED', new.status using errcode = '23514';
  end if;
  new.issued_at := null;   -- issued_at ตั้งโดย bills_guard ตอน DRAFT -> ISSUED เท่านั้น
  return new;
end;
$$;

drop trigger if exists bills_insert_guard_trg on public.bills;
create trigger bills_insert_guard_trg
  before insert on public.bills
  for each row execute function public.bills_insert_guard();
