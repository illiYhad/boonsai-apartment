-- test_010_billing.sql · เทส 010_billing.sql · BEGIN … ROLLBACK (ไม่ทิ้งอะไรไว้ในฐาน)
-- วันที่: 2026-11-23 · รหัสใบ: K-BS-BILL.1a · ⚠ โคลท์เขียนไฟล์เท่านั้น · รันบนฐานในเครื่องเท่านั้น (ห้ามรันบน production)
-- ข้อมูลทั้งหมดเป็นข้อมูลปลอม/สมมติ · ห้องทดสอบใช้เลขขึ้นต้น T (T101 … T702) จึงไม่ชนห้องจริงจาก 003
-- ต้องรันหลัง 001–010 · รันด้วยสิทธิ์ postgres (สลับ role เป็น anon/authenticated ภายในไฟล์)
-- ท้ายไฟล์พิมพ์ ALL_OK หรือ FAIL

begin;

create temp table t_res (n serial primary key, name text not null, ok boolean not null, detail text);
create temp table t_fx (k text primary key, v uuid not null);

create function pg_temp.ck(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into t_res (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail); $$;

-- ------------------------------------------------------------
-- ข้อมูลปลอม
-- ------------------------------------------------------------
insert into public.room_types (id, name) values ('99999999-0000-4000-8000-000000000001', 'TEST_TYPE');

-- 84 ห้อง: 101–110 · 201–208 · 301–316 · 401–416 · 501–516 · 601–616 · 701–702 (ตามชุดเลขห้องใน Excel)
-- หมายเหตุ: rooms.floor มี CHECK 1–6 → ห้อง 701/702 ในเทสใส่ floor = 6 (ดูใบตอบ: ห้อง 7xx จริงจะ insert ไม่ผ่านถ้าไม่แก้ CHECK)
insert into public.rooms (room_number, floor, room_type_id, status)
select 'T' || n, least((n::int / 100), 6), '99999999-0000-4000-8000-000000000001', 'occupied'
from unnest(array[
  '101','102','103','104','105','106','107','108','109','110',
  '201','202','203','204','205','206','207','208',
  '301','302','303','304','305','306','307','308','309','310','311','312','313','314','315','316',
  '401','402','403','404','405','406','407','408','409','410','411','412','413','414','415','416',
  '501','502','503','504','505','506','507','508','509','510','511','512','513','514','515','516',
  '601','602','603','604','605','606','607','608','609','610','611','612','613','614','615','616',
  '701','702']) as n;

insert into t_fx values ('admin', '11111111-1111-4111-8111-111111111111'), ('nonadmin', '22222222-2222-4222-8222-222222222222');
insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'test-admin@example.invalid');
insert into public.admin_users (user_id) values ('11111111-1111-4111-8111-111111111111');

insert into public.companies (name) values ('TEST_COMPANY');
insert into public.tenants (full_name, phone, nationality) values
  ('Test Tenant One', '0800000001', 'TH'), ('Test Staff Two', '0800000002', 'TH'), ('Test Family Three', '0800000003', 'TH');

insert into public.leases (room_id, tenant_id, start_date, monthly_rent, occupancy_type, company_id)
select r.id, t.id, date '2026-01-01', 3500,
       case t.full_name when 'Test Tenant One' then 'TENANT' when 'Test Staff Two' then 'STAFF' else 'OWNER_FAMILY' end,
       case when t.full_name = 'Test Staff Two' then (select id from public.companies where name = 'TEST_COMPANY') end
from (values ('T101', 'Test Tenant One'), ('T102', 'Test Staff Two'), ('T103', 'Test Family Three')) as m(rn, tn)
join public.rooms r on r.room_number = m.rn
join public.tenants t on t.full_name = m.tn;

-- ------------------------------------------------------------
-- A) ค่าตั้งต้นและ seed
-- ------------------------------------------------------------
select pg_temp.ck('A1 seed rate_settings = 11/27/20/4',
  (select count(*) = 4 and bool_and(
     (key = 'elec_rate' and value = 11) or (key = 'elec_min_units' and value = 27)
     or (key = 'water_rate' and value = 20) or (key = 'water_min_units' and value = 4))
   from public.rate_settings));
select pg_temp.ck('A2 late_fee_per_day/due_day ไม่ถูก seed', (select count(*) = 0 from public.rate_settings where key in ('late_fee_per_day', 'due_day')));
select pg_temp.ck('A3 occupancy_charge_rules seed 3 แถว (TENANT เปิด 4 · STAFF/OWNER_FAMILY ปิด 4)',
  (select count(*) = 3
     and bool_and(case when occupancy_type = 'TENANT' then charge_rent and charge_elec and charge_water and charge_common
                       else not (charge_rent or charge_elec or charge_water or charge_common) end)
   from public.occupancy_charge_rules));
