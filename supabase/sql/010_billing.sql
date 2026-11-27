-- 010_billing.sql · บุญใสอพาร์ทเม้นท์ · โครงบิลรายเดือน (ผู้เช่า · สัญญา · มิเตอร์ · บิล · การชำระ · บันทึกการเปิดดูข้อมูลอ่อนไหว)
-- วันที่: 2026-11-23 · รหัสใบ: K-BS-BILL.1a (ใบโคลท์ TO_KOLT_20261123-1918_boonsai-bill-1a-010-sql)
-- ⚠ โคลท์เขียนไฟล์เท่านั้น ไม่ได้รันบนฐานจริง · พี่หยัดรันเองหลังพี่ศิลาตรวจรอบ 2 (ใน Supabase SQL Editor)
-- ลำดับรัน: หลัง 001–009 (ต้องมี is_admin() จาก 002 · ตาราง rooms จาก 001 · touch_updated_at() จาก 001)
-- รันซ้ำได้: ใช่ (create if not exists · drop policy/trigger if exists แล้วสร้างใหม่ · seed ใช้ on conflict do nothing)
-- ย้อนกลับ: rollback_010_billing.sql (ลบทุกอย่างที่ไฟล์นี้สร้าง · ไม่แตะของเดิม)
-- แนวทาง: expand อย่างเดียว · ไม่แก้ 001–009 · ไม่แตะตาราง/คอลัมน์เดิม
-- ห้ามมีข้อมูลจริงในไฟล์นี้ (ชื่อ · เลขบัตร · เบอร์ · ที่อยู่ · ชื่อบริษัท) · ค่าตั้ง ตม.30 และรายชื่อบริษัทให้แอดมินกรอกเองในหน้าแอดมิน

-- ============================================================
-- 1) ตาราง
-- ============================================================

-- บริษัทต้นสังกัดของห้องพนักงาน (แอดมินเพิ่มเอง · ไม่ seed)
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ผู้เช่า (คน)
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  nationality text,                       -- รหัสประเทศ ISO (เช่น TH) หรือข้อความ
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- เอกสารตัวตน (แยกตาราง · ไม่ให้ authenticated select ตรง · อ่าน/เขียนผ่านฟังก์ชันที่ลง sensitive_access_log)
create table if not exists public.tenant_identity (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  id_type text not null check (id_type in ('THAI_ID', 'PASSPORT')),
  id_number text not null,
  birth_date date,
  address text,
  updated_at timestamptz not null default now()
);

