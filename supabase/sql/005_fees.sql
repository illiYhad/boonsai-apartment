-- 005_fees.sql · ย้ายค่าส่วนกลาง/น้ำ/ไฟ/จอดรถ จากค่าคงที่ในโค้ด B1 มาเป็นคอลัมน์ใน site_settings (แอดมินแก้เองที่ /admin/prices)
-- ⚠ โคลท์เขียนไฟล์เท่านั้น ไม่ได้รัน · พี่หยัดรันหลัง 004 · รันซ้ำได้ (if not exists)
-- ค่าเริ่มต้น = ตัวเลขเดิมใน DATA_REAL (ส่วนกลาง 200 · น้ำ 20 · ไฟ 8 · จอด 1,000 บาท/คัน/เดือน · 13 ช่อง) → แถวเดิมได้ค่าเหล่านี้อัตโนมัติ
-- RLS: policy "public read" / "admin all" ของ site_settings คลุมคอลัมน์ใหม่อยู่แล้ว ไม่ต้องเพิ่ม policy

alter table site_settings
  add column if not exists common_fee numeric not null default 200 check (common_fee >= 0),
  add column if not exists water_rate numeric not null default 20 check (water_rate >= 0),
  add column if not exists electric_rate numeric not null default 8 check (electric_rate >= 0),
  add column if not exists parking_fee numeric not null default 1000 check (parking_fee >= 0),
  add column if not exists parking_slots integer not null default 13 check (parking_slots >= 0);
