-- 012_parking_vehicles_rollback.sql · ย้อน 012 · K-BS-PARK.1a
-- ⚠ ลบตาราง vehicles พร้อมข้อมูลรถทั้งหมด · สำรองก่อน · คนรัน = พี่หยัด หลังให้เวก้าตรวจ
-- bucket vehicle-photos: ไม่ลบด้วย SQL (ลบไฟล์/ถังผ่านหน้า Storage ใน Supabase เท่านั้น) · ไฟล์นี้ถอดเฉพาะ policy → ถังยังเป็น private และไม่มีใครเข้าถึงผ่านเว็บ

begin;

drop policy if exists "vehicle-photos admin select" on storage.objects;
drop policy if exists "vehicle-photos admin insert" on storage.objects;
drop policy if exists "vehicle-photos admin update" on storage.objects;
drop policy if exists "vehicle-photos admin delete" on storage.objects;

drop function if exists public.parking_fee_for_room(uuid, date);
drop table if exists public.vehicles;            -- trigger + index + policy ของตารางหายพร้อมกัน
drop function if exists public.vehicles_slot_guard();

commit;
