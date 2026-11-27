#!/usr/bin/env python3
"""import_excel.py · K-BS-IMPORT.1 · นำเข้า Excel บุญใส -> ไฟล์ SQL upsert (ตาราง 010)

โหมด:
  --inspect            พิมพ์ชื่อชีต + 3 แถวแรกของแต่ละชีต (ตัด 40 ตัวอักษร) · ไม่พิมพ์แถวข้อมูลอื่น
  (ค่าเริ่มต้น)        dry-run: รายงานด้วยเลขห้องเท่านั้น ไม่เขียนไฟล์ใด ๆ
  --emit-sql <path>    เขียนไฟล์ SQL เดียว (transaction · รันซ้ำได้) · path ต้องอยู่นอก repo

ไม่ติดตั้งแพ็กเกจเพิ่ม (ใช้ openpyxl ที่มีอยู่) · ไม่ต่อฐานข้อมูล · ไม่ใช้คีย์ใด ๆ
ข้อมูลส่วนตัว (ชื่อ เลขบัตร เบอร์ ที่อยู่) ไปอยู่ในไฟล์ SQL ที่ --emit-sql เท่านั้น ไม่ออกหน้าจอ/รายงาน
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEB_ROOT = HERE.parent.parent  # .../web (หรือ worktree ของมัน)

# ---- 82 ห้อง (ชั้น 1–6) · ข้าม 701/702 ----
ROOMS_PER_FLOOR = {1: range(101, 111), 2: range(201, 209), 3: range(301, 317),
                   4: range(401, 417), 5: range(501, 517), 6: range(601, 617)}
ALL_ROOMS = [str(n) for f in sorted(ROOMS_PER_FLOOR) for n in ROOMS_PER_FLOOR[f]]
SKIP_ROOMS = {"701", "702"}

# ห้องว่าง 32 ห้อง (พี่หยัด 2026-11-24 07:56) · แก้ได้ด้วย --vacant
DEFAULT_VACANT = ("302 303 305 309 312 316 401 402 403 407 411 413 414 "
                  "503 504 505 506 507 510 513 601 602 604 605 606 608 609 610 611 612 613 614").split()

OCC_TYPES = {"TENANT", "STAFF", "OWNER_FAMILY"}
RATE_KEYS = ("elec_rate", "elec_min_units", "water_rate", "water_min_units")


# ---------------------------------------------------------------- helpers
def q(v) -> str:
    """SQL literal (สตริง/ตัวเลข/วันที่/NULL)"""
    if v is None:
        return "NULL"
    if isinstance(v, (int, Decimal)):
        return str(v)
    if isinstance(v, dt.date):
        return "'%s'::date" % v.isoformat()
    s = str(v)
    if "\x00" in s:
        raise ValueError("NUL ในข้อมูล")
    return "'" + s.replace("'", "''") + "'"


def cell_str(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).strip()
    return s or None


def to_num(v):
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        return Decimal(str(v).replace(",", "").strip())
    except InvalidOperation:
        return "BAD"


def to_date(v, be_auto=True):
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    d = None
    if isinstance(v, dt.datetime):
        d = v.date()
    elif isinstance(v, dt.date):
        d = v
    else:
        s = str(v).strip()
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                d = dt.datetime.strptime(s, fmt).date()
                break
            except ValueError:
                pass
    if d is None:
        return "BAD"
    if be_auto and d.year > 2400:  # พ.ศ. -> ค.ศ.
        d = d.replace(year=d.year - 543)
    return d


def col_idx(letter: str) -> int:
    n = 0
    for ch in letter.upper():
        n = n * 26 + (ord(ch) - 64)
    return n


def room_floor(room: str) -> int:
    return int(room[0])


def split_list(s: str | None) -> list[str]:
    if not s:
        return []
    return [p.strip() for p in re.split(r"[;\n]", s) if p.strip()]


# ---------------------------------------------------------------- load
def load_map(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_vacant(arg: str | None) -> set[str]:
    if not arg:
        return set(DEFAULT_VACANT)
    p = Path(arg)
    text = p.read_text(encoding="utf-8") if p.exists() else arg
    return set(re.findall(r"\d{3}", text))


def load_room_types(path: str | None) -> dict[str, str]:
    if not path:
        return {}
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            rn, rt = (r.get("room_number") or "").strip(), (r.get("room_type") or "").strip()
            if rn and rt:
                out[rn] = rt
    return out


def read_workbook(xlsx: Path, m: dict) -> list[dict]:
    from openpyxl import load_workbook
    wb = load_workbook(xlsx, read_only=True, data_only=True)
    ws = wb[m["sheet"]]
    cols = {k: col_idx(v) for k, v in m["columns"].items() if v}
    rows = []
    for i, row in enumerate(ws.iter_rows(min_row=m["first_data_row"], values_only=True), start=m["first_data_row"]):
        def g(key):
            ix = cols.get(key)
            return row[ix - 1] if ix and ix - 1 < len(row) else None
        room = cell_str(g("room"))
        if not room:
            continue
        rows.append({k: g(k) for k in cols} | {"room": room, "_excel_row": i})
    wb.close()
    return rows


# ---------------------------------------------------------------- analyse
def analyse(rows: list[dict], m: dict, vacant: set[str], room_types: dict[str, str]) -> dict:
    """คืนโครงข้อมูล + รายการขัดกัน (อ้างเลขห้องเท่านั้น)"""
    issues: dict[str, list[str]] = {}

    def issue(kind: str, room: str):
        issues.setdefault(kind, []).append(room)

    occ_map = m.get("occupancy_map", {})
    blank_as = m.get("occupancy_blank_as")
    default_common = Decimal(str(m.get("default_common_fee", 200)))
    seen: dict[str, dict] = {}
    skipped = []
    for r in rows:
        room = r["room"]
        if room in SKIP_ROOMS:
            skipped.append(room)
            continue
        if room not in ALL_ROOMS:
            issue("ห้องไม่อยู่ใน 82 ห้อง", room)
            continue
        if room in seen:
            issue("เลขห้องซ้ำในไฟล์", room)
            continue
        seen[room] = r
    for room in ALL_ROOMS:
        if room not in seen:
            issue("ไม่พบห้องในไฟล์", room)

    data = []
    for room in ALL_ROOMS:
        r = seen.get(room)
        if r is None:
            continue
        is_vacant = room in vacant
        first, last = cell_str(r.get("first_name")), cell_str(r.get("last_name"))
        full_name = " ".join(x for x in (first, last) if x) or None
        rent = to_num(r.get("rent"))
        item = {"room": room, "vacant": is_vacant, "full_name": full_name, "lease_ok": False,
                "meter": {}, "rent": None}

        for key in ("rent", "common_fee", "parking_fee", "deposit", "elec_old", "elec_new", "water_old", "water_new"):
            if to_num(r.get(key)) == "BAD":
                issue("ตัวเลขอ่านไม่ได้", room)
        meter_bad = False
        for kind, o, n in (("ELEC", "elec_old", "elec_new"), ("WATER", "water_old", "water_new")):
            old, new = to_num(r.get(o)), to_num(r.get(n))
            if "BAD" in (old, new):
                meter_bad = True
                continue
            if new is not None and new < 0:
                issue("มิเตอร์ติดลบ", room)
                meter_bad = True
            elif new is not None and old is not None and new < old:
                issue("มิเตอร์ใหม่ < เก่า (ไม่นำเข้ามิเตอร์ห้องนี้)", room)
                meter_bad = True
            elif new is not None:
                item["meter"][kind] = new
        if meter_bad:
            item["meter"] = {}

        if is_vacant:
            if full_name:
                issue("อยู่ในรายการว่างแต่มีชื่อผู้เช่า", room)
            if rent not in (None, "BAD") and rent > 0:
                issue("อยู่ในรายการว่างแต่มีค่าเช่า", room)
            data.append(item)
            continue

        # ห้องที่ไม่ว่าง
        if not full_name:
            issue("ไม่อยู่ในรายการว่างแต่ไม่มีผู้เช่า", room)
            data.append(item)
            continue

        occ_raw = cell_str(r.get("occupancy"))
        occ = occ_map.get(occ_raw) if occ_raw else blank_as
        if occ not in OCC_TYPES:
            issue("ประเภทการเข้าพักไม่ชัด (ไม่สร้างสัญญา)", room)
            data.append(item)
            continue
        company = cell_str(r.get("company"))
        if occ == "STAFF" and not company:
            issue("ห้องพนักงานไม่มีบริษัทต้นสังกัด (ไม่สร้างสัญญา)", room)
            data.append(item)
            continue
        start = to_date(r.get("start_date"))
        if start in (None, "BAD"):
            issue("วันเริ่มสัญญาไม่มี/อ่านไม่ได้ (ไม่สร้างสัญญา)", room)
            data.append(item)
            continue
        if rent == "BAD":
            data.append(item)
            continue

        idn = cell_str(r.get("id_number"))
        id_type = None
        if idn:
            id_type = "THAI_ID" if re.fullmatch(r"\d{13}", idn) else "PASSPORT"
        else:
            issue("ไม่มีเลขบัตร/พาสปอร์ต (ไม่ใส่ tenant_identity)", room)
        bd = to_date(r.get("birth_date"))
        if bd == "BAD":
            bd = None
            issue("วันเกิดอ่านไม่ได้ (ไม่ใส่)", room)

        names, plates = split_list(cell_str(r.get("occupants"))), split_list(cell_str(r.get("plates")))
        occupants = []
        for i in range(max(len(names), len(plates))):
            occupants.append({"name": names[i] if i < len(names) else "(ไม่ระบุชื่อ)",
                              "plate": plates[i] if i < len(plates) else None})

        def num(key, default=None):
            v = to_num(r.get(key))
            return default if v is None or v == "BAD" else v

        item.update({
            "lease_ok": True, "occ": occ, "company": company if occ == "STAFF" or company else None,
            "tenant": {"full_name": full_name, "phone": cell_str(r.get("phone")),
                       "nationality": cell_str(r.get("nationality")),
                       "id_type": id_type, "id_number": idn, "birth_date": bd,
                       "address": cell_str(r.get("address"))},
            "lease": {"start": start, "rent": num("rent", Decimal(0)),
                      "common_fee": num("common_fee", default_common),
                      "parking_fee": num("parking_fee", Decimal(0)),
                      "deposit": num("deposit", Decimal(0))},
            "occupants": occupants,
        })
        item["rent"] = item["lease"]["rent"]
        data.append(item)

    no_type = [d["room"] for d in data if d["room"] not in room_types]
    return {"data": data, "issues": issues, "skipped": sorted(skipped), "no_type": no_type}


# ---------------------------------------------------------------- report
def report(a: dict, room_types: dict, period) -> str:
    d = a["data"]
    vac = [x["room"] for x in d if x["vacant"]]
    leases = [x for x in d if x["lease_ok"]]
    by_occ = {t: sum(1 for x in leases if x["occ"] == t) for t in sorted(OCC_TYPES)}
    meters = sum(1 for x in d if x["meter"])
    L = ["== รายงาน dry-run (เลขห้องเท่านั้น · ไม่มีชื่อ/เลขบัตร/เบอร์) ==",
         f"ห้องที่เจอ (ใน 82 ห้อง): {len(d)} / 82",
         f"ห้องที่ข้าม (อ้างอิงเท่านั้น): {', '.join(a['skipped']) or '-'}",
         f"ห้องว่างตามรายการ: {len(vac)}",
         f"ห้องมีสัญญา (จะสร้าง tenant+lease): {len(leases)}  " + "  ".join(f"{k}={v}" for k, v in by_occ.items()),
         f"ห้องที่มีมิเตอร์ตั้งต้น: {meters} (งวด {period or 'ยังไม่กำหนด'})",
         f"ผลรวมค่าเช่าตามสัญญาที่จะสร้าง: {sum((x['rent'] for x in leases), Decimal(0))}",
         f"ห้องที่ยังไม่มีแบบห้อง (ไม่ INSERT ห้อง · ใช้แบบห้องที่อยู่ในฐาน): {', '.join(a['no_type']) or '-'}"]
    if a["issues"]:
        L.append("-- รายการขัดกัน/ผิดปกติ --")
        for k, rooms in a["issues"].items():
            L.append(f"* {k}: {', '.join(sorted(set(rooms)))}")
    else:
        L.append("-- ไม่พบรายการขัดกัน --")
    return "\n".join(L)


# ---------------------------------------------------------------- SQL
def build_sql(a: dict, m: dict, room_types: dict[str, str], period: dt.date) -> str:
    rates = m.get("rates", {})
    out = ["-- ไฟล์ SQL นำเข้าข้อมูลบุญใส (สร้างโดย import_excel.py · K-BS-IMPORT.1)",
           "-- ⚠ มีข้อมูลส่วนตัวจริง: ห้ามส่งต่อ ห้ามเข้า git/แชท · รันแล้วให้ลบไฟล์นี้",
           "-- รันหลัง 001–011 · รันซ้ำได้ ไม่เพิ่มแถว (อัปเดตตามห้อง/สัญญา ACTIVE ของห้อง)",
           "begin;", ""]
    if rates:
        out.append("-- อัตรา")
        out.append("insert into public.rate_settings (key, value) values")
        out.append(",\n".join(f"  ({q(k)}, {q(Decimal(str(rates[k])))})" for k in RATE_KEYS if k in rates))
        out.append("on conflict (key) do update set value = excluded.value, updated_at = now();\n")

    companies = sorted({x["company"] for x in a["data"] if x.get("lease_ok") and x.get("company")})
    if companies:
        out.append("-- บริษัทต้นสังกัด")
        out.append("insert into public.companies (name) values")
        out.append(",\n".join(f"  ({q(c)})" for c in companies))
        out.append("on conflict (name) do nothing;\n")

    out.append("-- ห้อง: มีแบบห้องในไฟล์จับคู่ = insert/อัปเดตแบบ+สถานะ · ไม่มี = อัปเดตสถานะของห้องที่มีอยู่ในฐานอย่างเดียว")
    for x in a["data"]:
        st = "available" if x["vacant"] else "occupied"
        room = x["room"]
        if room in room_types:
            out.append(
                "insert into public.rooms (room_number, floor, room_type_id, status) "
                f"select {q(room)}, {room_floor(room)}, t.id, {q(st)}::room_status from public.room_types t where t.name = {q(room_types[room])} "
                "on conflict (room_number) do update set status = excluded.status, room_type_id = excluded.room_type_id;")
        else:
            out.append(f"update public.rooms set status = {q(st)}::room_status where room_number = {q(room)};")
    out += ["",
            "do $$ declare v_missing text; v_extra text; begin",
            "  select string_agg(n, ', ') into v_missing from unnest(array[" + ",".join(q(r) for r in ALL_ROOMS) +
            "]) n where not exists (select 1 from public.rooms r where r.room_number = n);",
            "  if v_missing is not null then",
            "    raise exception 'ห้องเหล่านี้ยังไม่มีในฐาน (ใส่ room_type_map.csv หรือรัน SQL เพิ่มห้องก่อน): %', v_missing;",
            "  end if;",
            "  select string_agg(room_number, ', ') into v_extra from public.rooms where room_number <> all(array[" +
            ",".join(q(r) for r in ALL_ROOMS) + "]);",
            "  if v_extra is not null then raise notice 'ห้องในฐานที่ไม่อยู่ใน 82 ห้อง (ไม่แตะ): %', v_extra; end if;",
            "end $$;", ""]

    leases = [x for x in a["data"] if x["lease_ok"]]
    if leases:
        out.append("create temp table _imp (room_number text, full_name text, phone text, nationality text, id_type text, id_number text, "
                   "birth_date date, address text, start_date date, monthly_rent numeric, common_fee numeric, parking_fee numeric, "
                   "deposit numeric, occupancy_type text, company_name text, occupants jsonb) on commit drop;")
        vals = []
        for x in leases:
            t, l = x["tenant"], x["lease"]
            occ_json = json.dumps([{"name": o["name"], "plate": o["plate"]} for o in x["occupants"]], ensure_ascii=False)
            vals.append("  (" + ", ".join([q(x["room"]), q(t["full_name"]), q(t["phone"]), q(t["nationality"]), q(t["id_type"]),
                                           q(t["id_number"]), q(t["birth_date"]), q(t["address"]), q(l["start"]), q(l["rent"]),
                                           q(l["common_fee"]), q(l["parking_fee"]), q(l["deposit"]), q(x["occ"]), q(x["company"]),
                                           q(occ_json) + "::jsonb"]) + ")")
        out.append("insert into _imp values\n" + ",\n".join(vals) + ";\n")
        out.append("""do $$
