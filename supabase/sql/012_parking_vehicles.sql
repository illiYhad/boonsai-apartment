-- 012_parking_vehicles.sql · บุญใสอพาร์ทเม้นท์ · ข้อมูลรถ + ที่จอด + ค่าจอดสำหรับบิล
-- วันที่: 2026-11-26 · รหัสใบ: K-BS-PARK.1a · สเปกเซ็นครบ 3 คน 2026-11-25 11:09 (FROM_SILA_20261125-1109)
-- ⚠ โคลท์เขียนไฟล์เท่านั้น ไม่ได้รันบนฐานจริง · พี่หยัดรันเองหลังพี่ศิลาตรวจไฟล์
-- ลำดับรัน: หลัง 010_billing.sql และ 011 (ต้องมี leases · site_settings.parking_slots จาก 005 · is_admin() จาก 002 · touch_updated_at() จาก 001)
-- รันซ้ำได้: ใช่ · ย้อนกลับ: 012_parking_vehicles_rollback.sql · ทดสอบ (ฐานในเครื่อง): TEST_012_local.sql
-- แนวทาง: expand อย่างเดียว · ไม่แก้ 001–011 · ไม่ seed ข้อมูลรถ

begin;

do $$
begin
  if to_regclass('public.leases') is null then
    raise exception 'ยังไม่ได้รัน 010 (ไม่มีตาราง leases) · หยุด';
  end if;
end $$;

-- ============================================================
-- 1) ตาราง (สเปก 3.1 + คำตัดสินข้อ 1–2)
-- ============================================================
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id),
  lease_id uuid references public.leases(id) on delete set null,
  brand text,
  model text,
  color text,
  plate text not null check (btrim(plate) <> ''),
  plate_province text,
  lot_code text,                          -- เช่น P01 · ว่างได้ (ยังไม่กำหนดล็อก)
  photo_path text,                        -- path ใน bucket vehicle-photos
  monthly_fee numeric(12,2),              -- ว่าง = ใช้ site_settings.parking_fee
  started_at date not null default current_date,
  ended_at date,                          -- ว่าง = ยังจอดอยู่ (active)
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_monthly_fee_ok check (monthly_fee is null or monthly_fee >= 0),
  constraint vehicles_dates_ok check (ended_at is null or ended_at >= started_at),
  -- กันล็อกเดียวกันหลุดดัชนีเพราะพิมพ์ต่างกัน ('p01' / 'P01 ')
  constraint vehicles_lot_code_ok check (lot_code is null or (lot_code <> '' and lot_code = upper(btrim(lot_code))))
);
create index if not exists vehicles_room_idx on public.vehicles (room_id);
create unique index if not exists vehicles_lot_active_uq on public.vehicles (lot_code) where ended_at is null;

-- ============================================================
-- 2) trigger: รถ active ไม่เกิน site_settings.parking_slots
-- ============================================================
create or replace function public.vehicles_slot_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_slots int;
  v_active int;
begin
  if new.ended_at is not null then
    return new;
  end if;
  -- ตรวจเฉพาะตอน "กลายเป็น active" (เพิ่มคันใหม่ หรือเปิดคันที่ย้ายออกแล้วกลับมา) · แก้ข้อมูลคันที่จอดอยู่ได้เสมอ
  if tg_op = 'UPDATE' then
    if old.ended_at is null then
      return new;
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('boonsai_parking_slots'));  -- กันเพิ่มพร้อมกันสองรายการ
  select s.parking_slots into v_slots from public.site_settings s limit 1;
  select count(*) into v_active from public.vehicles v where v.ended_at is null and v.id <> new.id;
  if v_active >= coalesce(v_slots, 0) then
    raise exception 'ที่จอดรถเต็ม: ใช้อยู่ % จาก % ช่อง', v_active, coalesce(v_slots, 0) using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_slot_guard_trg on public.vehicles;
create trigger vehicles_slot_guard_trg
  before insert or update on public.vehicles
  for each row execute function public.vehicles_slot_guard();

drop trigger if exists vehicles_touch on public.vehicles;
create trigger vehicles_touch before update on public.vehicles for each row execute function public.touch_updated_at();

-- ============================================================
-- 3) ค่าจอดสำหรับบิล (คำตัดสินข้อ 4–5)
-- ============================================================
-- ผลรวมของรถที่ active ในเดือนนั้นของห้อง × (monthly_fee ของคัน หรือ site_settings.parking_fee)
-- "active ในเดือน" = เริ่มจอดไม่เกินวันสิ้นเดือน และยังไม่ย้ายออก หรือย้ายออกตั้งแต่วันที่ 1 ของเดือนเป็นต้นไป · ไม่เฉลี่ยตามวัน
-- ตัวคิดบิลต้องส่งค่านี้เป็น p_parking_fee ของ bill_calc และ "ห้ามบวก leases.parking_fee เพิ่ม"
create or replace function public.parking_fee_for_room(p_room_id uuid, p_period date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(coalesce(v.monthly_fee, (select s.parking_fee from public.site_settings s limit 1))), 0)::numeric(12,2)
  from public.vehicles v
  where v.room_id = p_room_id
    and v.started_at < (date_trunc('month', p_period::timestamp) + interval '1 month')::date
    and (v.ended_at is null or v.ended_at >= date_trunc('month', p_period::timestamp)::date);
$$;

revoke all on function public.vehicles_slot_guard() from public, anon, authenticated;
revoke all on function public.parking_fee_for_room(uuid, date) from public, anon;
grant execute on function public.parking_fee_for_room(uuid, date) to authenticated, service_role;

-- ============================================================
-- 4) สิทธิ์ตาราง + RLS (คำตัดสินข้อ 1)
-- ============================================================
revoke all on table public.vehicles from public, anon, authenticated;
grant select, insert, update, delete on table public.vehicles to authenticated;  -- ลบ = ใช้ตอนครบกำหนดเก็บข้อมูล
alter table public.vehicles enable row level security;
drop policy if exists "admin all vehicles" on public.vehicles;
create policy "admin all vehicles" on public.vehicles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 5) bucket รูปรถ (คำตัดสินข้อ 3) · private · แอดมินเท่านั้น
-- ============================================================
-- ฝั่งแอป (ใบถัดไป): เปิดรูปผ่าน signed URL อายุไม่เกิน 300 วินาที · ลบข้อมูลและรูปเมื่อครบ 3 ปีหลังย้ายออก (ไฟล์นี้ไม่ได้ทำตัวลบอัตโนมัติ)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-photos', 'vehicle-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "vehicle-photos admin select" on storage.objects;
create policy "vehicle-photos admin select" on storage.objects
  for select to authenticated using (bucket_id = 'vehicle-photos' and public.is_admin());
drop policy if exists "vehicle-photos admin insert" on storage.objects;
create policy "vehicle-photos admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'vehicle-photos' and public.is_admin());
drop policy if exists "vehicle-photos admin update" on storage.objects;
create policy "vehicle-photos admin update" on storage.objects
  for update to authenticated using (bucket_id = 'vehicle-photos' and public.is_admin()) with check (bucket_id = 'vehicle-photos' and public.is_admin());
drop policy if exists "vehicle-photos admin delete" on storage.objects;
create policy "vehicle-photos admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'vehicle-photos' and public.is_admin());

commit;
