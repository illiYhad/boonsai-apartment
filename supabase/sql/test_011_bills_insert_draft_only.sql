-- test_011_bills_insert_draft_only.sql · เทส 011 · BEGIN … ROLLBACK · ข้อมูลปลอมทั้งหมด · ฐานในเครื่องเท่านั้น
-- วันที่: 2026-11-23 · รหัสใบ: K-BS-BILL.1a-011 · ⚠ โคลท์เขียนไฟล์เท่านั้น · ต้องรันหลัง 001–011
-- ท้ายไฟล์พิมพ์ ALL_OK หรือ FAIL
begin;

create temp table t_res (n serial primary key, name text not null, ok boolean not null, detail text);
create function pg_temp.ck(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into t_res (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail); $$;

insert into public.room_types (id, name) values ('99999999-0000-4000-8000-000000000011', 'TEST_TYPE_011');
insert into public.rooms (room_number, floor, room_type_id, status) values ('T011', 1, '99999999-0000-4000-8000-000000000011', 'occupied');
insert into public.tenants (full_name) values ('Test Tenant 011');
insert into public.leases (room_id, tenant_id, start_date)
select r.id, t.id, date '2026-01-01' from public.rooms r, public.tenants t where r.room_number = 'T011' and t.full_name = 'Test Tenant 011';

select pg_temp.ck('G1 มีทริกเกอร์ bills_insert_guard_trg (before insert) บน bills',
  (select count(*) = 1 from pg_trigger where tgname = 'bills_insert_guard_trg' and tgrelid = 'public.bills'::regclass and not tgisinternal and (tgtype & 4) = 4 and (tgtype & 2) = 2));
select pg_temp.ck('G2 ฟังก์ชัน bills_insert_guard ตั้ง search_path ว่าง',
  (select coalesce(proconfig, '{}') @> array['search_path=""'] from pg_proc where oid = 'public.bills_insert_guard()'::regprocedure));
select pg_temp.ck('G3 trigger ของ 010 ยังอยู่ (bills_guard_trg)', (select count(*) = 1 from pg_trigger where tgname = 'bills_guard_trg' and tgrelid = 'public.bills'::regclass));

do $$
declare ok boolean; d text; rid uuid; lid uuid; bid uuid; ia timestamptz;
begin
  select id into rid from public.rooms where room_number = 'T011';
  select id into lid from public.leases where room_id = rid;

  begin insert into public.bills (bill_no, lease_id, room_id, period) values ('T011-DRAFT', lid, rid, date '2026-10-01') returning id into bid; ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('H1 insert DRAFT (ค่าเริ่ม) ผ่าน', ok, d);

  begin insert into public.bills (bill_no, lease_id, room_id, period, status) values ('T011-ISSUED', lid, rid, date '2026-09-01', 'ISSUED'); ok := false;
  exception when check_violation then ok := true; when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('H2 insert ISSUED ต้อง error', ok, d);

  begin insert into public.bills (bill_no, lease_id, room_id, period, status) values ('T011-PAID', lid, rid, date '2026-08-01', 'PAID'); ok := false;
  exception when check_violation then ok := true; when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('H3 insert PAID ต้อง error', ok, d);

  begin insert into public.bills (bill_no, lease_id, room_id, period, status) values ('T011-VOID', lid, rid, date '2026-07-01', 'VOID'); ok := false;
  exception when check_violation then ok := true; when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('H4 insert VOID ต้อง error', ok, d);

  begin insert into public.bills (bill_no, lease_id, room_id, period, status, issued_at) values ('T011-DRAFT2', lid, rid, date '2026-06-01', 'DRAFT', now()) returning id, issued_at into bid, ia; ok := (ia is null);
  exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('H5 insert DRAFT ที่ใส่ issued_at มา → ถูกล้างเป็น null', ok, coalesce(d, ia::text));

  -- DRAFT -> ISSUED ผ่าน (trigger 010 ยังทำงาน) + issued_at ถูกตั้ง
  select id into bid from public.bills where bill_no = 'T011-DRAFT';
  begin update public.bills set status = 'ISSUED' where id = bid; ok := true;
  exception when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('H6 DRAFT → ISSUED ผ่าน', ok, d);
  perform pg_temp.ck('H7 ISSUED: issued_at ถูกตั้งโดย trigger 010', (select issued_at is not null from public.bills where id = bid));
  begin update public.bills set total = 1 where id = bid; ok := false;
  exception when check_violation then ok := true; when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('H8 ISSUED แก้ total ยัง error (ล็อกของ 010 ยังทำงาน)', ok, d);
  begin update public.bills set status = 'DRAFT' where id = bid; ok := false;
  exception when check_violation then ok := true; when others then ok := false; d := sqlerrm; end;
  perform pg_temp.ck('H9 ISSUED → DRAFT ยัง error', ok, d);
end $$;

select n, name, ok::text as ok, detail from t_res order by n;
select case when bool_and(ok) then 'ALL_OK' else 'FAIL' end as summary, count(*) as total, count(*) filter (where not ok) as failed from t_res;

rollback;
