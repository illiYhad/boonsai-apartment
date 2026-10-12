-- 002_rls.sql · RLS ตาม Sila v2 + QA (Q1/Q2) · รันหลัง 001
-- คนนอก (anon/authenticated ที่ไม่ใช่แอดมิน): อ่านอย่างเดียว · rooms/room_types/photos เฉพาะ is_published
-- แอดมิน: ทุกอย่างผ่าน is_admin() · inquiries: ไม่มี policy insert ให้ anon — Server Action เขียนด้วย service role เท่านั้น

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function is_admin() from public;
grant execute on function is_admin() to anon, authenticated;

alter table site_settings enable row level security;
alter table room_types enable row level security;
alter table floor_prices enable row level security;
alter table rooms enable row level security;
alter table photos enable row level security;
alter table amenities enable row level security;
alter table room_type_amenities enable row level security;
alter table pet_policy enable row level security;
alter table inquiries enable row level security;
alter table admin_users enable row level security;

-- อ่านสาธารณะ
create policy "public read site_settings" on site_settings for select using (true);
create policy "public read floor_prices" on floor_prices for select using (true);
create policy "public read amenities" on amenities for select using (true);
create policy "public read room_type_amenities" on room_type_amenities for select using (true);
create policy "public read pet_policy" on pet_policy for select using (true);
create policy "public read room_types" on room_types for select using (is_published or is_admin());
create policy "public read rooms" on rooms for select using (is_published or is_admin());
create policy "public read photos" on photos for select using (is_published or is_admin());

-- แอดมินแก้ได้ทุกตาราง
create policy "admin all site_settings" on site_settings for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin all room_types" on room_types for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin all floor_prices" on floor_prices for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin all rooms" on rooms for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin all photos" on photos for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin all amenities" on amenities for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin all room_type_amenities" on room_type_amenities for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin all pet_policy" on pet_policy for all to authenticated using (is_admin()) with check (is_admin());

-- inquiries: แอดมินอ่าน/แก้สถานะ/ลบ ได้ · ไม่มี insert policy เลย (service role ข้าม RLS)
create policy "admin read inquiries" on inquiries for select to authenticated using (is_admin());
create policy "admin update inquiries" on inquiries for update to authenticated using (is_admin()) with check (is_admin());
create policy "admin delete inquiries" on inquiries for delete to authenticated using (is_admin());

-- admin_users: แอดมินเห็นรายชื่อแอดมิน · เพิ่ม/ลบแอดมินทำใน SQL Editor โดยพี่หยัดเท่านั้น
create policy "admin read admin_users" on admin_users for select to authenticated using (is_admin());