select pg_temp.ck('A4 companies ไม่ถูก seed ชื่อจริง (มีแต่ TEST_COMPANY ที่เทสสร้าง)', (select count(*) = 1 from public.companies));
select pg_temp.ck('A5 app_settings_text ว่าง (ไม่ seed ค่า ตม.30)', (select count(*) = 0 from public.app_settings_text));
select pg_temp.ck('A6 rooms ทดสอบ 84 ห้อง', (select count(*) = 84 from public.rooms where room_number like 'T%'));
select pg_temp.ck('A7 bucket boonsai-private เป็น private + mime 4 ชนิด',
  (select count(*) = 1 and bool_and(not public) and bool_and(allowed_mime_types @> array['image/jpeg','image/png','image/webp','application/pdf'])
   from storage.buckets where id = 'boonsai-private'));

-- ------------------------------------------------------------
-- B) bill_calc 84 ห้องปลอม เทียบสูตรที่คำนวณแยกในเทส (ตรงทุกสตางค์)
-- ------------------------------------------------------------
create temp table t_in as
select row_number() over (order by room_number) as i, room_number,
       (1000 + i0 * 37)::numeric as ep,
       (1000 + i0 * 37 + ((i0 * 7) % 90) + case when i0 % 5 = 0 then 0.5 else 0 end)::numeric as ec,
       (200 + i0)::numeric as wp,
       (200 + i0 + (i0 * 3) % 12)::numeric as wc,
       (case when i0 % 3 = 0 then 0 else 3500 + i0 * 10 end)::numeric as rent,
       200::numeric as cf,
       (case when i0 % 7 = 0 then 300 else 0 end)::numeric as pk,
       (case when i0 % 11 = 0 then 1000 else 0 end)::numeric as dm,
       (case when i0 % 13 = 0 then 150 else 0 end)::numeric as rf
from (select room_number, row_number() over (order by room_number) as i0 from public.rooms where room_number like 'T%') s;

-- ตัวแปร: v=1 ครบทุกสวิตช์ · v=2 STAFF/OWNER_FAMILY ปิด 4 ตัว · v=3 ปิดเฉพาะค่าเช่ากับส่วนกลาง
create temp table t_calc as
select v.v, i.i, i.room_number, i.ep, i.ec, i.wp, i.wc, i.rent, i.cf, i.pk, i.dm, i.rf, c.*
from t_in i
cross join (values (1), (2), (3)) as v(v)
cross join lateral public.bill_calc(
  i.ep, i.ec, i.wp, i.wc, i.rent, i.cf, i.pk, i.dm, i.rf,
  (select value from public.rate_settings where key = 'elec_rate'),
  (select value from public.rate_settings where key = 'elec_min_units'),
  (select value from public.rate_settings where key = 'water_rate'),
  (select value from public.rate_settings where key = 'water_min_units'),
  v.v = 1,                -- charge_rent
  v.v <> 2,               -- charge_elec
  v.v <> 2,               -- charge_water
  v.v = 1                 -- charge_common
) as c;

create temp table t_exp as
select v, i, room_number, eu, wu, ea, wa,
       ea + wa + case when v = 1 then rent + cf else 0 end + pk + dm - rf as tot
from (
  select v, i, room_number, rent, cf, pk, dm, rf,
         (ec - ep) as eu, (wc - wp) as wu,
         case when v = 2 then 0 else (case when (ec - ep) < 27 then 27 else (ec - ep) end) * 11 end as ea,
         case when v = 2 then 0 else (case when (wc - wp) < 4 then 4 else (wc - wp) end) * 20 end as wa
  from t_calc
) x;

select pg_temp.ck('B1 bill_calc ครบ 84 ห้อง × 3 ชุดสวิตช์ = 252 แถว', (select count(*) = 252 from t_calc));
select pg_temp.ck('B2 v1 (เก็บครบ) 84 ห้อง ตรงสูตรทุกสตางค์',
  (select count(*) = 84 and bool_and(c.elec_units = e.eu and c.elec_amount = e.ea and c.water_units = e.wu and c.water_amount = e.wa and c.total = e.tot)
   from t_calc c join t_exp e using (v, i) where v = 1));
select pg_temp.ck('B3 v2 (STAFF/OWNER_FAMILY ปิด 4 ตัว) 84 ห้อง: ยอดไฟ/น้ำ 0 · หน่วยยังคำนวณ · total = จอด+เสียหาย−คืน',
  (select count(*) = 84 and bool_and(c.elec_units = e.eu and c.water_units = e.wu and c.elec_amount = 0 and c.water_amount = 0 and c.total = e.tot)
   from t_calc c join t_exp e using (v, i) where v = 2));