-- สัญญาเช่า (ห้อง ↔ ผู้เช่า ↔ ช่วงเวลา) + ประเภทการพัก
create table if not exists public.leases (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id),
  tenant_id uuid not null references public.tenants(id),
  start_date date not null,
  end_date date,
  monthly_rent numeric(12,2) not null default 0 check (monthly_rent >= 0),
  common_fee numeric(12,2) not null default 200 check (common_fee >= 0),
  parking_fee numeric(12,2) not null default 0 check (parking_fee >= 0),
  deposit numeric(12,2) not null default 0 check (deposit >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ENDED')),
  move_out_note text,
  occupancy_type text not null default 'TENANT' check (occupancy_type in ('TENANT', 'STAFF', 'OWNER_FAMILY')),
  company_id uuid references public.companies(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leases_staff_needs_company check (occupancy_type <> 'STAFF' or company_id is not null),
  constraint leases_dates_ok check (end_date is null or end_date >= start_date)
);
create index if not exists leases_room_idx on public.leases (room_id);
create index if not exists leases_tenant_idx on public.leases (tenant_id);
-- หนึ่งห้องมีสัญญา ACTIVE ได้ทีละหนึ่ง
create unique index if not exists leases_one_active_per_room on public.leases (room_id) where status = 'ACTIVE';

-- ผู้อยู่ร่วม + รถ
create table if not exists public.lease_occupants (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.leases(id) on delete cascade,
  name text not null,
  relation text,
  vehicle_plate text
);
create index if not exists lease_occupants_lease_idx on public.lease_occupants (lease_id);

-- อัตราปัจจุบัน (ที่เดียว) · ตัวเลขล้วน
create table if not exists public.rate_settings (
  key text primary key check (key in ('elec_rate', 'elec_min_units', 'water_rate', 'water_min_units', 'late_fee_per_day', 'due_day')),
  value numeric not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- สวิตช์เก็บเงินต่อประเภทการพัก (แอดมินแก้ได้ ไม่ต้องแก้โค้ด)
create table if not exists public.occupancy_charge_rules (
  occupancy_type text primary key check (occupancy_type in ('TENANT', 'STAFF', 'OWNER_FAMILY')),
  charge_rent boolean not null default true,
  charge_elec boolean not null default true,
  charge_water boolean not null default true,
  charge_common boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ค่าตั้งที่เป็นข้อความ (เช่น ข้อมูลผู้แจ้ง ตม.30 ส่วนที่ 1) · แอดมินกรอกเองในหน้าแอดมิน · ไม่ seed
create table if not exists public.app_settings_text (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- มิเตอร์รายเดือน · room_id ว่างได้ = มิเตอร์ส่วนกลางของตึก (ใช้ meter_label) · มิเตอร์ส่วนกลางไม่ผูกบิล
create table if not exists public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id),
  meter_label text,
  period date not null,
  kind text not null check (kind in ('ELEC', 'WATER')),
  reading numeric(12,2) not null check (reading >= 0),
  photo_path text,                        -- path ใน bucket boonsai-private (ใช้จริงในใบ 1c)
  warning text check (warning in ('DECREASE', 'JUMP')),
  confirmed_by uuid,
  created_at timestamptz not null default now(),
  constraint meter_period_is_month_start check (date_trunc('month', period::timestamp)::date = period),
  constraint meter_room_or_label check (room_id is not null or meter_label is not null)
);
create unique index if not exists meter_readings_room_uq on public.meter_readings (room_id, period, kind) where room_id is not null;
create unique index if not exists meter_readings_label_uq on public.meter_readings (meter_label, period, kind) where room_id is null;

-- บิลรายเดือน (เก็บอัตราที่ใช้ไว้ในบิลเอง)
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  bill_no text not null unique,           -- รูปแบบยังรอยืนยัน (ดูใบตอบ) · ยังไม่มีฟังก์ชันออกเลข
  lease_id uuid not null references public.leases(id),
  room_id uuid not null references public.rooms(id),
  period date not null,
  elec_prev numeric(12,2),
  elec_curr numeric(12,2),
  elec_units numeric(12,2) not null default 0,
  elec_amount numeric(12,2) not null default 0,
  water_prev numeric(12,2),
  water_curr numeric(12,2),
  water_units numeric(12,2) not null default 0,
  water_amount numeric(12,2) not null default 0,
  rent numeric(12,2) not null default 0,
  common_fee numeric(12,2) not null default 0,
  parking_fee numeric(12,2) not null default 0,
  damage_fee numeric(12,2) not null default 0,
  refund numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  rates_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ISSUED', 'PAID', 'VOID')),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint bills_period_is_month_start check (date_trunc('month', period::timestamp)::date = period)
);
create unique index if not exists bills_room_period_uq on public.bills (room_id, period) where status <> 'VOID';
create index if not exists bills_lease_idx on public.bills (lease_id);

-- การชำระ
create table if not exists public.payments_bill (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id),
  method text not null check (method in ('CASH', 'TRANSFER')),
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  received_by uuid,
  note text
);
create index if not exists payments_bill_bill_idx on public.payments_bill (bill_id);

-- บันทึกการเปิดดู/แก้ข้อมูลอ่อนไหว (append-only · ไม่มี update/delete)
create table if not exists public.sensitive_access_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (action in ('VIEW_IDENTITY', 'EDIT_IDENTITY', 'EXPORT', 'PRINT_CONTRACT')),
  tenant_id uuid,                         -- ไม่ผูก fk (ลบผู้เช่าแล้ว log ต้องยังอยู่)
  at timestamptz not null default now()
);

-- ============================================================
-- 2) seed (ตัวเลข/สวิตช์เท่านั้น · ไม่มีชื่อ/ข้อมูลจริง)
-- ============================================================
-- late_fee_per_day และ due_day ไม่ seed (ยังไม่มีคำตอบจากพี่หยัด)
insert into public.rate_settings (key, value) values
  ('elec_rate', 11),
  ('elec_min_units', 27),
  ('water_rate', 20),
  ('water_min_units', 4)
on conflict (key) do nothing;

