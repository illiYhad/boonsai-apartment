-- 001_schema.sql · บุญใสอพาร์ทเม้นท์ · ตาราง + enum ตาม DATA_DRAFT_Boonsai_v2 (พี่ศิลา)
-- ⚠ โคลท์เขียนไฟล์เท่านั้น ไม่ได้รัน · พี่หยัดรันเองตาม README_ลำดับรัน.md
-- ต่างจาก v2: floor 1–6 (ตึกจริง 6 ชั้น) · amenities มี sort_order · inquiries มี ip_hash (นับ rate limit ข้าม instance) · site_settings บังคับแถวเดียวด้วย singleton

create extension if not exists pgcrypto;

do $$ begin
  create type room_status as enum ('available', 'occupied', 'maintenance');
exception when duplicate_object then null; end $$;
do $$ begin
  create type amenity_category as enum ('building', 'room', 'service');
exception when duplicate_object then null; end $$;
do $$ begin
  create type inquiry_status as enum ('new', 'contacted', 'closed');
exception when duplicate_object then null; end $$;

create table if not exists site_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  name text not null default 'บุญใสอพาร์ทเม้นท์',
  line_oa text not null default '@371dkpvl',
  phone text not null default '02-050-6449',
  address_text text not null default '',
  google_maps_url text not null default '',
  nearby_places jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists room_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  size_sqm numeric,
  deposit_amount numeric,
  water_rate numeric,
  electric_rate numeric,
  is_published boolean not null default true
);

create table if not exists floor_prices (
  floor integer not null check (floor between 1 and 6),
  room_type_id uuid not null references room_types(id) on delete cascade,
  price_per_month numeric not null check (price_per_month >= 0),
  primary key (floor, room_type_id)
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique,
  floor integer not null check (floor between 1 and 6),
  room_type_id uuid not null references room_types(id),
  price_override numeric check (price_override >= 0),
  status room_status not null default 'occupied',
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists rooms_floor_type_idx on rooms (floor, room_type_id);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  alt_text text not null default '',
  room_type_id uuid references room_types(id) on delete set null,
  sort_order integer not null default 0,
  is_published boolean not null default false
);

create table if not exists amenities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon_name text,
  category amenity_category not null default 'building',
  sort_order integer not null default 0
);

create table if not exists room_type_amenities (
  room_type_id uuid not null references room_types(id) on delete cascade,
  amenity_id uuid not null references amenities(id) on delete cascade,
  primary key (room_type_id, amenity_id)
);

create table if not exists pet_policy (
  id uuid primary key default gen_random_uuid(),
  rule_text text not null,
  extra_deposit numeric,
  allowed_types text,
  max_pets integer,
  max_weight_kg numeric
);

create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null check (char_length(guest_name) between 1 and 40),
  phone text not null check (phone ~ '^0[0-9]{8,9}$'),
  has_pet boolean not null default false,
  preferred_date date,
  status inquiry_status not null default 'new',
  consent_at timestamptz not null,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists inquiries_ip_created_idx on inquiries (ip_hash, created_at);

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- updated_at อัตโนมัติ
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists rooms_touch on rooms;
create trigger rooms_touch before update on rooms for each row execute function touch_updated_at();
drop trigger if exists site_settings_touch on site_settings;
create trigger site_settings_touch before update on site_settings for each row execute function touch_updated_at();
