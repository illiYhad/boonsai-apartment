-- 007_map_pin.sql · หมุดแผนที่ตึกจริง (Google Place "บุญใส อพาร์ทเม้นท์") แทนการค้นจากที่อยู่
-- ⚠ โคลท์เขียนไฟล์เท่านั้น ไม่ได้รัน · พี่หยัดรันหลัง 006 · รันซ้ำได้ (ผลเหมือนเดิม)
-- ต้องรันก่อนเปิดเว็บที่ต่อ DB: หน้า / select map_lat, map_lng ถ้าคอลัมน์ยังไม่มีจะ error
-- RLS: policy ของ site_settings คลุมคอลัมน์ใหม่อยู่แล้ว (public read · admin all)

alter table site_settings
  add column if not exists map_lat numeric,
  add column if not exists map_lng numeric;

update site_settings
set map_lat = 13.6356438,
    map_lng = 100.5943656,
    google_maps_url = 'https://maps.app.goo.gl/LE14ijHxav1jwxNUA';