select pg_temp.ck('B4 v3 (ปิดค่าเช่า+ส่วนกลาง เก็บไฟ/น้ำ) 84 ห้อง: total = ไฟ+น้ำ+จอด+เสียหาย−คืน',
  (select count(*) = 84 and bool_and(c.elec_amount = e.ea and c.water_amount = e.wa and c.total = e.tot)
   from t_calc c join t_exp e using (v, i) where v = 3));
select pg_temp.ck('B5 มีเคสหน่วยไฟต่ำกว่าขั้นต่ำ (<27) และพอดี 27 ในชุดข้อมูล 84 ห้อง',
  (select count(*) filter (where eu < 27) > 0 and count(*) filter (where eu = 27) > 0 from t_exp where v = 1));
select pg_temp.ck('B6 มีเคสหน่วยน้ำต่ำกว่าขั้นต่ำ (<4) ในชุดข้อมูล', (select count(*) filter (where wu < 4) > 0 from t_exp where v = 1));

-- เคสขอบ: หน่วยต่ำกว่า/พอดี/เกินขั้นต่ำ + ทศนิยม
select pg_temp.ck('B7 ไฟ 26 หน่วย → จ่ายขั้นต่ำ 27×11 = 297.00', (select elec_amount = 297 and elec_units = 26 from public.bill_calc(0, 26, 0, 10, 0, 0, 0, 0, 0, 11, 27, 20, 4)));
select pg_temp.ck('B8 ไฟ 27 หน่วย → 297.00 (พอดีขั้นต่ำ)', (select elec_amount = 297 from public.bill_calc(0, 27, 0, 10, 0, 0, 0, 0, 0, 11, 27, 20, 4)));
select pg_temp.ck('B9 ไฟ 28 หน่วย → 308.00', (select elec_amount = 308 from public.bill_calc(0, 28, 0, 10, 0, 0, 0, 0, 0, 11, 27, 20, 4)));
select pg_temp.ck('B10 ไฟ 27.5 หน่วย → 302.50', (select elec_amount = 302.50 from public.bill_calc(0, 27.5, 0, 10, 0, 0, 0, 0, 0, 11, 27, 20, 4)));
select pg_temp.ck('B11 น้ำ 3 หน่วย → ขั้นต่ำ 4×20 = 80.00', (select water_amount = 80 and water_units = 3 from public.bill_calc(0, 30, 0, 3, 0, 0, 0, 0, 0, 11, 27, 20, 4)));
select pg_temp.ck('B12 น้ำ 4 หน่วย → 80.00 · 5 หน่วย → 100.00',
  (select (select water_amount from public.bill_calc(0, 30, 0, 4, 0, 0, 0, 0, 0, 11, 27, 20, 4)) = 80
      and (select water_amount from public.bill_calc(0, 30, 0, 5, 0, 0, 0, 0, 0, 11, 27, 20, 4)) = 100));
select pg_temp.ck('B13 ตัวอย่างรวม: ไฟ 27→297 + น้ำ 4→80 + เช่า 3500 + ส่วนกลาง 200 = 4077.00',
  (select total = 4077 from public.bill_calc(0, 27, 0, 4, 3500, 200, 0, 0, 0, 11, 27, 20, 4)));
select pg_temp.ck('B14 ฟังก์ชัน bill_calc เป็น IMMUTABLE และไม่ใช่ SECURITY DEFINER',
  (select provolatile = 'i' and not prosecdef from pg_proc where oid = 'public.bill_calc(numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,boolean,boolean,boolean,boolean)'::regprocedure));

-- ------------------------------------------------------------
-- C) mask_id_number
-- ------------------------------------------------------------
select pg_temp.ck('C1 บัตร 13 หลัก → 123XXXXXXX123', public.mask_id_number('1234567890123') = '123XXXXXXX123', public.mask_id_number('1234567890123'));
select pg_temp.ck('C2 พาสปอร์ต 9 ตัว → AB1XXX567', public.mask_id_number('AB1234567') = 'AB1XXX567', public.mask_id_number('AB1234567'));
select pg_temp.ck('C3 สั้น 5 ตัว → XXXXX', public.mask_id_number('12345') = 'XXXXX');
select pg_temp.ck('C4 ยาว 6 ตัว → XXXXXX · ยาว 7 ตัว → 123X567', public.mask_id_number('123456') = 'XXXXXX' and public.mask_id_number('1234567') = '123X567');
select pg_temp.ck('C5 null → null', public.mask_id_number(null) is null);
select pg_temp.ck('C6 mask_id_number เป็น IMMUTABLE', (select provolatile = 'i' from pg_proc where oid = 'public.mask_id_number(text)'::regprocedure));

