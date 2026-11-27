#!/usr/bin/env python3
"""import_excel.py · K-BS-IMPORT.1 / IMPORT.2 · นำเข้าผู้เช่าจาก Excel บุญใส -> ไฟล์ SQL (ตาราง 010)

โหมด:
  --inspect               พิมพ์ชื่อชีต + 3 แถวแรกของแต่ละชีต (ตัด 40 ตัวอักษร) · ไม่พิมพ์แถวข้อมูลอื่น
  (ค่าเริ่มต้น) / --dry-run  รายงานด้วยเลขห้องและตัวเลขสรุปเท่านั้น ไม่เขียนไฟล์ใด ๆ
  --emit-sql <path>       เขียนไฟล์ IMPORT (transaction เดียว · รันซ้ำได้) · path ต้องอยู่นอก repo
  --emit-rollback <path>  เขียนไฟล์ ROLLBACK คู่กัน (ใช้คู่กับ --emit-sql)
  --emit-check <path>     เขียนไฟล์ CHECK ก่อนรัน (SELECT อย่างเดียว)

กติกา (พี่หยัด 2026-11-27):
  - ไม่เขียน room_types / floor_prices / ราคาห้อง / อัตราค่าน้ำไฟ · ค่าเช่าในสัญญา = ตัวเลขใน Excel รายห้อง
  - จับคู่ห้องด้วยเลขห้องเท่านั้น ไม่ค้นหรือรวมผู้เช่าด้วยชื่อ · ห้องที่มีสัญญา ACTIVE อยู่แล้ว = ไม่แตะ
  - ไม่ตั้งสถานะห้อง 302/303/305 (K-BS-ROOMS.1c)
  - ไม่เขียน leases.parking_fee (ค่าจอดคิดจากตารางรถ 012 ที่เดียว)
  - มิเตอร์ = เลขเดือนล่าสุด ลงตามที่เห็นแม้ดูผิด · ว่าง/อ่านไม่ได้ = 0 (รอจดใหม่) · ลดลง = warning 'DECREASE'

ไม่ติดตั้งแพ็กเกจเพิ่ม (ใช้ openpyxl ที่มีอยู่) · ไม่ต่อฐานข้อมูล · ไม่ใช้คีย์ใด ๆ
ข้อมูลส่วนตัว (ชื่อ เลขบัตร เบอร์ ที่อยู่) อยู่ในไฟล์ IMPORT เท่านั้น ไม่ออกหน้าจอ/รายงาน/ไฟล์ ROLLBACK
"""
from __future__ import annotations

import argparse
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

# ห้องว่างจากรายการ 32 ห้อง (พี่หยัด 2026-11-24 07:56) ตัด 302/303/305 ออกตาม K-BS-ROOMS.1c · แก้ได้ด้วย --vacant
DEFAULT_VACANT = ("309 312 316 401 402 403 407 411 413 414 "
                  "503 504 505 506 507 510 513 601 602 604 605 606 608 609 610 611 612 613 614").split()

# ห้องที่ตัดสินแล้ว: Excel ห้ามเปลี่ยนประเภท/สถานะ และไม่สร้างสัญญา (ลงเฉพาะมิเตอร์) · 108A ไม่อยู่ใน Excel และไม่อยู่ใน 82 ห้อง
DECIDED_ROOMS = {
    "102": "ร้าน Moon & Sun (ไม่ใช่ห้องพัก)",
    "104": "รายวัน Airbnb", "105": "รายวัน Airbnb",
    "106": "ห้องเก็บของ (ไม่ใช่ห้องพัก)",
    "107": "ครอบครัวพี่ไอซ์", "108": "ครอบครัวพี่ไอซ์", "109": "ครอบครัวพี่ไอซ์", "110": "ครอบครัวพี่ไอซ์",
    "208": "ห้องพนักงาน Luminary",
}

# ห้องที่ข้ามทั้งห้อง (ไม่แตะอะไรเลย รวมมิเตอร์) แม้จะมีในฐานแล้ว · เอาออกจากรายการนี้เมื่อพี่หยัดตัดสิน
HELD_ROOMS: dict[str, str] = {}
# ห้องที่ไฟล์นี้ไม่ตั้งสถานะ (รอยืนยันว่าว่างจริงไหม) · สัญญา/มิเตอร์ยังลงตาม Excel
KEEP_STATUS_ROOMS = {"302", "303", "305"}
MISSING_REASON = "ยังไม่มีห้องนี้ในตาราง rooms"

OCC_TYPES = {"TENANT", "STAFF", "OWNER_FAMILY"}
LOG = "bs_import.log_20261127"  # บันทึกว่าไฟล์ IMPORT ใส่/เปลี่ยนอะไร (มีแต่ id กับสถานะเดิม) · อยู่นอก schema public


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


