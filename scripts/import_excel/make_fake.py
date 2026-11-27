#!/usr/bin/env python3
"""สร้าง Excel ปลอม (ชื่อ/เลขบัตร/เบอร์ปลอมทั้งหมด) + ไฟล์จับคู่แบบห้องปลอม + ค่าคาดหวังสำหรับเทส
ผลลัพธ์: tests/fixtures/fake_oct.xlsx · fake_room_type_map.csv · fake_expected.json"""
import csv, datetime as dt, json, sys
from pathlib import Path
from openpyxl import Workbook

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import import_excel as ie  # noqa: E402

FIX = HERE / "tests" / "fixtures"
TYPES = {"empty": "ห้องเปล่า (ไม่มีแอร์)", "air": "ห้องแอร์", "full": "Full Unit · 2 เตียง + แอร์"}


def room_type(room):
    if room in ("401", "402"):
        return TYPES["full"]
    if room in ("410", "414", "415", "416"):
        return TYPES["air"]
    return TYPES["empty"]


def main():
    FIX.mkdir(parents=True, exist_ok=True)
    vacant = set(ie.DEFAULT_VACANT)
    wb = Workbook()
    ws = wb.active
    ws.title = "ข้อมูลลูกค้า"
    ws.append(["ข้อมูลทดสอบ (ปลอมทั้งหมด)"])
    ws.append([])
    ws.append(["ห้อง", "ชื่อ", "นามสกุล", "เลขบัตร/พาสปอร์ต", "สัญชาติ", "เบอร์", "วันเกิด", "ที่อยู่", "วันเริ่มสัญญา",
               "ค่าเช่า", "ค่าส่วนกลาง", "ค่าโรงรถ", "เงินประกัน", "ประเภท", "บริษัท", "ผู้อยู่ร่วม", "ทะเบียนรถ",
               "ไฟเก่า", "ไฟใหม่", "น้ำเก่า", "น้ำใหม่"])
    exp = {"rent_sum": 0, "leases": 0, "meters": {}, "rooms": 82, "vacant": 32, "fake_strings": [],
           "conflict_rooms": {}}
    # ห้องที่ตั้งใจให้ขัดกัน
    VAC_HAS_TENANT, OCC_NO_TENANT, METER_DEC, UNCLEAR, STAFF_NO_CO = "303", "105", "207", "208", "110"
    exp["conflict_rooms"] = {"vac_has_tenant": VAC_HAS_TENANT, "occ_no_tenant": OCC_NO_TENANT, "meter_dec": METER_DEC,
                             "unclear_occ": UNCLEAR, "staff_no_company": STAFF_NO_CO}
    order = ie.ALL_ROOMS + ["701", "702"]
    for n, room in enumerate(order, start=1):
        is_vac = room in vacant
        first, last = f"ทดสอบ{n:02d}", f"ปลอม{n:02d}"
        idn = f"{9000000000000 + n}"
        phone = f"0900000{n:03d}"
        occ, comp, rent, has_tenant = "ผู้เช่า", None, 2000 + (n % 7) * 100, not is_vac
        if room == OCC_NO_TENANT:
            has_tenant = False
        if room == VAC_HAS_TENANT:
            has_tenant = True
        if room in ("109", "206"):
            occ, comp = "พนักงาน", "บริษัททดสอบ จำกัด"
        if room in ("309",) or room == "310":
            pass
        if room == "310":
            occ = "ครอบครัวเจ้าของ"
        if room == UNCLEAR:
            occ = "ไม่ทราบ"
        if room == STAFF_NO_CO:
            occ, comp = "พนักงาน", None
        eo, ew = 1000 + n * 10, 200 + n
        en, wn = eo + 20 + n % 9, ew + 3 + n % 5
        if room == METER_DEC:
            en = eo - 5
        if room in ("701", "702"):
            has_tenant = True
        if has_tenant and room not in ("701", "702"):
            name_cells = [first, last]
        else:
            name_cells = [first, last] if room in ("701", "702") else [None, None]
        row = [room, *name_cells, idn if name_cells[0] else None, "TH" if name_cells[0] else None,
               phone if name_cells[0] else None, dt.date(1990, 1, 1 + n % 27) if name_cells[0] else None,
               f"ที่อยู่ปลอม {n} ถนนทดสอบ" if name_cells[0] else None,
               dt.date(2025, 1 + n % 12, 1 + n % 27) if name_cells[0] else None,
               rent if name_cells[0] else None, 200 if name_cells[0] else None, 0, 3000 if name_cells[0] else None,
               occ if name_cells[0] else None, comp, f"ผู้อยู่ร่วมปลอม{n:02d}" if n % 5 == 0 and name_cells[0] else None,
               f"ทด{n:02d}-{n:04d}" if n % 5 == 0 and name_cells[0] else None, eo, en, ew, wn]
        ws.append(row)
        if room in ("701", "702") or room not in ie.ALL_ROOMS:
            continue
        if name_cells[0]:
            exp["fake_strings"] += [first, last, idn, phone]
        lease_made = (name_cells[0] and not is_vac and room not in (UNCLEAR, STAFF_NO_CO))
        if lease_made:
            exp["leases"] += 1
            exp["rent_sum"] += rent
        if room != METER_DEC:
            exp["meters"][room] = {"ELEC": en, "WATER": wn}
    wb.save(FIX / "fake_oct.xlsx")
    with open(FIX / "fake_room_type_map.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["room_number", "room_type"])
        for r in ie.ALL_ROOMS:
            w.writerow([r, room_type(r)])
    (FIX / "fake_expected.json").write_text(json.dumps(exp, ensure_ascii=False, indent=1), encoding="utf-8")
    print("สร้างไฟล์ปลอมแล้ว:", FIX)


if __name__ == "__main__":
    main()
