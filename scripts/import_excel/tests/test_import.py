"""เทส import_excel.py ด้วย Excel ปลอม · unittest ล้วน ไม่ต้องติดตั้งเพิ่ม · รัน: py -3 -m unittest discover -s tests -v (จากโฟลเดอร์ import_excel)"""
import contextlib, io, json, re, sys, tempfile, unittest
from decimal import Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
import import_excel as ie  # noqa: E402

FIX = HERE / "fixtures"
XLSX = FIX / "fake_oct.xlsx"
EXP = json.loads((FIX / "fake_expected.json").read_text(encoding="utf-8"))
C = EXP["cases"]
MAP = ie.load_map(ROOT / "import_map.json")
PERIOD = ie.to_date("2026-10-01", be_auto=False)


def analyse():
    return ie.analyse(*ie.read_workbook(XLSX, MAP), MAP, set(ie.DEFAULT_VACANT))


def run_cli(*args):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        try:
            rc = ie.main([str(a) for a in args])
        except SystemExit as e:
            return e.code if isinstance(e.code, int) else 1, buf.getvalue() + str(e.code)
    return rc, buf.getvalue()


def imp_rooms(sql):
    block = re.search(r"insert into _imp values\n(.*?);\n\ndo", sql, re.S).group(1)
    return set(re.findall(r"^  \('(\d{3})'", block, re.M))