def qlist(items) -> str:
    """array[...]::text[] (ว่างได้)"""
    return "array[" + ",".join(q(i) for i in items) + "]::text[]"


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
        n = Decimal(str(v).replace(",", "").strip())
    except InvalidOperation:
        return "BAD"
    return n if n.is_finite() else "BAD"


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


def split_list(s: str | None) -> list[str]:
    if not s:
        return []
    return [p.strip() for p in re.split(r"[;\n]", s) if p.strip()]


def nat_key(room: str):
    m = re.match(r"(\d+)(.*)", room)
    return (int(m.group(1)), m.group(2)) if m else (10**9, room)


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


def read_sheet(wb, name: str, first_row: int, columns: dict) -> list[dict]:
    cols = {k: col_idx(v) for k, v in columns.items() if v}
    rows = []
    for i, row in enumerate(wb[name].iter_rows(min_row=first_row, values_only=True), start=first_row):
        def g(key):
            ix = cols.get(key)
            return row[ix - 1] if ix and ix - 1 < len(row) else None
        room = cell_str(g("room"))
        if not room:
            continue
        rows.append({k: g(k) for k in cols} | {"room": room, "_excel_row": i})
    return rows


def read_workbook(xlsx: Path, m: dict) -> tuple[list[dict], list[dict]]:
    """คืน (แถวชีตข้อมูลลูกค้า, แถวชีตค่าใช้จ่าย)"""
    from openpyxl import load_workbook
    wb = load_workbook(xlsx, read_only=True, data_only=True)
    fee = m["fee_sheet"]
    rows = read_sheet(wb, m["sheet"], m["first_data_row"], m["columns"])
    fees = read_sheet(wb, fee["sheet"], fee["first_data_row"], fee["columns"])
    wb.close()
    return rows, fees


# ---------------------------------------------------------------- analyse
def read_meters(r: dict) -> tuple[dict, list[str]]:
    """มิเตอร์เดือนล่าสุด: ลงทุกค่า ไม่ข้ามห้อง ไม่เดาแก้ · คืน ({kind: (reading, warning)}, [เหตุที่ต้องจดใหม่])"""
    meters, flags = {}, []
    for kind, old_key, new_key in (("ELEC", "elec_old", "elec_new"), ("WATER", "water_old", "water_new")):
        old, new = to_num(r.get(old_key)), to_num(r.get(new_key))
        if new is None or new == "BAD" or new < 0:
            meters[kind] = (Decimal(0), None)
            flags.append("blank")
        elif isinstance(old, Decimal) and new < old:
            meters[kind] = (new, "DECREASE")
            flags.append("decrease")
        else:
            meters[kind] = (new, None)
    return meters, flags