insert into public.occupancy_charge_rules (occupancy_type, charge_rent, charge_elec, charge_water, charge_common) values
  ('TENANT', true, true, true, true),
  ('STAFF', false, false, false, false),
  ('OWNER_FAMILY', false, false, false, false)
on conflict (occupancy_type) do nothing;

-- ============================================================
-- 3) ฟังก์ชัน
-- ============================================================

-- ปิดบังเลขบัตร/พาสปอร์ต: 3 ตัวหน้า + X + 3 ตัวหลัง · สั้นกว่า 7 ตัว = X ทั้งหมด
create or replace function public.mask_id_number(p_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_id is null then null
    when length(p_id) < 7 then repeat('X', length(p_id))
    else left(p_id, 3) || repeat('X', length(p_id) - 6) || right(p_id, 3)
  end;
$$;

-- สูตรคำนวณบิล (ฟังก์ชันล้วน ไม่ใช่ SECURITY DEFINER)
-- หน่วยคำนวณเสมอ · สวิตช์ปิด = ยอดเงินส่วนนั้นเป็น 0 · ขั้นต่ำ: greatest(หน่วย, ขั้นต่ำ) × อัตรา
create or replace function public.bill_calc(
  p_elec_prev numeric,
  p_elec_curr numeric,
  p_water_prev numeric,
  p_water_curr numeric,
  p_rent numeric,
  p_common_fee numeric,
  p_parking_fee numeric,
  p_damage_fee numeric,
  p_refund numeric,
  p_elec_rate numeric,
  p_elec_min_units numeric,
  p_water_rate numeric,
  p_water_min_units numeric,
  p_charge_rent boolean default true,
  p_charge_elec boolean default true,
  p_charge_water boolean default true,
  p_charge_common boolean default true
)
returns table (
  elec_units numeric,
  elec_amount numeric,
  water_units numeric,
  water_amount numeric,
  total numeric
)
language sql
immutable
set search_path = ''
as $$
  with c as (
    select
      (p_elec_curr - p_elec_prev) as eu,
      (p_water_curr - p_water_prev) as wu
  ),
  a as (
    select
      eu,
      wu,
      case when p_charge_elec then round(greatest(eu, p_elec_min_units) * p_elec_rate, 2) else 0 end as ea,
      case when p_charge_water then round(greatest(wu, p_water_min_units) * p_water_rate, 2) else 0 end as wa
    from c
  )
  select
    a.eu,
    a.ea,
    a.wu,
    a.wa,
    a.ea + a.wa
      + case when p_charge_rent then coalesce(p_rent, 0) else 0 end
      + case when p_charge_common then coalesce(p_common_fee, 0) else 0 end
      + coalesce(p_parking_fee, 0) + coalesce(p_damage_fee, 0) - coalesce(p_refund, 0)
  from a;
$$;

-- อ่านเอกสารตัวตน (ลง log ทุกครั้ง)
create or replace function public.get_tenant_identity(p_tenant_id uuid)
returns setof public.tenant_identity
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  insert into public.sensitive_access_log (actor_id, action, tenant_id)
  values (auth.uid(), 'VIEW_IDENTITY', p_tenant_id);
  return query select * from public.tenant_identity where tenant_id = p_tenant_id;
end;
$$;

-- เขียน/แก้เอกสารตัวตน (ลง log ทุกครั้ง)
create or replace function public.set_tenant_identity(
  p_tenant_id uuid,
  p_id_type text,
  p_id_number text,
  p_birth_date date,
  p_address text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  insert into public.tenant_identity (tenant_id, id_type, id_number, birth_date, address, updated_at)
  values (p_tenant_id, p_id_type, p_id_number, p_birth_date, p_address, now())
  on conflict (tenant_id) do update
    set id_type = excluded.id_type,
        id_number = excluded.id_number,
        birth_date = excluded.birth_date,
        address = excluded.address,
        updated_at = now();
  insert into public.sensitive_access_log (actor_id, action, tenant_id)
  values (auth.uid(), 'EDIT_IDENTITY', p_tenant_id);
end;
$$;

-- เลขบัตรที่ปิดบังแล้วสำหรับพิมพ์ใบแจ้งหนี้ · คืนเฉพาะค่าที่ปิดบัง · ไม่ลง log (ไม่เห็นเลขเต็ม)
create or replace function public.get_tenant_id_masked(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select public.mask_id_number(id_number) into v
  from public.tenant_identity where tenant_id = p_tenant_id;
  return v;
end;
$$;

revoke all on function public.mask_id_number(text) from public, anon;
revoke all on function public.bill_calc(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.get_tenant_identity(uuid) from public, anon;
revoke all on function public.set_tenant_identity(uuid, text, text, date, text) from public, anon;
revoke all on function public.get_tenant_id_masked(uuid) from public, anon;
grant execute on function public.mask_id_number(text) to authenticated, service_role;
grant execute on function public.bill_calc(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean, boolean, boolean, boolean) to authenticated, service_role;
grant execute on function public.get_tenant_identity(uuid) to authenticated, service_role;
grant execute on function public.set_tenant_identity(uuid, text, text, date, text) to authenticated, service_role;
grant execute on function public.get_tenant_id_masked(uuid) to authenticated, service_role;

-- ============================================================
-- 4) trigger
-- ============================================================

-- บิล: ISSUED/PAID ล็อกตัวเลข · เปลี่ยนสถานะได้เฉพาะ DRAFT→ISSUED/VOID · ISSUED→PAID/VOID · PAID→VOID · VOID ปิดตาย · ลบได้เฉพาะ DRAFT
create or replace function public.bills_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT' then
      raise exception 'bill % is % : only DRAFT can be deleted (use VOID)', old.bill_no, old.status using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status = 'VOID' then
    raise exception 'bill % is VOID : no further changes', old.bill_no using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'DRAFT' and new.status in ('ISSUED', 'VOID'))
      or (old.status = 'ISSUED' and new.status in ('PAID', 'VOID'))
      or (old.status = 'PAID' and new.status = 'VOID')
    ) then
      raise exception 'bill % : status change % -> % not allowed', old.bill_no, old.status, new.status using errcode = '23514';
    end if;
  end if;

  if old.status in ('ISSUED', 'PAID') then
    if (new.bill_no, new.lease_id, new.room_id, new.period,
        new.elec_prev, new.elec_curr, new.elec_units, new.elec_amount,
        new.water_prev, new.water_curr, new.water_units, new.water_amount,
        new.rent, new.common_fee, new.parking_fee, new.damage_fee, new.refund,
        new.total, new.rates_snapshot, new.issued_at)
       is distinct from
       (old.bill_no, old.lease_id, old.room_id, old.period,
        old.elec_prev, old.elec_curr, old.elec_units, old.elec_amount,
        old.water_prev, old.water_curr, old.water_units, old.water_amount,
        old.rent, old.common_fee, old.parking_fee, old.damage_fee, old.refund,
        old.total, old.rates_snapshot, old.issued_at)
    then
      raise exception 'bill % is % : amounts/units/meters/rates are locked (VOID and re-issue)', old.bill_no, old.status using errcode = '23514';
    end if;
  end if;

  if old.status = 'DRAFT' and new.status = 'ISSUED' and new.issued_at is null then
    new.issued_at := now();
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists bills_guard_trg on public.bills;
create trigger bills_guard_trg
  before update or delete on public.bills
  for each row execute function public.bills_guard();

-- การชำระ: รับได้เฉพาะบิล ISSUED/PAID
create or replace function public.payments_bill_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select status into v_status from public.bills where id = new.bill_id;
  if v_status is null or v_status not in ('ISSUED', 'PAID') then
    raise exception 'payment not allowed: bill status is %', coalesce(v_status, 'NOT FOUND') using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_bill_guard_trg on public.payments_bill;
create trigger payments_bill_guard_trg
  before insert or update on public.payments_bill
  for each row execute function public.payments_bill_guard();

-- updated_at อัตโนมัติ (ใช้ touch_updated_at() เดิมจาก 001)
drop trigger if exists tenants_touch on public.tenants;
create trigger tenants_touch before update on public.tenants for each row execute function public.touch_updated_at();
drop trigger if exists leases_touch on public.leases;
create trigger leases_touch before update on public.leases for each row execute function public.touch_updated_at();
drop trigger if exists rate_settings_touch on public.rate_settings;
create trigger rate_settings_touch before update on public.rate_settings for each row execute function public.touch_updated_at();
drop trigger if exists occupancy_charge_rules_touch on public.occupancy_charge_rules;
create trigger occupancy_charge_rules_touch before update on public.occupancy_charge_rules for each row execute function public.touch_updated_at();
drop trigger if exists app_settings_text_touch on public.app_settings_text;
create trigger app_settings_text_touch before update on public.app_settings_text for each row execute function public.touch_updated_at();

-- ============================================================
-- 5) สิทธิ์ตาราง + RLS (เงื่อนไขพี่ศิลา ①)
-- ============================================================
revoke all on table
  public.companies, public.tenants, public.tenant_identity, public.leases, public.lease_occupants,
  public.rate_settings, public.occupancy_charge_rules, public.app_settings_text,
  public.meter_readings, public.bills, public.payments_bill, public.sensitive_access_log