class TestImport(unittest.TestCase):
    def test_counts_add_up_to_82(self):
        s = ie.summary(analyse())
        self.assertEqual(s["total"], 82)
        parts = s["leases"] + s["awaiting"] + s["vacant"] + s["decided"] + s["held"]
        self.assertEqual(sorted(parts), sorted(ie.ALL_ROOMS))
        self.assertEqual(len(s["vacant"]), 29)
        self.assertEqual(sorted(s["decided"]), sorted(r for r in ie.DECIDED_ROOMS))

    def test_rent_comes_from_fee_sheet_per_room(self):
        a = analyse()
        got = {x["room"]: int(x["rent"]) for x in a["data"] if x["lease_ok"]}
        self.assertEqual(got, EXP["leases"])

    def test_rooms_without_lease(self):
        sql = ie.build_sql(analyse(), PERIOD)
        rooms = imp_rooms(sql)
        self.assertEqual(rooms, set(EXP["leases"]))
        for k in ("vac_has_name", "occ_no_name", "rent_zero", "no_start", "no_fee_row"):
            self.assertNotIn(C[k], rooms)
        self.assertFalse(rooms & set(ie.DECIDED_ROOMS))

    def test_decided_rooms_never_get_status_or_lease(self):
        sql = ie.build_sql(analyse(), PERIOD)
        for line in sql.splitlines():
            if line.startswith("update public.rooms"):
                for room in ie.DECIDED_ROOMS:
                    self.assertNotIn(f"'{room}'", line)

    def test_meters_kept_even_when_wrong(self):
        a = analyse()
        by = {x["room"]: x for x in a["data"]}
        got = {r: {k: int(v) for k, (v, _) in x["meter"].items()} for r, x in by.items()}
        self.assertEqual(got, EXP["meters"])
        s = ie.summary(a)
        self.assertEqual(s["meter_rows"], 164)
        self.assertEqual(s["meter_decrease"], [C["meter_dec"]])
        self.assertEqual(s["meter_blank"], sorted([C["meter_blank"], C["meter_text"]]))
        self.assertEqual(by[C["meter_dec"]]["meter"]["ELEC"][1], "DECREASE")

    def test_103_is_imported_and_nothing_is_held(self):
        a = analyse()
        self.assertEqual(ie.summary(a)["held"], [])
        self.assertIn("103", imp_rooms(ie.build_sql(a, PERIOD)))
        self.assertNotIn("insert into _skip values", ie.build_sql(a, PERIOD))

    def test_unconfirmed_rooms_never_get_a_status(self):
        a = analyse()
        s = ie.summary(a)
        self.assertFalse(ie.KEEP_STATUS_ROOMS & set(s["vacant"]))
        sql = ie.build_sql(a, PERIOD)
        updates = [line for line in sql.splitlines() if line.startswith("update public.rooms")]
        self.assertEqual(len(updates), 2)
        for line in updates:
            self.assertIn("t.room_number <> all(array['302','303','305']::text[])", line)

    def test_missing_rooms_are_skipped_not_fatal(self):
        sql = ie.build_sql(analyse(), PERIOD)
        self.assertNotIn("ต้องเพิ่มห้องก่อน", sql)
        self.assertIn("raise notice 'ข้ามห้อง %: %'", sql)
        self.assertTrue(sql.rstrip().endswith("select * from _import_result order by item;"))

    def test_check_file_is_read_only_and_has_no_personal_data(self):
        a = analyse()
        sql = ie.build_check_sql(a)
        code = "\n".join(line for line in sql.splitlines() if not line.startswith("--"))
        bare = re.sub(r"'[^']*'", "''", code)
        self.assertEqual(bare.count(";"), 1)
        self.assertNotRegex(bare, r"(?i)\b(insert|update|delete|create|alter|drop|truncate|grant|revoke|do|call)\b")
        for s in EXP["fake_strings"]:
            self.assertNotIn(s, sql)

    def test_no_price_writes_and_no_parking_fee(self):
        sql = ie.build_sql(analyse(), PERIOD) + ie.build_rollback_sql()
        for table in ("room_types", "floor_prices", "rate_settings", "site_settings"):
            self.assertNotRegex(sql, rf"(insert into|update|delete from) public\.{table}")
        self.assertNotIn("price_override =", sql)
        self.assertNotIn("room_type_id =", sql)
        self.assertNotIn("insert into public.rooms", sql)
        self.assertNotIn("parking_fee", sql)
        self.assertIn("ราคาห้อง", sql)

    def test_tenant_matched_by_room_only(self):
        sql = ie.build_sql(analyse(), PERIOD)
        self.assertNotRegex(sql, r"where[^\n]*full_name")
        self.assertNotIn("update public.tenants", sql)
        self.assertNotIn("update public.leases", sql)

    def test_buddhist_dates_and_passport(self):
        a = analyse()
        by = {x["room"]: x for x in a["data"]}
        self.assertTrue(all(x["lease"]["start"].year == 2025 for x in a["data"] if x["lease_ok"]))
        self.assertEqual(by[C["passport"]]["tenant"]["id_type"], "PASSPORT")
        self.assertIsNone(by[C["passport"]]["tenant"]["nationality"])

    def test_report_and_rollback_have_no_personal_data(self):
        rc, out = run_cli(XLSX, "--dry-run")
        self.assertEqual(rc, 0)
        for s in EXP["fake_strings"]:
            self.assertNotIn(s, out)
            self.assertNotIn(s, ie.build_rollback_sql())

    def test_inspect_does_not_print_data_rows(self):
        rc, out = run_cli(XLSX, "--inspect")
        self.assertEqual(rc, 0)
        for s in EXP["fake_strings"]:
            self.assertNotIn(s, out)

    def test_emit_sql_under_web_is_rejected(self):
        bad = ROOT.parent.parent / "leak_test.sql"
        with tempfile.TemporaryDirectory() as d:
            rc, out = run_cli(XLSX, "--emit-sql", bad, "--emit-rollback", Path(d) / "r.sql")
        self.assertNotEqual(rc, 0)
        self.assertFalse(bad.exists())
        self.assertIn("ปฏิเสธ", out)

    def test_emit_needs_pair_and_is_deterministic(self):
        with tempfile.TemporaryDirectory() as d:
            p = [Path(d) / n for n in ("a.sql", "ra.sql", "b.sql", "rb.sql")]
            self.assertEqual(run_cli(XLSX, "--emit-sql", p[0])[0], 2)
            self.assertEqual(run_cli(XLSX, "--emit-sql", p[0], "--emit-rollback", p[1])[0], 0)
            self.assertEqual(run_cli(XLSX, "--emit-sql", p[2], "--emit-rollback", p[3])[0], 0)
            sa = p[0].read_text(encoding="utf-8")
            self.assertEqual(sa, p[2].read_text(encoding="utf-8"))
            for text in (sa, p[1].read_text(encoding="utf-8")):
                self.assertEqual(len(re.findall(r"^begin;$", text, re.M)), 1)
                self.assertEqual(len(re.findall(r"^commit;$", text, re.M)), 1)


if __name__ == "__main__":
    unittest.main()