-- ------------------------------------------------------------
-- D) CHECK / UNIQUE / เงื่อนไขโครงสร้าง
-- ------------------------------------------------------------
do $$
declare ok boolean; d text; rid uuid; lid uuid;
begin
  select id into rid from public.rooms where room_number = 'T101';

  begin insert into public.meter_readings (room_id, period, kind, reading) values (rid, date '2026-10-15', 'ELEC', 100); ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ck('D1 meter_readings.period ไม่ใช่วันที่ 1 ต้อง error', ok);

  begin insert into public.meter_readings (room_id, period, kind, reading) values (rid, date '2026-10-01', 'ELEC', 100); ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('D2 meter_readings.period วันที่ 1 ผ่าน', ok, d);

  begin insert into public.meter_readings (room_id, period, kind, reading) values (rid, date '2026-10-01', 'ELEC', 101); ok := false;
  exception when unique_violation then ok := true; end;
  perform pg_temp.ck('D3 มิเตอร์ซ้ำ (ห้อง+เดือน+ชนิด) ต้อง error', ok);

  begin insert into public.meter_readings (period, kind, reading) values (date '2026-10-01', 'ELEC', 5); ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ck('D4 มิเตอร์ไม่มีทั้ง room_id และ meter_label ต้อง error', ok);

  begin insert into public.meter_readings (meter_label, period, kind, reading) values ('LAUNDRY', date '2026-10-01', 'ELEC', 35.0); ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('D5 มิเตอร์ส่วนกลาง (meter_label=LAUNDRY ไม่มีห้อง) บันทึกได้', ok, d);

  begin insert into public.meter_readings (meter_label, period, kind, reading) values ('LAUNDRY', date '2026-10-01', 'ELEC', 36.0); ok := false;
  exception when unique_violation then ok := true; end;
  perform pg_temp.ck('D6 มิเตอร์ส่วนกลางซ้ำ (label+เดือน+ชนิด) ต้อง error', ok);

  begin insert into public.leases (room_id, tenant_id, start_date, occupancy_type)
        select r.id, t.id, date '2026-02-01', 'STAFF' from public.rooms r, public.tenants t where r.room_number = 'T104' and t.full_name = 'Test Tenant One'; ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ck('D7 สัญญา STAFF ไม่ระบุบริษัท ต้อง error', ok);

  begin insert into public.leases (room_id, tenant_id, start_date)
        select r.id, t.id, date '2026-02-01' from public.rooms r, public.tenants t where r.room_number = 'T101' and t.full_name = 'Test Staff Two'; ok := false;
  exception when unique_violation then ok := true; end;
  perform pg_temp.ck('D8 หนึ่งห้องมีสัญญา ACTIVE ซ้อนไม่ได้', ok);

  begin insert into public.leases (room_id, tenant_id, start_date, occupancy_type)
        select r.id, t.id, date '2026-02-01', 'GUEST' from public.rooms r, public.tenants t where r.room_number = 'T104' and t.full_name = 'Test Tenant One'; ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ck('D9 occupancy_type นอก 3 ค่า ต้อง error', ok);

  select id into lid from public.leases l where l.room_id = rid;
  begin insert into public.bills (bill_no, lease_id, room_id, period) values ('TEST-D10', lid, rid, date '2026-10-15'); ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ck('D10 bills.period ไม่ใช่วันที่ 1 ต้อง error', ok);

  begin insert into public.bills (bill_no, lease_id, room_id, period, status) values ('TEST-D11', lid, rid, date '2026-10-01', 'PAID_X'); ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ck('D11 bills.status นอกค่าที่กำหนด ต้อง error', ok);

  begin insert into public.rate_settings (key, value) values ('bogus_key', 1); ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ck('D12 rate_settings key นอกชุดที่กำหนด ต้อง error', ok);

  begin insert into public.sensitive_access_log (action) values ('DELETE_EVERYTHING'); ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ck('D13 sensitive_access_log.action นอกชุด ต้อง error', ok);
end $$;

-- ------------------------------------------------------------
-- E) วงจรบิล: payments CHECK · ห้ามจ่าย DRAFT/VOID · trigger ล็อก ISSUED/PAID · เปลี่ยนสถานะผิดทาง
-- ------------------------------------------------------------
do $$
declare
  ok boolean; d text; rid uuid; lid uuid; b1 uuid; b2 uuid; b3 uuid; adm text; ub uuid; ts_before timestamptz;
