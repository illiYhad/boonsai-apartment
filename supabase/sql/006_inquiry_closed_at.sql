-- 006_inquiry_closed_at.sql · เวลาที่ปิดเรื่อง ไว้ลบรายการฝากเบอร์อัตโนมัติ 90 วันหลังปิด (PDPA)
-- ⚠ โคลท์เขียนไฟล์เท่านั้น ไม่ได้รัน · พี่หยัดรันหลัง 005 · รันซ้ำได้
-- หน้า /admin/inquiries ตั้งค่า closed_at เมื่อกด "ปิดเรื่อง" และลบแถว closed เกิน 90 วันตอนเปิดหน้า (ผ่าน policy "admin delete inquiries" เดิม)

alter table inquiries add column if not exists closed_at timestamptz;
create index if not exists inquiries_closed_idx on inquiries (status, closed_at);