from public, anon, authenticated;

-- แอดมิน (authenticated + is_admin() ใน policy) ทำได้เท่าที่จำเป็น
grant select, insert, update, delete on table
  public.companies, public.tenants, public.leases, public.lease_occupants,
  public.rate_settings, public.occupancy_charge_rules, public.app_settings_text, public.meter_readings
to authenticated;
grant select, insert, update, delete on table public.bills to authenticated;   -- ลบได้เฉพาะ DRAFT (trigger)
grant select, insert, update on table public.payments_bill to authenticated;    -- ไม่ให้ลบการรับเงิน
grant select on table public.sensitive_access_log to authenticated;             -- ห้าม insert/update/delete ตรง
-- tenant_identity: ไม่ให้ authenticated สิทธิ์ใดเลย (เข้าผ่านฟังก์ชันเท่านั้น)

alter table public.companies enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_identity enable row level security;
alter table public.leases enable row level security;
alter table public.lease_occupants enable row level security;
alter table public.rate_settings enable row level security;
alter table public.occupancy_charge_rules enable row level security;
alter table public.app_settings_text enable row level security;
alter table public.meter_readings enable row level security;
alter table public.bills enable row level security;
alter table public.payments_bill enable row level security;
alter table public.sensitive_access_log enable row level security;