begin
  select id into rid from public.rooms where room_number = 'T101';
  select id into lid from public.leases where room_id = rid;
  adm := (select v::text from t_fx where k = 'admin');

  insert into public.bills (bill_no, lease_id, room_id, period, elec_prev, elec_curr, elec_units, elec_amount, water_prev, water_curr, water_units, water_amount, rent, common_fee, total, rates_snapshot)
  values ('TEST-E1', lid, rid, date '2026-10-01', 100, 130, 30, 330, 50, 55, 5, 100, 3500, 200, 4130, '{"elec_rate":11,"water_rate":20}'::jsonb)
  returning id into b1;

  begin insert into public.bills (bill_no, lease_id, room_id, period) values ('TEST-E1-DUP', lid, rid, date '2026-10-01'); ok := false;
  exception when unique_violation then ok := true; end;
  perform pg_temp.ck('E0 บิลซ้ำห้อง+เดือน (ที่ไม่ VOID) ต้อง error', ok);

  -- payments
  begin insert into public.payments_bill (bill_id, method, amount) values (b1, 'CASH', 0); ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ck('E1 payments_bill amount = 0 ต้อง error', ok);
  begin insert into public.payments_bill (bill_id, method, amount) values (b1, 'CASH', -5); ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ck('E2 payments_bill amount ติดลบ ต้อง error', ok);
  begin insert into public.payments_bill (bill_id, method, amount) values (b1, 'CASH', 100); ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ck('E3 รับเงินในบิล DRAFT ต้อง error', ok);

  -- สถานะผิดทาง
  begin update public.bills set status = 'PAID' where id = b1; ok := false;
  exception when check_violation then ok := true; end;
  perform pg_temp.ck('E4 DRAFT → PAID ตรง ๆ ต้อง error', ok);

  -- DRAFT → ISSUED ผ่าน + issued_at ถูกตั้ง + updated_by ตาม auth.uid()
  perform set_config('request.jwt.claim.sub', adm, true);
  begin update public.bills set status = 'ISSUED' where id = b1; ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('E5 DRAFT → ISSUED ผ่าน', ok, d);
  select updated_by into ub from public.bills where id = b1;
  perform pg_temp.ck('E6 ISSUED: issued_at ถูกตั้ง · updated_by = ผู้ทำรายการ',
    (select issued_at is not null from public.bills where id = b1) and ub = adm::uuid, ub::text);
  perform set_config('request.jwt.claim.sub', '', true);

  -- ล็อกตัวเลขเมื่อ ISSUED
  begin update public.bills set elec_amount = 1 where id = b1; ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ck('E7 ISSUED: แก้ elec_amount ต้อง error', ok);
  begin update public.bills set total = 1 where id = b1; ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ck('E8 ISSUED: แก้ total ต้อง error', ok);
  begin update public.bills set elec_curr = 999 where id = b1; ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ck('E9 ISSUED: แก้เลขมิเตอร์ต้อง error', ok);
  begin update public.bills set rates_snapshot = '{}'::jsonb where id = b1; ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ck('E10 ISSUED: แก้ rates_snapshot ต้อง error', ok);
  begin update public.bills set rent = 1, common_fee = 1, damage_fee = 1, refund = 1 where id = b1; ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ck('E11 ISSUED: แก้ค่าเช่า/ส่วนกลาง/เสียหาย/คืนเงิน ต้อง error', ok);
  begin update public.bills set status = 'DRAFT' where id = b1; ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ck('E12 ISSUED → DRAFT ย้อนกลับ ต้อง error', ok);
  begin delete from public.bills where id = b1; ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ck('E13 ลบบิล ISSUED ต้อง error', ok);

  -- รับเงินบิล ISSUED ได้
  begin insert into public.payments_bill (bill_id, method, amount, note) values (b1, 'TRANSFER', 4130, 'test'); ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('E14 รับเงินในบิล ISSUED ผ่าน', ok, d);

  -- ISSUED → PAID ผ่าน · PAID ย้อน/แก้ไม่ได้
  begin update public.bills set status = 'PAID' where id = b1; ok := true; exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('E15 ISSUED → PAID ผ่าน', ok, d);
  begin update public.bills set status = 'ISSUED' where id = b1; ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ck('E16 PAID → ISSUED ต้อง error', ok);
  begin update public.bills set water_amount = 0 where id = b1; ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ck('E17 PAID: แก้ water_amount ต้อง error', ok);
  begin delete from public.bills where id = b1; ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ck('E18 ลบบิล PAID ต้อง error', ok);

  -- PAID → VOID ผ่าน · VOID ปิดตาย · ออกบิลใหม่ห้อง/เดือนเดิมได้หลัง VOID
  begin update public.bills set status = 'VOID' where id = b1; ok := true; exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('E19 PAID → VOID ผ่าน', ok, d);
  begin update public.bills set status = 'ISSUED' where id = b1; ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ck('E20 VOID → ISSUED ต้อง error', ok);
  begin insert into public.payments_bill (bill_id, method, amount) values (b1, 'CASH', 10); ok := false; exception when check_violation then ok := true; end;
  perform pg_temp.ck('E21 รับเงินในบิล VOID ต้อง error', ok);

  begin insert into public.bills (bill_no, lease_id, room_id, period) values ('TEST-E2', lid, rid, date '2026-10-01') returning id into b2; ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('E22 หลัง VOID ออกบิลใหม่ห้อง/เดือนเดิมได้', ok, d);

  -- DRAFT ลบได้ · DRAFT → VOID ได้ · ISSUED → VOID ได้
  begin delete from public.bills where id = b2; ok := true; exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('E23 ลบบิล DRAFT ผ่าน', ok, d);
  insert into public.bills (bill_no, lease_id, room_id, period) values ('TEST-E3', lid, rid, date '2026-11-01') returning id into b3;
  begin update public.bills set status = 'VOID' where id = b3; ok := true; exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('E24 DRAFT → VOID ผ่าน', ok, d);
  insert into public.bills (bill_no, lease_id, room_id, period, status) values ('TEST-E4', lid, rid, date '2026-12-01', 'DRAFT') returning id into b3;
  update public.bills set status = 'ISSUED' where id = b3;
  begin update public.bills set status = 'VOID' where id = b3; ok := true; exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('E25 ISSUED → VOID ผ่าน', ok, d);