def analyse(rows: list[dict], fees: list[dict], m: dict, vacant: set[str]) -> dict:
    """คืนโครงข้อมูล + รายการขัดกัน (อ้างเลขห้องเท่านั้น)"""
    issues: dict[str, list[str]] = {}

    def issue(kind: str, room: str):
        issues.setdefault(kind, []).append(room)

    def index(source: list[dict], label: str) -> tuple[dict, list[str]]:
        found: dict[str, dict] = {}
        skipped, dups = [], set()
        for r in source:
            room = r["room"]
            if room in SKIP_ROOMS:
                skipped.append(room)
            elif room not in ALL_ROOMS:
                issue(f"{label}: ห้องไม่อยู่ใน 82 ห้อง", room)
            elif room in found:
                issue(f"{label}: เลขห้องซ้ำ (ไม่ใช้ทั้งสองแถว)", room)
                dups.add(room)
            else:
                found[room] = r
        for room in dups:  # ซ้ำ = ไม่รู้ว่าแถวไหนถูก · ห้ามเดา
            found.pop(room, None)
        return found, skipped

    info, skipped = index(rows, "ชีตข้อมูลลูกค้า")
    fee_by_room, _ = index(fees, "ชีตค่าใช้จ่าย")
    for room in ALL_ROOMS:
        if room not in info:
            issue("ไม่พบห้องในชีตข้อมูลลูกค้า", room)

    occ_map = m.get("occupancy_map", {})
    blank_as = m.get("occupancy_blank_as")
    default_common = Decimal(str(m.get("default_common_fee", 200)))
    data = []
    for room in ALL_ROOMS:
        r = info.get(room, {})
        held = room in HELD_ROOMS
        meters, flags = read_meters(r) if r and not held else ({}, [])
        item = {"room": room, "vacant": room in vacant, "decided": room in DECIDED_ROOMS, "held": held,
                "lease_ok": False, "rent": None, "meter": meters, "meter_flags": flags}
        data.append(item)
        full_name = " ".join(x for x in (cell_str(r.get("first_name")), cell_str(r.get("last_name"))) if x) or None
        item["has_name"] = bool(full_name)
        if item["decided"] or held:
            continue
        if item["vacant"]:
            if full_name:
                issue("อยู่ในรายการว่างแต่มีชื่อใน Excel (ถือว่าย้ายออก ไม่นำเข้า)", room)
            continue
        if not full_name:
            continue  # มีคนเช่า รอเอกสาร

        fee = fee_by_room.get(room)
        rent = to_num(fee.get("rent")) if fee else None
        if not isinstance(rent, Decimal) or rent <= 0:
            issue("มีชื่อแต่ค่าเช่าเป็น 0/ว่าง/ไม่มีในชีตค่าใช้จ่าย (ไม่สร้างสัญญา)", room)
            continue
        occ_raw = cell_str(r.get("occupancy"))
        occ = occ_map.get(occ_raw) if occ_raw else blank_as
        if occ not in OCC_TYPES:
            issue("ประเภทการเข้าพักไม่ชัด (ไม่สร้างสัญญา)", room)
            continue
        if occ == "STAFF":  # Excel ไม่มีบริษัทต้นสังกัด และ 010 บังคับให้ห้องพนักงานต้องมี
            issue("ห้องพนักงานไม่มีบริษัทต้นสังกัด (ไม่สร้างสัญญา)", room)
            continue
        start = to_date(r.get("start_date"))
        if start in (None, "BAD"):
            issue("วันเริ่มสัญญาไม่มี/อ่านไม่ได้ (ไม่สร้างสัญญา)", room)
            continue

        common = to_num(fee.get("common_fee"))
        if not isinstance(common, Decimal) or common < 0:
            issue(f"ค่าส่วนกลางว่าง/อ่านไม่ได้ (ใช้ {default_common})", room)
            common = default_common

        idn = cell_str(r.get("id_number"))
        id_type = None
        if idn:
            digits = re.sub(r"[ \-]", "", idn)
            if re.fullmatch(r"\d{13}", digits):
                idn, id_type = digits, "THAI_ID"
            else:
                id_type = "PASSPORT"
        else:
            issue("ไม่มีเลขบัตร/พาสปอร์ต (ไม่ใส่ tenant_identity)", room)
        bd = to_date(r.get("birth_date"))
        if bd == "BAD":
            bd = None
            issue("วันเกิดอ่านไม่ได้ (ไม่ใส่)", room)

        item.update({
            "lease_ok": True, "occ": occ, "rent": rent,
            # สัญชาติ (อลิส 2026-11-24): บัตร 13 หลัก = ไทย · อื่น ๆ เว้นว่าง ห้ามเดาประเทศ
            "tenant": {"full_name": full_name, "phone": cell_str(r.get("phone")),
                       "nationality": "TH" if id_type == "THAI_ID" else None,
                       "id_type": id_type, "id_number": idn, "birth_date": bd,
                       "address": cell_str(r.get("address"))},
            "lease": {"start": start, "rent": rent, "common_fee": common},
            "occupants": split_list(cell_str(r.get("occupants"))),
        })

    return {"data": data, "issues": issues, "skipped": sorted(skipped)}


def summary(a: dict) -> dict:
    """ตัวเลขสรุปที่ใช้ทั้งในรายงานและใน SELECT ท้ายไฟล์ IMPORT"""
    d = a["data"]
    pick = lambda cond: [x["room"] for x in d if cond(x)]  # noqa: E731
    return {
        "total": len(d),
        "leases": pick(lambda x: x["lease_ok"]),
        "awaiting": pick(lambda x: not x["decided"] and not x["held"] and not x["vacant"] and not x["lease_ok"]),
        "awaiting_with_name": pick(lambda x: not x["decided"] and not x["held"] and not x["vacant"] and not x["lease_ok"] and x["has_name"]),
        "vacant": pick(lambda x: x["vacant"] and not x["decided"] and not x["held"]),
        "decided": pick(lambda x: x["decided"]),
        "held": pick(lambda x: x["held"]),
        "meter_rooms": pick(lambda x: bool(x["meter"])),
        "meter_rows": sum(len(x["meter"]) for x in d),
        "meter_blank": pick(lambda x: "blank" in x["meter_flags"]),
        "meter_decrease": pick(lambda x: "decrease" in x["meter_flags"]),
    }


