-- TEST_012_local.sql · K-BS-PARK.1a · ชุดทดสอบ 012
-- ⚠ รันบน "ฐานในเครื่อง" เท่านั้น · ห้ามรันบนฐานจริง · ต้องรัน 001–012 ก่อน
-- สร้างข้อมูลทดสอบเอง · อยู่ใน transaction เดียวแล้ว ROLLBACK ท้ายไฟล์
-- ผล: ตารางท้ายไฟล์ 17 แถว · ok = true ทุกแถว

begin;

create temp table _t012 (n int generated always as identity, "case" text, got text, ok boolean) on commit drop;

do $$
declare
  v_type uuid;
  v_room uuid;
  v_room2 uuid;
  v_first uuid;
  v_ended uuid;
  v_sum numeric;
  v_total numeric;
  v_err text;
  v_n int;
  i int;
begin
  -- พักรถเดิมในฐานในเครื่องไว้ (ถูก rollback) แล้วตั้ง 13 ช่อง + ค่าจอดกลาง 1000
  update public.vehicles set ended_at = started_at where ended_at is null;
  update public.site_settings set parking_slots = 13, parking_fee = 1000;
  select id into v_type from public.room_types limit 1;
  insert into public.rooms (room_number, floor, room_type_id) values ('T012-1', 2, v_type) returning id into v_room;
  insert into public.rooms (room_number, floor, room_type_id) values ('T012-2', 2, v_type) returning id into v_room2;

  for i in 1..13 loop
    insert into public.vehicles (room_id, plate, lot_code, started_at)
    values (v_room2, 'TEST-' || i, 'T' || lpad(i::text, 2, '0'), date '2026-01-01');
  end loop;
  select count(*) into v_n from public.vehicles where ended_at is null;
  insert into _t012 ("case", got, ok) values ('เพิ่มครบ 13 คันได้', v_n::text, v_n = 13);

  begin
    insert into public.vehicles (room_id, plate) values (v_room, 'TEST-14');
    v_err := 'ผ่าน (ไม่ควร)';
  exception when check_violation then v_err := sqlerrm; end;
  insert into _t012 ("case", got, ok) values ('คันที่ 14 ถูกกัน', v_err, v_err like 'ที่จอดรถเต็ม%');

  insert into public.vehicles (room_id, plate, started_at, ended_at) values (v_room, 'TEST-OLD', date '2026-01-01', date '2026-02-01') returning id into v_ended;
  insert into _t012 ("case", got, ok) values ('ประวัติรถที่ย้ายออกแล้วเพิ่มได้แม้ที่เต็ม', 'ผ่าน', true);

  begin
    update public.vehicles set ended_at = null where id = v_ended;
    v_err := 'ผ่าน (ไม่ควร)';
  exception when check_violation then v_err := sqlerrm; end;
  insert into _t012 ("case", got, ok) values ('เปิดคันเก่ากลับตอนเต็มถูกกัน', v_err, v_err like 'ที่จอดรถเต็ม%');

  select id into v_first from public.vehicles where plate = 'TEST-1' and room_id = v_room2;
  update public.vehicles set color = 'ขาว' where id = v_first;
  insert into _t012 ("case", got, ok) values ('แก้ข้อมูลคันที่จอดอยู่ได้ตอนเต็ม', 'ผ่าน', true);

  update public.vehicles set ended_at = date '2026-03-15' where id = v_first;
  begin
    insert into public.vehicles (room_id, plate, lot_code) values (v_room, 'TEST-DUP', 'T02');
    v_err := 'ผ่าน (ไม่ควร)';
  exception when unique_violation then v_err := 'unique_violation'; end;
  insert into _t012 ("case", got, ok) values ('ล็อกซ้ำกับคันที่ยังจอดอยู่ถูกกัน', v_err, v_err = 'unique_violation');

  begin
    insert into public.vehicles (room_id, plate, lot_code) values (v_room, 'TEST-CASE', 't01 ');
    v_err := 'ผ่าน (ไม่ควร)';
  exception when check_violation then v_err := 'check_violation'; end;
  insert into _t012 ("case", got, ok) values ('ล็อกตัวพิมพ์เล็ก/มีช่องว่างถูกกัน', v_err, v_err = 'check_violation');

  -- ล็อกของคันที่ย้ายออกแล้วใช้ใหม่ได้ · คันนี้ใช้ค่าจอดกลาง
  insert into public.vehicles (room_id, plate, lot_code, started_at) values (v_room, 'TEST-A', 'T01', date '2026-03-20');
  insert into _t012 ("case", got, ok) values ('ใช้ล็อกของคันที่ย้ายออกแล้วได้', 'ผ่าน', true);

  begin
    insert into public.vehicles (room_id, plate, started_at, ended_at) values (v_room, 'TEST-X', date '2026-03-10', date '2026-03-09');
    v_err := 'ผ่าน (ไม่ควร)';
  exception when check_violation then v_err := 'check_violation'; end;
  insert into _t012 ("case", got, ok) values ('ended_at ก่อน started_at ถูกกัน', v_err, v_err = 'check_violation');

  begin
    insert into public.vehicles (room_id, plate, monthly_fee, started_at, ended_at) values (v_room, 'TEST-NEG', -1, date '2026-01-01', date '2026-01-02');
    v_err := 'ผ่าน (ไม่ควร)';
  exception when check_violation then v_err := 'check_violation'; end;
  insert into _t012 ("case", got, ok) values ('ค่าจอดติดลบถูกกัน', v_err, v_err = 'check_violation');

  -- ห้อง T012-1: TEST-A (ค่ากลาง 1000 · เริ่ม 20 มี.ค.) + TEST-OLD (ย้ายออก 1 ก.พ.)
  update public.vehicles set ended_at = date '2026-03-31' where plate = 'TEST-13' and room_id = v_room2;
  insert into public.vehicles (room_id, plate, monthly_fee, started_at) values (v_room, 'TEST-B', 500, date '2026-04-01');
  v_sum := public.parking_fee_for_room(v_room, date '2026-04-01');
  insert into _t012 ("case", got, ok) values ('เม.ย.: ค่ากลาง 1000 + ค่าเฉพาะคัน 500', v_sum::text, v_sum = 1500);
  v_sum := public.parking_fee_for_room(v_room, date '2026-03-01');
  insert into _t012 ("case", got, ok) values ('มี.ค.: นับคันที่เริ่มกลางเดือน ไม่นับคันที่เริ่มเดือนหน้า', v_sum::text, v_sum = 1000);
  v_sum := public.parking_fee_for_room(v_room, date '2026-02-01');
  insert into _t012 ("case", got, ok) values ('ก.พ.: คันที่ย้ายออกวันที่ 1 ยังนับ', v_sum::text, v_sum = 1000);

  select b.total into v_total from public.bill_calc(100, 150, 10, 15, 3000, 200, public.parking_fee_for_room(v_room, date '2026-04-01'), 0, 0, 11, 27, 20, 4) b;
  insert into _t012 ("case", got, ok) values ('บิลรวมค่าจอดครั้งเดียว (550 ไฟ + 100 น้ำ + 3000 + 200 + 1500)', v_total::text, v_total = 5350);

  insert into _t012 ("case", got, ok) values ('anon ไม่มีสิทธิ์ตารางและฟังก์ชัน', '-',
    not has_table_privilege('anon', 'public.vehicles', 'select,insert,update,delete')
    and not has_function_privilege('anon', 'public.parking_fee_for_room(uuid, date)', 'execute'));

  -- ผู้ใช้ล็อกอินที่ไม่ใช่แอดมิน: เห็น 0 แถว และเพิ่มไม่ได้
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('request.jwt.claim.sub'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.vehicles;
  begin
    insert into public.vehicles (room_id, plate, started_at, ended_at) values (v_room, 'TEST-RLS', date '2026-01-01', date '2026-01-02');
    v_err := 'ผ่าน (ไม่ควร)';
  exception when insufficient_privilege then v_err := 'insufficient_privilege'; end;
  reset role;
  insert into _t012 ("case", got, ok) values ('ไม่ใช่แอดมิน: อ่านได้ 0 แถว · เพิ่มไม่ได้', v_n || ' · ' || v_err, v_n = 0 and v_err = 'insufficient_privilege');

  insert into _t012 ("case", got, ok) values ('bucket vehicle-photos เป็น private + policy 4 ข้อ', '-',
    exists (select 1 from storage.buckets where id = 'vehicle-photos' and public = false)
    and (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'vehicle-photos %') = 4);
end $$;

select "case", got, ok from _t012 order by n;

rollback;
