# ลำดับรัน SQL · บุญใสอพาร์ทเม้นท์

> **พี่หยัดรันเองเท่านั้น** (โคลท์เขียนไฟล์ ไม่ได้รัน) · Supabase project ใหม่ของบุญใส (ห้ามรันใน praksa-esports-2026)

| ลำดับ | ไฟล์ | ทำอะไร |
|---|---|---|
| 1 | `001_schema.sql` | enum 3 ตัว + ตาราง 10 ตาราง + trigger updated_at |
| 2 | `002_rls.sql` | `is_admin()` (SECURITY DEFINER) + เปิด RLS + policy ทุกตาราง |
| 3 | `003_seed.sql` | ข้อมูลจาก DATA_REAL_Boonsai_v1 (ตั้งค่าเว็บ · 3 ประเภทห้อง · ราคา 8 แถว · ห้องว่าง 14 ห้อง · สิ่งอำนวยความสะดวก 7 · กฎสัตว์) |
| 4 | `004_storage.sql` | bucket `boonsai-photos` (อ่านสาธารณะ · เขียนเฉพาะแอดมิน) |
| 5 | `005_fees.sql` | (B2) คอลัมน์ค่าส่วนกลาง/น้ำ/ไฟ/จอดรถ/จำนวนช่องจอด ใน `site_settings` · ค่าเริ่มต้นตรงกับ DATA_REAL |
| 6 | `006_inquiry_closed_at.sql` | (B2) คอลัมน์ `closed_at` ใน `inquiries` ไว้ลบอัตโนมัติ 90 วันหลังปิดเรื่อง |
| 7 | `007_map_pin.sql` | (B3) หมุดแผนที่ตึกจริง `map_lat`/`map_lng` + ลิงก์ Google Maps ใหม่ · **ต้องรันก่อนเปิดเว็บที่ต่อ DB** |
| 8 | `008_pet_fee.sql` | (B4) ค่าสัตว์ตัวที่ 3 ขึ้นไป +500 บาท/ตัว จ่ายครั้งเดียว (`extra_deposit`=500 + แก้ข้อความกฎ) · ไม่เพิ่มคอลัมน์ ไม่ต้องรันก่อน deploy |
| 9 | `009_electric_11.sql` | (B5) ค่าไฟ 11 บาท/หน่วย (`site_settings.electric_rate`) · ไม่เพิ่มคอลัมน์ ไม่ต้องรันก่อน deploy |

วิธีรัน: Supabase Dashboard → SQL Editor → วางทีละไฟล์ตามลำดับ → Run · 001/003 รันซ้ำได้ (if not exists / on conflict) · **002 และ 004 รันซ้ำจะ error เพราะ policy ซ้ำ** (ไม่เสียหาย แต่ไม่ต้องรันซ้ำ)

## หลังรัน
1. สร้างผู้ใช้แอดมิน (Authentication → Users → Add user · email/password) แล้วรัน:
   ```sql
   insert into admin_users (user_id) select id from auth.users where email = '<อีเมลพี่ไอซ์>';
   ```
2. ตั้ง env บน Vercel: `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` (ใช้แค่บันทึกฟอร์มฝากเบอร์)
3. ตรวจ: เปิดเว็บ → การ์ดห้องต้องเหมือนโหมด seed (ชั้น 4 Full Unit ว่าง 2 · ชั้น 1–3 เต็ม) · ฝากเบอร์ 1 ครั้ง → มีแถวใน `inquiries`

## เช็ค RLS เร็ว ๆ (SQL Editor · role anon)
```sql
set role anon;
select count(*) from rooms;          -- 14
insert into inquiries (guest_name, phone, consent_at) values ('x', '0812345678', now());  -- ต้อง error (ไม่มี policy)
select count(*) from inquiries;      -- 0 (อ่านไม่ได้)
reset role;
```

## รอพี่ไอซ์ (ยังไม่อยู่ใน seed)
อำเภอในที่อยู่ · เลขห้องว่างชั้น 4 ห้องเปล่า 2 ห้อง · ห้องที่เต็มทั้งหมด (เลขห้อง) · รายวัน 750 / +300 / แนะนำเพื่อน 500 · ขนาดห้อง · ค่ามัดจำ