# ---------------------------------------------------------------- report
def report(a: dict, period) -> str:
    s = summary(a)
    rooms = lambda xs: ", ".join(xs) or "-"  # noqa: E731
    L = ["== รายงาน dry-run (เลขห้องเท่านั้น · ไม่มีชื่อ/เลขบัตร/เบอร์) ==",
         f"ห้องทั้งหมด: {s['total']} / 82",
         f"ห้องที่ข้าม (ไม่ใช่ห้องเช่า): {rooms(a['skipped'])}",
         f"สัญญาที่จะสร้าง: {len(s['leases'])}",
         f"ผลรวมค่าเช่าตามสัญญาที่จะสร้าง: {sum((x['rent'] for x in a['data'] if x['lease_ok']), Decimal(0))}",
         f"ห้อง 'มีคนเช่า รอเอกสาร': {len(s['awaiting'])} -> {rooms(s['awaiting'])}",
         f"  ในนั้นมีชื่อใน Excel แต่ข้อมูลไม่ครบ: {rooms(s['awaiting_with_name'])}",
         f"ห้องว่าง: {len(s['vacant'])} -> {rooms(s['vacant'])}",
         f"ห้องตัดสินแล้ว (ลงมิเตอร์อย่างเดียว): {len(s['decided'])} -> {rooms(s['decided'])}",
         f"ห้องที่ข้ามทั้งห้อง (รอตัดสิน): {len(s['held'])} -> {rooms(s['held'])}",
         "  * ตัวเลขข้างบนคือแผนจาก Excel · ห้องที่ยังไม่มีในฐานจะถูกข้ามตอนรัน SQL (ดูไฟล์ CHECK)",
         f"มิเตอร์ที่ลง: {len(s['meter_rooms'])} ห้อง / {s['meter_rows']} แถว (งวด {period or 'ยังไม่กำหนด'})",
         f"  รอจดใหม่ - ว่าง/อ่านไม่ได้ (ลงเป็น 0): {rooms(s['meter_blank'])}",
         f"  รอจดใหม่ - เลขลดลง (ลงตาม Excel + DECREASE): {rooms(s['meter_decrease'])}"]
    if a["issues"]:
        L.append("-- รายการขัดกัน/ผิดปกติ --")
        for k, rs in a["issues"].items():
            L.append(f"* {k}: {', '.join(sorted(set(rs), key=nat_key))}")
    else:
        L.append("-- ไม่พบรายการขัดกัน --")
    return "\n".join(L)


# ---------------------------------------------------------------- SQL
def price_hash_sql() -> str:
    """ลายนิ้วมือของทุกอย่างที่มีผลต่อราคาห้อง"""
    return ("select md5(coalesce(string_agg(x, '|' order by x), '')) from ("
            "select 'T' || to_jsonb(t)::text as x from public.room_types t "
            "union all select 'F' || to_jsonb(f)::text from public.floor_prices f "
            "union all select 'R' || r.room_number || ':' || r.room_type_id::text || ':' || coalesce(r.price_override::text, '') from public.rooms r"
            ") s")


def price_guard_open() -> str:
    return f"create temp table _price_before on commit drop as select ({price_hash_sql()}) as h;"


def price_guard_close() -> str:
    return ("do $$ begin\n"
            f"  if ({price_hash_sql()}) is distinct from (select h from _price_before) then\n"
            "    raise exception 'หยุด: ราคาห้อง (room_types / floor_prices / rooms) จะเปลี่ยน · ยกเลิกทั้งไฟล์';\n"
            "  end if;\n"
            "end $$;")


def plan_rows(a: dict) -> list[tuple[str, str, int]]:
    """(เลขห้อง, ประเภทที่จะทำ, จำนวนแถวมิเตอร์) ของทุกห้องที่ไม่ได้ถูกพักไว้"""
    out = []
    for x in a["data"]:
        if x["held"]:
            continue
        cat = "decided" if x["decided"] else "lease" if x["lease_ok"] else "vacant" if x["vacant"] else "awaiting"
        out.append((x["room"], cat, len(x["meter"])))
    return out


