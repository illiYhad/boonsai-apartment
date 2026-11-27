#!/usr/bin/env python3
"""สร้าง Excel ปลอม (ชื่อ/เลขบัตร/เบอร์ปลอมทั้งหมด) ผังเดียวกับไฟล์จริง + ค่าคาดหวังสำหรับเทส
ผลลัพธ์: tests/fixtures/fake_oct.xlsx · fake_expected.json"""
import datetime as dt, json, sys
from pathlib import Path
from openpyxl import Workbook
from openpyxl.utils import column_index_from_string as ci

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import import_excel as ie  # noqa: E402

FIX = HERE / "tests" / "fixtures"
# ห้องที่ตั้งใจให้เป็นกรณีพิเศษ
CASES = {"vac_has_name": "305", "occ_no_name": "203", "rent_zero": "101", "no_start": "301",
         "passport": "307", "meter_dec": "206", "meter_blank": "304", "meter_text": "306", "no_fee_row": "308"}


def put(ws, row, col, value):
    ws.cell(row=row, column=ci(col), value=value)


def main():
    FIX.mkdir(parents=True, exist_ok=True)
    m = ie.load_map(HERE / "import_map.json")
    cols, fee = m["columns"], m["fee_sheet"]
    vacant = set(ie.DEFAULT_VACANT)
    wb = Workbook()
    ws = wb.active
    ws.title = m["sheet"]
    ws.cell(row=1, column=1, value="ข้อมูลทดสอบ (ปลอมทั้งหมด)")
    fs = wb.create_sheet(fee["sheet"])
    exp = {"cases": CASES, "leases": {}, "meters": {}, "fake_strings": []}
    row, fee_row = m["first_data_row"], fee["first_data_row"]
    for n, room in enumerate(ie.ALL_ROOMS + ["701", "702"], start=1):
        has_name = room not in vacant and room not in (CASES["occ_no_name"], "701", "702")
        if room == CASES["vac_has_name"]:
            has_name = True
        rent = 0 if room == CASES["rent_zero"] else 2000 + (n % 7) * 100
        idn = "AB%07d" % n if room == CASES["passport"] else str(9000000000000 + n)
        put(ws, row, cols["room"], int(room))
        if has_name:
            first, last, phone, addr = f"ทดสอบ{n:02d}", f"ปลอม{n:02d}", f"0900000{n:03d}", f"ที่อยู่ปลอม {n} ถนน'ทดสอบ' $$"
            put(ws, row, cols["first_name"], first)
            put(ws, row, cols["last_name"], last)
            put(ws, row, cols["id_number"], idn)
            put(ws, row, cols["phone"], phone)
            put(ws, row, cols["address"], addr)
            if room != CASES["no_start"]:
                put(ws, row, cols["start_date"], dt.datetime(2568, 1 + n % 12, 1 + n % 27))  # พ.ศ.
            if n % 5 == 0:
                put(ws, row, cols["occupants"], f"ผู้อยู่ร่วมปลอม{n:02d}")
            exp["fake_strings"] += [first, last, idn, phone, addr]
        eo, ew = 1000 + n * 10, 200 + n
        en, wn = eo + 20 + n % 9, ew + 3 + n % 5
        if room == CASES["meter_dec"]:
            en = eo - 5
        if room == CASES["meter_blank"]:
            en = None
        if room == CASES["meter_text"]:
            wn = "เสีย"
        put(ws, row, cols["elec_old"], str(eo))
        put(ws, row, cols["elec_new"], en)
        put(ws, row, cols["water_old"], str(ew))
        put(ws, row, cols["water_new"], wn)
        row += 1
        if room != CASES["no_fee_row"] and room not in ("701", "702"):
            put(fs, fee_row, fee["columns"]["room"], int(room))
            put(fs, fee_row, fee["columns"]["rent"], rent)
            put(fs, fee_row, fee["columns"]["common_fee"], None if room == "304" else 200)
            fee_row += 1
        if room not in ie.ALL_ROOMS:
            continue
        exp["meters"][room] = {"ELEC": 0 if en is None else en, "WATER": 0 if isinstance(wn, str) else wn}
        no_lease = (CASES["rent_zero"], CASES["no_start"], CASES["no_fee_row"])
        if has_name and room not in vacant and room not in ie.DECIDED_ROOMS and room not in no_lease:
            exp["leases"][room] = rent
    wb.save(FIX / "fake_oct.xlsx")
    (FIX / "fake_expected.json").write_text(json.dumps(exp, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print("สร้างไฟล์ปลอมแล้ว:", FIX)


if __name__ == "__main__":
    main()
