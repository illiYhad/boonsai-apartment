-- rollback_010_billing.sql · ย้อน 010_billing.sql ทั้งหมด (ลบเฉพาะสิ่งที่ 010 สร้าง · ไม่แตะของเดิม 001–009)
-- วันที่: 2026-11-23 · รหัสใบ: K-BS-BILL.1a · ⚠ โคลท์เขียนไฟล์เท่านั้น ไม่ได้รัน
-- ⚠ ลบตารางบิล/สัญญา/ผู้เช่า/มิเตอร์ทั้งหมด พร้อมข้อมูลในตาราง · สำรองก่อนรันถ้ามีข้อมูลจริงแล้ว
-- รันซ้ำได้: ใช่ (drop ... if exists)

-- policy ของ bucket private
drop policy if exists "boonsai-private admin select" on storage.objects;
drop policy if exists "boonsai-private admin insert" on storage.objects;
drop policy if exists "boonsai-private admin update" on storage.objects;
drop policy if exists "boonsai-private admin delete" on storage.objects;

-- bucket: Supabase รุ่นใหม่ห้ามลบด้วย SQL ตรง ๆ ถ้ามีไฟล์/ถูกป้องกัน → ลบผ่านหน้า Storage ของ Dashboard แทน
do $$
begin
  delete from storage.buckets where id = 'boonsai-private';
exception when others then
  raise notice 'bucket boonsai-private not deleted by SQL (%). Delete it in Dashboard > Storage.', sqlerrm;
end $$;

-- trigger: ไม่ต้องสั่งลบแยก · trigger ของ bills/payments_bill ไปพร้อมฟังก์ชัน (cascade เฉพาะ trigger) · trigger updated_at ไปพร้อมตาราง

-- ฟังก์ชัน (ต้องลบก่อนตาราง เพราะ get_tenant_identity ใช้ชนิดแถวของ tenant_identity)
drop function if exists public.payments_bill_guard() cascade;
drop function if exists public.bills_guard() cascade;
drop function if exists public.get_tenant_id_masked(uuid);
drop function if exists public.set_tenant_identity(uuid, text, text, date, text);
drop function if exists public.get_tenant_identity(uuid);
drop function if exists public.bill_calc(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean, boolean, boolean, boolean);
drop function if exists public.mask_id_number(text);

-- ตาราง (ลำดับย้อน · policy ถูกลบไปกับตาราง)
drop table if exists public.payments_bill;
drop table if exists public.bills;
drop table if exists public.meter_readings;
drop table if exists public.lease_occupants;
drop table if exists public.leases;
drop table if exists public.occupancy_charge_rules;
drop table if exists public.rate_settings;
drop table if exists public.app_settings_text;
drop table if exists public.sensitive_access_log;
drop table if exists public.tenant_identity;
drop table if exists public.tenants;
drop table if exists public.companies;