def build_sql(a: dict, period: dt.date) -> str:
    plan = plan_rows(a)
    out = ["-- IMPORT ผู้เช่าบุญใสจาก Excel (สร้างโดย import_excel.py · K-BS-IMPORT.2b)",
           "-- ⚠ มีข้อมูลส่วนตัวจริง: ห้ามส่งต่อ ห้ามเข้า git/แชท · รันและตรวจเสร็จแล้วให้ลบไฟล์นี้",
           "-- รันหลัง 010 · ห้องที่ยังไม่มีในตาราง rooms = ข้าม (ดูแถวสรุปท้ายผล) · ไม่ตั้งสถานะห้อง 302/303/305",
           "-- รันซ้ำได้: ห้องที่นำเข้าไปแล้วจะไม่ถูกแตะอีก รอบถัดไปเติมเฉพาะห้องที่เพิ่งมีในฐาน",
           "-- ผลลัพธ์: ตารางสรุปจากคำสั่งสุดท้าย คอลัมน์ ok ต้องเป็น true ทุกแถว",
           "drop table if exists pg_temp._import_result;",
           "begin;", "",
           "do $$ begin",
           "  if to_regclass('public.leases') is null or to_regclass('public.meter_readings') is null then",
           "    raise exception 'หยุด: ยังไม่ได้รัน 010_billing.sql';",
           "  end if;",
           "end $$;", "",
           price_guard_open(), "",
           "create schema if not exists bs_import;",
           "revoke all on schema bs_import from public;",
           f"create table if not exists {LOG} (kind text not null, ref uuid not null, old_value text, primary key (kind, ref));",
           f"revoke all on table {LOG} from public;",
           f"alter table {LOG} enable row level security;", "",
           "create temp table _plan (room_number text primary key, cat text not null, meters int not null) on commit drop;",
           "insert into _plan values\n" + ",\n".join(f"  ({q(r)}, {q(c)}, {n})" for r, c, n in plan) + ";", "",
           "-- ห้องที่ข้าม: พักไว้ + ยังไม่มีในฐาน",
           "create temp table _skip (room_number text primary key, reason text not null) on commit drop;",
           *(["insert into _skip values " + ", ".join(f"({q(r)}, {q(why)})" for r, why in sorted(HELD_ROOMS.items())) + ";"] if HELD_ROOMS else []),
           f"insert into _skip select p.room_number, {q(MISSING_REASON)} from _plan p",
           "  where not exists (select 1 from public.rooms r where r.room_number = p.room_number);",
           "do $$ declare s record; begin",
           "  for s in select * from _skip order by room_number loop",
           "    raise notice 'ข้ามห้อง %: %', s.room_number, s.reason;",
           "  end loop;",
           "end $$;", "",
           "-- ห้องที่จะทำในรอบนี้ = มีในฐาน และยังไม่เคยนำเข้า",
           "create temp table _todo on commit drop as",
           "  select p.room_number, p.cat, r.id as room_id from _plan p join public.rooms r on r.room_number = p.room_number",
           f"  where not exists (select 1 from {LOG} g where g.kind = 'done' and g.ref = r.id);", ""]

    out.append("-- สถานะห้อง (ไม่แตะห้องที่ตัดสินแล้ว) · จำสถานะเดิมไว้ให้ ROLLBACK")
    for status, cats in (("available", "('vacant')"), ("occupied", "('lease', 'awaiting')")):
        cats_cond = f"t.cat in {cats} and t.room_number <> all({qlist(sorted(KEEP_STATUS_ROOMS))})"
        out += [f"insert into {LOG} (kind, ref, old_value)",
                "  select 'room_status', r.id, r.status::text from public.rooms r join _todo t on t.room_id = r.id",
                f"  where {cats_cond} and r.status <> '{status}'",
                "  on conflict (kind, ref) do nothing;",
                f"update public.rooms r set status = '{status}' from _todo t where t.room_id = r.id and {cats_cond} and r.status <> '{status}';"]
    out.append("")

    leases = [x for x in a["data"] if x["lease_ok"]]
    if leases:
        out.append("create temp table _imp (room_number text, full_name text, phone text, nationality text, id_type text, id_number text, "
                   "birth_date date, address text, start_date date, monthly_rent numeric, common_fee numeric, "
                   "occupancy_type text, occupants jsonb) on commit drop;")
        vals = []
        for x in leases:
            t, l = x["tenant"], x["lease"]
            occ_json = json.dumps(x["occupants"], ensure_ascii=False)
            vals.append("  (" + ", ".join([q(x["room"]), q(t["full_name"]), q(t["phone"]), q(t["nationality"]), q(t["id_type"]),
                                           q(t["id_number"]), q(t["birth_date"]), q(t["address"]), q(l["start"]), q(l["rent"]),
                                           q(l["common_fee"]), q(x["occ"]), q(occ_json) + "::jsonb"]) + ")")
        out.append("insert into _imp values\n" + ",\n".join(vals) + ";\n")
        # $imp$ กันข้อความในข้อมูลชนกับตัวปิดบล็อก · จับคู่ด้วยเลขห้องเท่านั้น
        out.append(f"""do $imp$
declare r record; v_room uuid; v_lease uuid; v_tenant uuid;
begin
  for r in select * from _imp order by room_number loop
    select room_id into v_room from _todo where room_number = r.room_number;
    if not found then continue; end if;  -- ห้องถูกข้าม หรือนำเข้าไปแล้ว
    -- ห้องที่มีสัญญา ACTIVE อยู่แล้ว (แอดมินกรอกไว้ก่อน) = ไม่แตะ
    if exists (select 1 from public.leases where room_id = v_room and status = 'ACTIVE') then continue; end if;
    insert into public.tenants (full_name, phone, nationality) values (r.full_name, r.phone, r.nationality) returning id into v_tenant;
    insert into public.leases (room_id, tenant_id, start_date, monthly_rent, common_fee, status, occupancy_type)
      values (v_room, v_tenant, r.start_date, r.monthly_rent, r.common_fee, 'ACTIVE', r.occupancy_type)
      returning id into v_lease;
    insert into {LOG} (kind, ref) values ('tenant', v_tenant), ('lease', v_lease);
    if r.id_number is not null then
      insert into public.tenant_identity (tenant_id, id_type, id_number, birth_date, address)
        values (v_tenant, r.id_type, r.id_number, r.birth_date, r.address);
    end if;
    insert into public.lease_occupants (lease_id, name) select v_lease, o from jsonb_array_elements_text(r.occupants) o;
  end loop;
end $imp$;
""")

    mrows = [(x["room"], k, v, w) for x in a["data"] for k, (v, w) in x["meter"].items()]
    if mrows:
        out.append(f"-- มิเตอร์ตั้งต้น = เดือนล่าสุด (งวด {period.isoformat()}) · มีแถวเดิมอยู่แล้ว = ไม่ทับ")
        out.append("with ins as (")
        out.append("  insert into public.meter_readings (room_id, period, kind, reading, warning)")
        out.append("  select t.room_id, v.period, v.kind, v.reading, v.warning from (values")
        out.append(",\n".join(f"    ({q(rn)}, {q(period)}, {q(k)}, {q(v)}::numeric, {q(w)}::text)" for rn, k, v, w in mrows))
        out.append("  ) as v(room_number, period, kind, reading, warning) join _todo t on t.room_number = v.room_number")
        out.append("  on conflict (room_id, period, kind) where room_id is not null do nothing")
        out.append("  returning id)")
        out.append(f"insert into {LOG} (kind, ref) select 'meter', id from ins;\n")

    out += [f"insert into {LOG} (kind, ref) select 'done', room_id from _todo;", "",
            price_guard_close(), "",
            "-- สรุป (นับสะสมทุกรอบที่รัน) · เก็บในตารางชั่วคราวแล้วแสดงหลัง commit",
            "create temp table _import_result as",
            "with p as (  -- ห้องในแผนที่มีในฐาน",
            "  select pl.room_number, pl.cat, pl.meters, r.id, r.status::text as status,",
            f"         exists (select 1 from {LOG} g join public.leases l on l.id = g.ref where g.kind = 'lease' and l.room_id = r.id) as got_lease,",
            f"         exists (select 1 from {LOG} g where g.kind = 'room_status' and g.ref = r.id) as status_changed,",
            "         exists (select 1 from public.leases l where l.room_id = r.id and l.status = 'ACTIVE') as has_active",
            "  from _plan pl join public.rooms r on r.room_number = pl.room_number",
            "), c(item, expected, actual, rooms) as (",
            "  select '1 สัญญา', count(*), count(*) filter (where got_lease), string_agg(room_number, ' ' order by room_number) from p where cat = 'lease'",
            "  union all select '2 มีคนเช่า รอเอกสาร', count(*), count(*) filter (where (status = 'occupied' or room_number in ('302', '303', '305')) and not has_active), string_agg(room_number, ' ' order by room_number) from p where cat = 'awaiting'",
            "  union all select '3 ว่าง', count(*), count(*) filter (where status = 'available'), string_agg(room_number, ' ' order by room_number) from p where cat = 'vacant'",
            "  union all select '4 มิเตอร์อย่างเดียว (ตัดสินแล้ว)', count(*), count(*) filter (where not got_lease and not status_changed), string_agg(room_number, ' ' order by room_number) from p where cat = 'decided'",
            f"  union all select '5 รวมห้องที่นำเข้า', count(*), count(*) filter (where exists (select 1 from {LOG} g where g.kind = 'done' and g.ref = p.id)), null from p",
            "  union all select '6 แถวมิเตอร์ที่ลง', coalesce(sum(meters), 0),",
            f"    (select count(*) from {LOG} g join public.meter_readings m on m.id = g.ref where g.kind = 'meter'), null from p",
            "  union all select '7 ห้องที่ข้าม', count(*), count(*), string_agg(room_number, ' ' order by room_number) from _skip",
            "  union all select '8 ตรวจครบ 82 ห้อง (นำเข้า + ข้าม)', "
            f"{len(ALL_ROOMS)}, (select count(*) from p) + (select count(*) from _skip), null",
            ")",
            "select item, expected::bigint, actual::bigint, expected = actual as ok, coalesce(rooms, '') as rooms from c;",
            "", "commit;", "",
            "select * from _import_result order by item;", ""]
    return "\n".join(out)