end $$;

-- ------------------------------------------------------------
-- F) สิทธิ์: anon · authenticated (ไม่ใช่แอดมิน) · authenticated (แอดมิน)
-- ------------------------------------------------------------
-- เตรียมข้อมูลให้มีแถวอยู่จริง (รันในฐานะ postgres)
insert into public.sensitive_access_log (actor_id, action) values (null, 'EXPORT');

do $$
declare
  tbl text; ok boolean; d text; n bigint;
  tables text[] := array['companies','tenants','tenant_identity','leases','lease_occupants','rate_settings','occupancy_charge_rules','app_settings_text','meter_readings','bills','payments_bill','sensitive_access_log'];
begin
  -- F1: anon select ทุกตารางใหม่ ต้อง error (permission denied)
  foreach tbl in array tables loop
    begin
      execute 'set local role anon';
      execute format('select count(*) from public.%I', tbl) into n;
      ok := false; d := 'อ่านได้ ' || n || ' แถว';
    exception when insufficient_privilege then ok := true; d := null;
              when others then ok := false; d := sqlerrm; end;
    execute 'reset role';
    perform pg_temp.ck('F1 anon select ' || tbl || ' ต้อง error/ไม่ได้ข้อมูล', ok, d);
  end loop;

  -- F2: anon เรียกฟังก์ชันใหม่ ต้อง error
  begin execute 'set local role anon'; perform public.get_tenant_identity('33333333-3333-4333-8333-333333333333'); ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F2 anon เรียก get_tenant_identity ต้อง error', ok, d);
  begin execute 'set local role anon'; perform public.bill_calc(0,30,0,5,0,0,0,0,0,11,27,20,4); ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F3 anon เรียก bill_calc ต้อง error (EXECUTE เฉพาะ authenticated/service_role)', ok, d);
end $$;

do $$
declare
  ok boolean; d text; n bigint; nonadm text; tid uuid; tbl text;
  tables text[] := array['companies','tenants','tenant_identity','leases','lease_occupants','rate_settings','occupancy_charge_rules','app_settings_text','meter_readings','bills','payments_bill','sensitive_access_log'];
begin
  nonadm := (select v::text from t_fx where k = 'nonadmin');
  select id into tid from public.tenants where full_name = 'Test Tenant One';
  perform set_config('request.jwt.claim.sub', nonadm, true);

  -- F4: authenticated ที่ไม่ใช่แอดมิน: select tenant_identity ต้อง error
  begin execute 'set local role authenticated'; execute 'select count(*) from public.tenant_identity' into n; ok := false; d := 'อ่านได้';
  exception when insufficient_privilege then ok := true; d := null; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F4 authenticated (ไม่ใช่แอดมิน) select tenant_identity ต้อง error', ok, d);

  -- F5: ตารางอื่น: ได้ 0 แถว (RLS) ทั้งที่มีข้อมูลอยู่จริง
  foreach tbl in array array['companies','tenants','leases','rate_settings','occupancy_charge_rules','meter_readings','bills','payments_bill','sensitive_access_log'] loop
    begin execute 'set local role authenticated'; execute format('select count(*) from public.%I', tbl) into n; ok := (n = 0); d := n || ' แถว';
    exception when others then ok := true; d := sqlerrm; end;
    execute 'reset role';
    perform pg_temp.ck('F5 authenticated (ไม่ใช่แอดมิน) อ่าน ' || tbl || ' ได้ 0 แถวหรือ error', ok, d);
  end loop;

  -- F6: เขียนไม่ได้
  begin execute 'set local role authenticated'; insert into public.tenants (full_name) values ('Should Fail'); ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F6 authenticated (ไม่ใช่แอดมิน) insert tenants ต้อง error', ok, d);

  -- F7: update/delete sensitive_access_log ต้อง error
  begin execute 'set local role authenticated'; update public.sensitive_access_log set action = 'EXPORT'; ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F7 authenticated update sensitive_access_log ต้อง error', ok, d);
  begin execute 'set local role authenticated'; delete from public.sensitive_access_log; ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F8 authenticated delete sensitive_access_log ต้อง error', ok, d);

  -- F9: ฟังก์ชันอ่านตัวตน/เขียนตัวตน/เลขปิดบัง ที่ไม่ใช่แอดมิน ต้อง error (42501 จาก is_admin)
  begin execute 'set local role authenticated'; perform public.get_tenant_identity(tid); ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F9 ไม่ใช่แอดมิน get_tenant_identity ต้อง error', ok, d);
  begin execute 'set local role authenticated'; perform public.set_tenant_identity(tid, 'THAI_ID', '0000000000000', null, null); ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F10 ไม่ใช่แอดมิน set_tenant_identity ต้อง error', ok, d);
  begin execute 'set local role authenticated'; perform public.get_tenant_id_masked(tid); ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F11 ไม่ใช่แอดมิน get_tenant_id_masked ต้อง error', ok, d);

  -- F12: bucket private: ไม่ใช่แอดมิน insert ไม่ได้
  begin execute 'set local role authenticated'; insert into storage.objects (bucket_id, name) values ('boonsai-private', 'x.jpg'); ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F12 ไม่ใช่แอดมิน เขียนไฟล์ลง boonsai-private ต้อง error', ok, d);

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

