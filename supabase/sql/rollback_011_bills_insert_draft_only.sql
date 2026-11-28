-- rollback_011_bills_insert_draft_only.sql · ย้อน 011 (ลบเฉพาะ trigger + ฟังก์ชันของ 011 · ไม่แตะ 010)
-- วันที่: 2026-11-23 · รหัสใบ: K-BS-BILL.1a-011 · ⚠ โคลท์เขียนไฟล์เท่านั้น ไม่ได้รัน
-- รันซ้ำได้: ใช่ · ไม่ error แม้ไม่มีตาราง bills (cascade ลบเฉพาะ trigger ที่ผูกกับฟังก์ชันนี้)
drop function if exists public.bills_insert_guard() cascade;