def build_check_sql(a: dict) -> str:
    """ตรวจก่อน IMPORT: SELECT คำสั่งเดียว อ่านอย่างเดียว · ไม่มีข้อมูลส่วนตัว"""
    s = summary(a)
    need = {"rooms": "id room_number status room_type_id price_override", "room_types": "id", "floor_prices": "floor room_type_id",
            "tenants": "id full_name phone nationality", "tenant_identity": "tenant_id id_type id_number birth_date address",
            "leases": "id room_id tenant_id start_date monthly_rent common_fee status occupancy_type",
            "lease_occupants": "lease_id name", "meter_readings": "id room_id period kind reading warning"}
    cols = ",\n".join(f"    ({q(tb)}, {q(c)})" for tb, cs in need.items() for c in cs.split())
    importing = [r for r, _, _ in plan_rows(a)]
    held = ("values " + ", ".join(f"({q(r)}, {q(why)})" for r, why in sorted(HELD_ROOMS.items()))) if HELD_ROOMS else "select null::text, null::text where false"
    return "\n".join([
        "-- CHECK ก่อน IMPORT ผู้เช่าบุญใส (สร้างโดย import_excel.py · K-BS-IMPORT.2b)",
        "-- อ่านอย่างเดียว: SELECT คำสั่งเดียว ไม่แก้ข้อมูล ไม่มีข้อมูลส่วนตัว · วางทั้งไฟล์แล้วกด Run",
        "with need(tbl, col) as (values",
        cols,
        "), missing_cols as (",
        "  select n.tbl, string_agg(n.col, ', ' order by n.col) filter (where c.column_name is null) as gone",
        "  from need n left join information_schema.columns c on c.table_schema = 'public' and c.table_name = n.tbl and c.column_name = n.col",
        "  group by n.tbl",
        f"), plan(room_number) as (select unnest({qlist(importing)})),",
        f"held(room_number, reason) as ({held}),",
        f"vac(room_number) as (select unnest({qlist(s['vacant'])})),",
        f"occ(room_number) as (select unnest({qlist([r for r in s['leases'] + s['awaiting'] if r not in KEEP_STATUS_ROOMS])}))",
        "select section, item, result, todo from (",
        "  select '1 ตาราง/คอลัมน์' as section, tbl as item, case when gone is null then 'ครบ' else 'ขาด: ' || gone end as result,",
        "         case when gone is null then '' when tbl in ('rooms', 'room_types', 'floor_prices') then 'หยุด แจ้งอลิส (ตารางเว็บหลัก)'",
        "              else 'รัน 010_billing.sql แล้ว 011_bills_insert_draft_only.sql ก่อน' end as todo",
        "  from missing_cols",
        f"  union all select '2 ห้องที่จะถูกข้าม', p.room_number, {q(MISSING_REASON)}, 'รัน IMPORT ได้ · เพิ่มห้องทีหลังแล้วรันซ้ำ'",
        "    from plan p where not exists (select 1 from public.rooms r where r.room_number = p.room_number)",
        "  union all select '2 ห้องที่จะถูกข้าม', room_number, reason, 'ข้ามเสมอ จนกว่าจะตัดสินและออกไฟล์ใหม่' from held",
        "  union all select '3 สถานะว่างไม่ตรง', r.room_number, 'ในฐาน = ' || r.status::text || ' · ไฟล์จะเปลี่ยนเป็น available (ว่าง · ขึ้นหน้าเว็บ)', 'ถามน้องเปาก่อนรัน'",
        "    from public.rooms r join vac v on v.room_number = r.room_number where r.status::text <> 'available'",
        "  union all select '3 สถานะว่างไม่ตรง', r.room_number, 'ในฐาน = available (ว่าง) · ไฟล์จะเปลี่ยนเป็น occupied (มีคนอยู่)', 'ถามน้องเปาก่อนรัน'",
        "    from public.rooms r join occ o on o.room_number = r.room_number where r.status::text = 'available'",
        "  union all select '4 สรุป', 'ห้องที่มีในฐานและจะนำเข้า', count(*)::text || ' ห้อง', ''",
        "    from plan p join public.rooms r on r.room_number = p.room_number",
        "  union all select '4 สรุป', 'สถานะว่างไม่ตรง', (",
        "    (select count(*) from public.rooms r join vac v on v.room_number = r.room_number where r.status::text <> 'available') +",
        "    (select count(*) from public.rooms r join occ o on o.room_number = r.room_number where r.status::text = 'available'))::text || ' ห้อง', ''",
        ") x order by section, item;", ""])