declare r record; v_room uuid; v_lease uuid; v_tenant uuid; v_company uuid;
begin
  for r in select * from _imp loop
    select id into v_room from public.rooms where room_number = r.room_number;
    v_company := null;
    if r.company_name is not null then select id into v_company from public.companies where name = r.company_name; end if;
    v_lease := null; v_tenant := null;
    select id, tenant_id into v_lease, v_tenant from public.leases where room_id = v_room and status = 'ACTIVE';
    if v_lease is null then
      insert into public.tenants (full_name, phone, nationality) values (r.full_name, r.phone, r.nationality) returning id into v_tenant;
      insert into public.leases (room_id, tenant_id, start_date, monthly_rent, common_fee, parking_fee, deposit, status, occupancy_type, company_id)
      values (v_room, v_tenant, r.start_date, r.monthly_rent, r.common_fee, r.parking_fee, r.deposit, 'ACTIVE', r.occupancy_type, v_company)
      returning id into v_lease;
    else
      update public.tenants set full_name = r.full_name, phone = r.phone, nationality = r.nationality, updated_at = now() where id = v_tenant;
      update public.leases set start_date = r.start_date, monthly_rent = r.monthly_rent, common_fee = r.common_fee, parking_fee = r.parking_fee,
             deposit = r.deposit, occupancy_type = r.occupancy_type, company_id = v_company, updated_at = now() where id = v_lease;
    end if;
    if r.id_number is not null then
      insert into public.tenant_identity (tenant_id, id_type, id_number, birth_date, address)
      values (v_tenant, r.id_type, r.id_number, r.birth_date, r.address)
      on conflict (tenant_id) do update set id_type = excluded.id_type, id_number = excluded.id_number,
             birth_date = excluded.birth_date, address = excluded.address, updated_at = now();
    end if;
    delete from public.lease_occupants where lease_id = v_lease;
    insert into public.lease_occupants (lease_id, name, vehicle_plate)
      select v_lease, o->>'name', o->>'plate' from jsonb_array_elements(r.occupants) o;
  end loop;