do $$
declare
  ok boolean; d text; n bigint; n0 bigint; n1 bigint; adm text; tid uuid; r public.tenant_identity; m text; act text;
begin
  adm := (select v::text from t_fx where k = 'admin');
  select id into tid from public.tenants where full_name = 'Test Tenant One';
  perform set_config('request.jwt.claim.sub', adm, true);

  -- F13: แอดมินอ่านตารางทั่วไปได้
  begin execute 'set local role authenticated'; execute 'select count(*) from public.tenants' into n; ok := (n = 3); d := n || ' แถว';
  exception when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F13 แอดมิน select tenants ได้ 3 แถว', ok, d);

  -- F14: แอดมินก็ select tenant_identity ตรงไม่ได้
  begin execute 'set local role authenticated'; execute 'select count(*) from public.tenant_identity' into n; ok := false; d := 'อ่านได้';
  exception when insufficient_privilege then ok := true; d := null; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F14 แอดมิน select tenant_identity ตรง ๆ ต้อง error (ต้องผ่านฟังก์ชัน)', ok, d);

  -- F15: แอดมิน update/delete/insert sensitive_access_log ตรง ต้อง error
  begin execute 'set local role authenticated'; update public.sensitive_access_log set action = 'EXPORT'; ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F15 แอดมิน update sensitive_access_log ต้อง error', ok, d);
  begin execute 'set local role authenticated'; delete from public.sensitive_access_log; ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F16 แอดมิน delete sensitive_access_log ต้อง error', ok, d);
  begin execute 'set local role authenticated'; insert into public.sensitive_access_log (action) values ('EXPORT'); ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F17 แอดมิน insert sensitive_access_log ตรง ๆ ต้อง error (ลงได้ผ่านฟังก์ชันเท่านั้น)', ok, d);

  -- F18: set_tenant_identity (แอดมิน) ผ่าน + ลง log EDIT_IDENTITY
  select count(*) into n0 from public.sensitive_access_log;
  begin execute 'set local role authenticated'; perform public.set_tenant_identity(tid, 'THAI_ID', '1234567890123', date '1990-01-01', 'Test Address 1'); ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  select count(*) into n1 from public.sensitive_access_log;
  perform pg_temp.ck('F18 แอดมิน set_tenant_identity ผ่าน + ลง log 1 แถว', ok and n1 = n0 + 1, coalesce(d, n0 || '→' || n1));
  perform pg_temp.ck('F19 log แถวล่าสุด = EDIT_IDENTITY · actor = แอดมิน · tenant ตรง',
    (select action = 'EDIT_IDENTITY' and actor_id = adm::uuid and tenant_id = tid from public.sensitive_access_log order by id desc limit 1));

  -- F20: get_tenant_identity (แอดมิน) คืนแถว + ลง log VIEW_IDENTITY
  select count(*) into n0 from public.sensitive_access_log;
  begin execute 'set local role authenticated'; select * into r from public.get_tenant_identity(tid); ok := (r.id_number = '1234567890123');
  exception when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  select count(*) into n1 from public.sensitive_access_log;
  perform pg_temp.ck('F20 แอดมิน get_tenant_identity คืนข้อมูล + ลง log 1 แถว', ok and n1 = n0 + 1, coalesce(d, n0 || '→' || n1));
  perform pg_temp.ck('F21 log แถวล่าสุด = VIEW_IDENTITY',
    (select action = 'VIEW_IDENTITY' and tenant_id = tid from public.sensitive_access_log order by id desc limit 1));

  -- F22: get_tenant_id_masked (แอดมิน) คืนเลขปิดบัง + ไม่ลง log
  select count(*) into n0 from public.sensitive_access_log;
  begin execute 'set local role authenticated'; m := public.get_tenant_id_masked(tid); ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  select count(*) into n1 from public.sensitive_access_log;
  perform pg_temp.ck('F22 get_tenant_id_masked คืน 123XXXXXXX123', ok and m = '123XXXXXXX123', coalesce(d, m));
  perform pg_temp.ck('F23 get_tenant_id_masked ไม่ลง sensitive_access_log', n1 = n0, n0 || '→' || n1);

  -- F24: แอดมินอ่าน log ได้
  begin execute 'set local role authenticated'; execute 'select count(*) from public.sensitive_access_log' into n; ok := (n >= 3); d := n || ' แถว';
  exception when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F24 แอดมินอ่าน sensitive_access_log ได้', ok, d);

  -- F25: แอดมินลบ payments_bill ไม่ได้ (ไม่ให้สิทธิ์ delete) · ลบ/แก้ rate_settings ได้
  begin execute 'set local role authenticated'; delete from public.payments_bill; ok := false;
  exception when insufficient_privilege then ok := true; when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F25 แอดมินลบ payments_bill ต้อง error (ไม่มีสิทธิ์ delete)', ok, d);
  begin execute 'set local role authenticated'; update public.rate_settings set value = 11 where key = 'elec_rate'; ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F26 แอดมินแก้ rate_settings ได้', ok, d);
  begin execute 'set local role authenticated'; update public.occupancy_charge_rules set charge_elec = true where occupancy_type = 'STAFF'; ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F27 แอดมินแก้สวิตช์ occupancy_charge_rules ได้ (ไม่ต้องแก้โค้ด)', ok, d);
  begin execute 'set local role authenticated'; insert into public.app_settings_text (key, value) values ('test_key', 'test value'); ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F28 แอดมินเขียน app_settings_text ได้', ok, d);

  -- F29: แอดมินเขียนไฟล์ลง boonsai-private ได้
  begin execute 'set local role authenticated'; insert into storage.objects (bucket_id, name) values ('boonsai-private', 'test/x.jpg'); ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.ck('F29 แอดมินเขียนไฟล์ลง boonsai-private ได้', ok, d);

  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- F30: ตรวจโครงสร้างสิทธิ์จากแคตาล็อก