drop policy if exists "admin all companies" on public.companies;
create policy "admin all companies" on public.companies for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin all tenants" on public.tenants;
create policy "admin all tenants" on public.tenants for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin all leases" on public.leases;
create policy "admin all leases" on public.leases for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin all lease_occupants" on public.lease_occupants;
create policy "admin all lease_occupants" on public.lease_occupants for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin all rate_settings" on public.rate_settings;
create policy "admin all rate_settings" on public.rate_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin all occupancy_charge_rules" on public.occupancy_charge_rules;
create policy "admin all occupancy_charge_rules" on public.occupancy_charge_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin all app_settings_text" on public.app_settings_text;
create policy "admin all app_settings_text" on public.app_settings_text for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin all meter_readings" on public.meter_readings;
create policy "admin all meter_readings" on public.meter_readings for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin all bills" on public.bills;
create policy "admin all bills" on public.bills for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin all payments_bill" on public.payments_bill;
create policy "admin all payments_bill" on public.payments_bill for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- tenant_identity: เปิด RLS ไว้และไม่มี policy เลย = ปฏิเสธทุกคนที่ไม่ใช่เจ้าของฟังก์ชัน
-- sensitive_access_log: แอดมินอ่านได้อย่างเดียว · ไม่มี policy insert/update/delete
drop policy if exists "admin read sensitive_access_log" on public.sensitive_access_log;
create policy "admin read sensitive_access_log" on public.sensitive_access_log for select to authenticated using (public.is_admin());

-- ============================================================
-- 6) bucket private สำหรับรูปมิเตอร์/เอกสารสแกน (ใช้จริงในใบ 1c / 1d) · แอดมินเท่านั้น · เปิดดูผ่าน signed URL
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boonsai-private', 'boonsai-private', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "boonsai-private admin select" on storage.objects;
create policy "boonsai-private admin select" on storage.objects
  for select to authenticated using (bucket_id = 'boonsai-private' and public.is_admin());
drop policy if exists "boonsai-private admin insert" on storage.objects;
create policy "boonsai-private admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'boonsai-private' and public.is_admin());
drop policy if exists "boonsai-private admin update" on storage.objects;
create policy "boonsai-private admin update" on storage.objects
  for update to authenticated using (bucket_id = 'boonsai-private' and public.is_admin()) with check (bucket_id = 'boonsai-private' and public.is_admin());
drop policy if exists "boonsai-private admin delete" on storage.objects;
create policy "boonsai-private admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'boonsai-private' and public.is_admin());