end $$;
""")

    mrows = [(x["room"], k, v) for x in a["data"] for k, v in x["meter"].items()]
    if mrows:
        out.append(f"-- มิเตอร์ตั้งต้น = เดือนล่าสุดเท่านั้น (งวด {period.isoformat()})")
        out.append("insert into public.meter_readings (room_id, period, kind, reading)")
        out.append("select r.id, v.period, v.kind, v.reading from (values")
        out.append(",\n".join(f"  ({q(rn)}, {q(period)}, {q(k)}, {q(v)})" for rn, k, v in mrows))
        out.append(") as v(room_number, period, kind, reading) join public.rooms r on r.room_number = v.room_number")
        out.append("on conflict (room_id, period, kind) where room_id is not null do update set reading = excluded.reading;\n")

    out += ["-- สรุปหลังรัน (เทียบกับรายงาน dry-run)",
            "select (select count(*) from public.rooms where room_number = any(array[" + ",".join(q(r) for r in ALL_ROOMS) + "])) as rooms_82,",
            "       (select count(*) from public.rooms where status = 'available' and room_number = any(array[" + ",".join(q(r) for r in ALL_ROOMS) + "])) as vacant,",
            "       (select count(*) from public.leases where status = 'ACTIVE') as active_leases,",
            "       (select count(*) from public.meter_readings where room_id is not null) as meters;",
            "", "commit;", ""]
    return "\n".join(out)


def check_output_path(p: Path):
    rp = p.resolve()
    web = WEB_ROOT.resolve()
    if rp == web or web in rp.parents:
        raise SystemExit(f"ปฏิเสธ: ไฟล์ SQL มีข้อมูลจริง ห้ามอยู่ใต้โฟลเดอร์โค้ด ({web})")
    for parent in [rp] + list(rp.parents):
        if (parent / ".git").exists():
            raise SystemExit(f"ปฏิเสธ: path อยู่ใน git repo ({parent}) · เลือกโฟลเดอร์นอก repo")


# ---------------------------------------------------------------- inspect
def inspect(xlsx: Path):
    from openpyxl import load_workbook
    wb = load_workbook(xlsx, read_only=True, data_only=True)
    for ws in wb.worksheets:
        print(f"[ชีต] {ws.title!r}")
        for i, row in enumerate(ws.iter_rows(min_row=1, max_row=3, values_only=True), start=1):
            cells = [f"{chr(64 + j) if j <= 26 else j}:{str(c)[:40]}" for j, c in enumerate(row, start=1) if c is not None]
            print(f"  แถว {i}: " + " | ".join(cells))
    wb.close()


def main(argv=None) -> int:
    for st in (sys.stdout, sys.stderr):  # คอนโซล Windows ไทยเป็น cp874 · บังคับ UTF-8 กันพิมพ์ไทยพัง
        if hasattr(st, "reconfigure"):
            st.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="นำเข้า Excel บุญใส -> SQL (ดู README_วิธีรัน.md)")
    ap.add_argument("xlsx", help="ไฟล์ Excel")
    ap.add_argument("--map", default=str(HERE / "import_map.json"))
    ap.add_argument("--inspect", action="store_true")
    ap.add_argument("--emit-sql", metavar="PATH")
    ap.add_argument("--vacant", help="รายการห้องว่าง (เลขห้องคั่นด้วยช่องว่าง/คอมมา หรือ path ไฟล์ข้อความ)")
    ap.add_argument("--room-types", metavar="CSV", help="room_type_map.csv (room_number,room_type)")
    ap.add_argument("--period", help="งวดมิเตอร์ YYYY-MM-01 (แทนค่าใน import_map.json)")
    args = ap.parse_args(argv)

    xlsx = Path(args.xlsx)
    if args.inspect:
        inspect(xlsx)
        return 0
    m = load_map(Path(args.map))
    vacant = load_vacant(args.vacant)
    room_types = load_room_types(args.room_types)
    period = to_date(args.period or m.get("meter_period"), be_auto=False)
    if period in (None, "BAD") and args.emit_sql:
        print("ต้องกำหนดงวดมิเตอร์ (meter_period ใน import_map.json หรือ --period YYYY-MM-01)", file=sys.stderr)
        return 2
    if period not in (None, "BAD") and period.day != 1:
        print("งวดมิเตอร์ต้องเป็นวันที่ 1 ของเดือน", file=sys.stderr)
        return 2
    if args.emit_sql:
        check_output_path(Path(args.emit_sql))
    a = analyse(read_workbook(xlsx, m), m, vacant, room_types)
    print(report(a, room_types, None if period in (None, "BAD") else period))
    if args.emit_sql:
        Path(args.emit_sql).write_text(build_sql(a, m, room_types, period), encoding="utf-8", newline="\n")
        print(f"\nเขียนไฟล์ SQL แล้ว: {args.emit_sql}  (มีข้อมูลจริง · รันแล้วลบไฟล์)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