def build_rollback_sql() -> str:
    """ลบเฉพาะแถวที่ไฟล์ IMPORT ใส่ + คืนสถานะห้องเดิม · ไม่มีข้อมูลส่วนตัว"""
    return "\n".join([
        "-- ROLLBACK ของ IMPORT ผู้เช่าบุญใส (สร้างโดย import_excel.py · K-BS-IMPORT.2b)",
        "-- ลบเฉพาะผู้เช่า/สัญญา/มิเตอร์ที่ IMPORT ใส่ (ทุกรอบที่รัน) และคืนสถานะห้องเป็นค่าก่อน IMPORT",
        "-- ⚠ การแก้ข้อมูลแถวเหล่านี้หลัง IMPORT จะหายไปด้วย · ถ้ามีบิลผูกกับสัญญาแล้ว ไฟล์จะหยุดเองและไม่ลบอะไร",
        "drop table if exists pg_temp._rollback_result;",
        "begin;", "",
        "do $$ begin",
        f"  if to_regclass('{LOG}') is null then raise exception 'หยุด: ไม่พบบันทึกของ IMPORT (ยังไม่ได้รัน หรือถอยไปแล้ว)'; end if;",
        "end $$;", "",
        price_guard_open(), "",
        f"delete from public.meter_readings where id in (select ref from {LOG} where kind = 'meter');",
        f"delete from public.leases where id in (select ref from {LOG} where kind = 'lease');",
        f"delete from public.tenants where id in (select ref from {LOG} where kind = 'tenant');",
        f"update public.rooms r set status = g.old_value::room_status from {LOG} g where g.kind = 'room_status' and g.ref = r.id;",
        "",
        price_guard_close(), "",
        f"drop table {LOG};",
        "drop schema bs_import;", "",
        "create temp table _rollback_result as",
        "select (select count(*) from public.tenants) as tenants_left,",
        "       (select count(*) from public.leases) as leases_left,",
        "       (select count(*) from public.meter_readings) as meters_left,",
        "       (select count(*) from public.rooms where status = 'available') as rooms_available;", "",
        "commit;", "",
        "select * from _rollback_result;", ""])


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
    ap.add_argument("xlsx", help="ไฟล์ Excel (เปิดอ่านอย่างเดียว)")
    ap.add_argument("--map", default=str(HERE / "import_map.json"))
    ap.add_argument("--inspect", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="ค่าเริ่มต้นเมื่อไม่ใส่ --emit-sql")
    ap.add_argument("--emit-sql", metavar="PATH")
    ap.add_argument("--emit-rollback", metavar="PATH")
    ap.add_argument("--emit-check", metavar="PATH", help="ไฟล์ตรวจก่อนรัน (SELECT อย่างเดียว)")
    ap.add_argument("--vacant", help="รายการห้องว่าง (เลขห้องคั่นด้วยช่องว่าง/คอมมา หรือ path ไฟล์ข้อความ)")
    ap.add_argument("--period", help="งวดมิเตอร์ YYYY-MM-01 (แทนค่าใน import_map.json)")
    args = ap.parse_args(argv)

    xlsx = Path(args.xlsx)
    if args.inspect:
        inspect(xlsx)
        return 0
    if args.dry_run and (args.emit_sql or args.emit_rollback):
        print("--dry-run ใช้ร่วมกับ --emit-sql/--emit-rollback ไม่ได้", file=sys.stderr)
        return 2
    if bool(args.emit_sql) != bool(args.emit_rollback):
        print("ต้องใส่ --emit-sql คู่กับ --emit-rollback เสมอ", file=sys.stderr)
        return 2
    m = load_map(Path(args.map))
    vacant = load_vacant(args.vacant)
    period = to_date(args.period or m.get("meter_period"), be_auto=False)
    if period in (None, "BAD") and args.emit_sql:
        print("ต้องกำหนดงวดมิเตอร์ (meter_period ใน import_map.json หรือ --period YYYY-MM-01)", file=sys.stderr)
        return 2
    if period not in (None, "BAD") and period.day != 1:
        print("งวดมิเตอร์ต้องเป็นวันที่ 1 ของเดือน", file=sys.stderr)
        return 2
    for p in (args.emit_sql, args.emit_rollback, args.emit_check):
        if p:
            check_output_path(Path(p))
    a = analyse(*read_workbook(xlsx, m), m, vacant)
    print(report(a, None if period in (None, "BAD") else period))
    if args.emit_sql:
        Path(args.emit_sql).write_text(build_sql(a, period), encoding="utf-8", newline="\n")
        Path(args.emit_rollback).write_text(build_rollback_sql(), encoding="utf-8", newline="\n")
        print(f"\nเขียนไฟล์ IMPORT แล้ว: {args.emit_sql}  (มีข้อมูลจริง · รันแล้วลบไฟล์)")
        print(f"เขียนไฟล์ ROLLBACK แล้ว: {args.emit_rollback}")
    if args.emit_check:
        Path(args.emit_check).write_text(build_check_sql(a), encoding="utf-8", newline="\n")
        print(f"เขียนไฟล์ CHECK แล้ว: {args.emit_check}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