select pg_temp.ck('F30 anon/authenticated ไม่มี SELECT ตรงบน tenant_identity (has_table_privilege)',
  not has_table_privilege('anon', 'public.tenant_identity', 'SELECT') and not has_table_privilege('authenticated', 'public.tenant_identity', 'SELECT'));
select pg_temp.ck('F31 authenticated ไม่มี UPDATE/DELETE/INSERT บน sensitive_access_log',
  not has_table_privilege('authenticated', 'public.sensitive_access_log', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.sensitive_access_log', 'DELETE')
  and not has_table_privilege('authenticated', 'public.sensitive_access_log', 'INSERT'));
select pg_temp.ck('F32 ฟังก์ชัน SECURITY DEFINER ทุกตัวตั้ง search_path ว่าง',
  (select count(*) = 3 and bool_and(coalesce(proconfig, '{}') @> array['search_path=""'])
   from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
     and proname in ('get_tenant_identity', 'set_tenant_identity', 'get_tenant_id_masked')));
select pg_temp.ck('F33 ฟังก์ชัน SECURITY DEFINER: anon/PUBLIC ไม่มี EXECUTE · authenticated + service_role มี',
  (select bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE')
                   and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                   and has_function_privilege('service_role', p.oid, 'EXECUTE'))
   from pg_proc p where pronamespace = 'public'::regnamespace and proname in ('get_tenant_identity', 'set_tenant_identity', 'get_tenant_id_masked')));
select pg_temp.ck('F34 ทุกตารางใหม่เปิด RLS (12 ตาราง)',
  (select count(*) = 12 and bool_and(relrowsecurity) from pg_class
   where relnamespace = 'public'::regnamespace and relname in ('companies','tenants','tenant_identity','leases','lease_occupants','rate_settings','occupancy_charge_rules','app_settings_text','meter_readings','bills','payments_bill','sensitive_access_log')));
select pg_temp.ck('F35 tenant_identity ไม่มี policy (ปฏิเสธทั้งหมด) · sensitive_access_log มี policy select อย่างเดียว',
  (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename = 'tenant_identity')
  and (select count(*) = 1 and bool_and(cmd = 'SELECT') from pg_policies where schemaname = 'public' and tablename = 'sensitive_access_log'));

-- ------------------------------------------------------------
-- สรุป
-- ------------------------------------------------------------
select n, name, ok::text as ok, detail from t_res order by n;
select case when bool_and(ok) then 'ALL_OK' else 'FAIL' end as summary, count(*) as total, count(*) filter (where not ok) as failed from t_res;

rollback;
