"""เทส import_excel.py ด้วย Excel ปลอม · unittest ล้วน ไม่ต้องติดตั้งเพิ่ม · รัน: python -m unittest discover -s tests -v (จากโฟลเดอร์ import_excel)"""
import contextlib, io, json, re, subprocess, sys, tempfile, unittest
from decimal import Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
import import_excel as ie  # noqa: E402

FIX = HERE / "fixtures"
XLSX = FIX / "fake_oct.xlsx"
TYPES = FIX / "fake_room_type_map.csv"
EXP = json.loads((FIX / "fake_expected.json").read_text(encoding="utf-8"))
MAP = ie.load_map(ROOT / "import_map.json")


def analyse(room_types=None, vacant=None):
    rt = ie.load_room_types(str(TYPES)) if room_types is None else room_types
    return ie.analyse(ie.read_workbook(XLSX, MAP), MAP, vacant or set(ie.DEFAULT_VACANT), rt), rt


def run_cli(*args):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        try:
            rc = ie.main([str(a) for a in args])
        except SystemExit as e:
            return e.code if isinstance(e.code, int) else 1, buf.getvalue() + str(e.code)
    return rc, buf.getvalue()


class TestImport(unittest.TestCase):
    def test_dry_run_counts(self):
        a, rt = analyse()
        self.assertEqual(len(a["data"]), 82)
        self.assertEqual(sum(1 for x in a["data"] if x["vacant"]), 32)
        self.assertEqual(a["skipped"], ["701", "702"])
        self.assertTrue(all(x["room"] not in ("701", "702") for x in a["data"]))
        self.assertEqual(sum(1 for x in a["data"] if x["lease_ok"]), EXP["leases"])

    def test_rent_sum_matches_fake_file(self):
        a, _ = analyse()
        self.assertEqual(sum((x["rent"] for x in a["data"] if x["lease_ok"]), Decimal(0)), Decimal(EXP["rent_sum"]))

    def test_meter_base_matches_fake_file(self):
        a, _ = analyse()
        got = {x["room"]: {k: int(v) for k, v in x["meter"].items()} for x in a["data"] if x["meter"]}
        self.assertEqual(got, EXP["meters"])

    def test_conflicts_detected_at_least_three_kinds(self):
        a, _ = analyse()
        c = EXP["conflict_rooms"]
        iss = a["issues"]
        self.assertIn(c["vac_has_tenant"], iss["อยู่ในรายการว่างแต่มีชื่อผู้เช่า"])
        self.assertIn(c["occ_no_tenant"], iss["ไม่อยู่ในรายการว่างแต่ไม่มีผู้เช่า"])
        self.assertIn(c["meter_dec"], iss["มิเตอร์ใหม่ < เก่า (ไม่นำเข้ามิเตอร์ห้องนี้)"])
        self.assertIn(c["unclear_occ"], iss["ประเภทการเข้าพักไม่ชัด (ไม่สร้างสัญญา)"])
        self.assertIn(c["staff_no_company"], iss["ห้องพนักงานไม่มีบริษัทต้นสังกัด (ไม่สร้างสัญญา)"])
        self.assertGreaterEqual(len(iss), 3)

    def test_report_has_no_personal_data(self):
        rc, out = run_cli(XLSX, "--room-types", TYPES)
        self.assertEqual(rc, 0)
        for s in EXP["fake_strings"]:
            self.assertNotIn(s, out)
        self.assertNotIn("ปลอม", out.replace("ไฟล์ปลอม", ""))

    def test_inspect_does_not_print_data_rows(self):
        rc, out = run_cli(XLSX, "--inspect")
        self.assertEqual(rc, 0)
        for s in EXP["fake_strings"]:
            self.assertNotIn(s, out)
        self.assertLessEqual(len(out.splitlines()), 4)

    def test_emit_sql_under_web_is_rejected(self):
        rc, out = run_cli(XLSX, "--emit-sql", ROOT.parent.parent / "leak_test.sql", "--room-types", TYPES)
        self.assertNotEqual(rc, 0)
        self.assertFalse((ROOT.parent.parent / "leak_test.sql").exists())
        self.assertIn("ปฏิเสธ", out)

    def test_emit_sql_outside_repo_ok_and_deterministic(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d) / "a.sql", Path(d) / "b.sql"
            self.assertEqual(run_cli(XLSX, "--emit-sql", a, "--room-types", TYPES)[0], 0)
            self.assertEqual(run_cli(XLSX, "--emit-sql", b, "--room-types", TYPES)[0], 0)
            sa = a.read_text(encoding="utf-8")
            self.assertEqual(sa, b.read_text(encoding="utf-8"))
            self.assertTrue(sa.lstrip().startswith("--") and "begin;" in sa and sa.rstrip().endswith("commit;"))
            self.assertEqual(len(re.findall(r"insert into public\.rooms \(", sa)), 82)

    def test_room_without_type_reported_and_not_inserted(self):
        rt = ie.load_room_types(str(TYPES))
        for r in ("201", "502"):
            rt.pop(r)
        a, _ = analyse(rt)
        self.assertEqual(sorted(a["no_type"]), ["201", "502"])
        sql = ie.build_sql(a, MAP, rt, ie.to_date("2026-10-01", be_auto=False))
        self.assertNotRegex(sql, r"insert into public\.rooms \([^\n]*select '201'")
        self.assertNotRegex(sql, r"insert into public\.rooms \([^\n]*select '502'")
        self.assertIn("update public.rooms set status = 'occupied'::room_status where room_number = '201'", sql.replace("'occupied'", "'occupied'"))
        rep = ie.report(a, rt, None)
        self.assertIn("201, 502", rep)

    def test_no_room_types_file_means_no_room_insert(self):
        a, _ = analyse({})
        sql = ie.build_sql(a, MAP, {}, ie.to_date("2026-10-01", be_auto=False))
        self.assertNotIn("insert into public.rooms (", sql)
        self.assertEqual(len(a["no_type"]), 82)

    def test_conflict_rooms_have_no_lease_in_sql(self):
        a, rt = analyse()
        sql = ie.build_sql(a, MAP, rt, ie.to_date("2026-10-01", be_auto=False))
        m = re.search(r"insert into _imp values\n(.*?);\n", sql, re.S)
        rooms_in_imp = set(re.findall(r"^  \('(\d{3})'", m.group(1), re.M))
        c = EXP["conflict_rooms"]
        for k in ("occ_no_tenant", "unclear_occ", "staff_no_company"):
            self.assertNotIn(c[k], rooms_in_imp)
        self.assertEqual(len(rooms_in_imp), EXP["leases"])

    def test_buddhist_year_dates_converted(self):
        import datetime as dt
        self.assertEqual(ie.to_date(dt.date(2569, 10, 1)), dt.date(2026, 10, 1))


if __name__ == "__main__":
    unittest.main()
