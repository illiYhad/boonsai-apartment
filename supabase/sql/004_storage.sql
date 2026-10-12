-- 004_storage.sql · bucket รูป boonsai-photos · อ่านสาธารณะ เขียน/แก้/ลบ เฉพาะแอดมิน · รันหลัง 002 (ต้องมี is_admin())

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boonsai-photos', 'boonsai-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "boonsai-photos public read" on storage.objects
  for select using (bucket_id = 'boonsai-photos');
create policy "boonsai-photos admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'boonsai-photos' and public.is_admin());
create policy "boonsai-photos admin update" on storage.objects
  for update to authenticated using (bucket_id = 'boonsai-photos' and public.is_admin()) with check (bucket_id = 'boonsai-photos' and public.is_admin());
create policy "boonsai-photos admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'boonsai-photos' and public.is_admin());
