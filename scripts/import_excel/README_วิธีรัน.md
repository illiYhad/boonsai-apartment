> [!info] HEADER
> **Requested by:** 🌠 เวก้า (ใบ K-BS-IMPORT.1 + ใบเสริม K-BS-IMPORT.1-sup) · **Author:** ⚡ โคลท์ตัวเขียว · **Assigned:** 👑 พี่หยัด (รันเอง) · 🐱 อลิส (เติมแผนคอลัมน์)
> **Objective:** นำข้อมูลตึกจริงจาก Excel เข้าเว็บบุญใส (82 ห้อง) โดยไม่พิมพ์มือ และข้อมูลจริงไม่ออกนอกเครื่อง
> **Constraint:** ห้ามส่งไฟล์ Excel จริง / ไฟล์ SQL ที่สร้างออกมา เข้า git · แชท · ใบงาน · สคริปต์ไม่ต่อฐานข้อมูลเอง · SQL ยังห้ามรันบนฐานจริงจนกว่าพี่ศิลาเซ็น และ 010/011 ถูกรันแล้ว

# วิธีรันสคริปต์นำเข้า Excel บุญใส

โฟลเดอร์สคริปต์: `D:\Balehm_Studio\01_Clients\Boonsai_Apartment\web\scripts\import_excel\` (หลัง merge · ตอนนี้อยู่ที่ worktree `D:\Balehm_Studio\01_Clients\Boonsai_Apartment\web-import-1\scripts\import_excel\`)
ไฟล์ Excel จริง: `D:\Balehm_Studio\01_Clients\Boonsai_Apartment\00_Source_Excel\Oct v2.xlsx`
ใช้ Python + openpyxl ที่มีในเครื่องแล้ว · ไม่ต้องติดตั้งอะไรเพิ่ม · ทุกคำสั่งเปิด PowerShell ที่โฟลเดอร์สคริปต์ก่อน

## ขั้นตอน (① ② ③ …)

① **ดูหัวตาราง (ไม่แสดงข้อมูลคน)**
```
python import_excel.py "D:\Balehm_Studio\01_Clients\Boonsai_Apartment\00_Source_Excel\Oct v2.xlsx" --inspect
```
แคปผล (มีแค่ชื่อชีตกับหัวคอลัมน์) ส่งให้อลิส → อลิส/โคลท์แก้ `import_map.json` ให้ตรงไฟล์จริง (ตอนนี้เป็นโครงของไฟล์ปลอม) · ห้ามรันขั้น ③ ก่อนแผนคอลัมน์ถูก

② **กรอกไฟล์จับคู่แบบห้อง** (Excel ไม่มีแบบห้อง)
ก๊อป `room_type_map.example.csv` เป็น `D:\Balehm_Studio\01_Clients\Boonsai_Apartment\room_type_map.csv` (นอกโฟลเดอร์ `web\`) แล้วใส่ครบ 82 ห้อง 2 คอลัมน์: `room_number,room_type` · ชื่อแบบห้องต้องตรงเป๊ะกับในเว็บ: `ห้องเปล่า (ไม่มีแอร์)` · `ห้องแอร์` · `Full Unit · 2 เตียง + แอร์` · ห้องที่ไม่ใส่ = สคริปต์ไม่สร้างห้องนั้น (ใช้แบบที่มีในฐานแล้ว) และจะแจ้งในรายงาน · **ห้ามเดาจากค่าเช่า**

③ **dry-run (ไม่เขียนอะไร)**
```
python import_excel.py "D:\Balehm_Studio\01_Clients\Boonsai_Apartment\00_Source_Excel\Oct v2.xlsx" --room-types "D:\Balehm_Studio\01_Clients\Boonsai_Apartment\room_type_map.csv"
```
รายงานมีแค่เลขห้อง + จำนวน (ไม่มีชื่อ/เลขบัตร) · ส่งให้อลิสดูรายการ "ขัดกัน" · ห้องที่ขัดกันจะถูกข้ามสัญญาไว้จนกว่าจะแก้ Excel หรือยืนยัน

④ **สร้างไฟล์ SQL** (ไฟล์นี้มีข้อมูลจริง)
```
python import_excel.py "D:\Balehm_Studio\01_Clients\Boonsai_Apartment\00_Source_Excel\Oct v2.xlsx" --room-types "D:\Balehm_Studio\01_Clients\Boonsai_Apartment\room_type_map.csv" --emit-sql "D:\Balehm_Studio\01_Clients\Boonsai_Apartment\_private\import_บุญใส.sql"
```
สคริปต์จะ**ปฏิเสธ**ถ้าปลายทางอยู่ใต้โฟลเดอร์ `web\` หรือใน git repo ใด ๆ · ถ้าห้องไหนต้องการตั้งสถานะว่างต่างจาก 32 ห้องตามค่าตั้งต้น ใส่ `--vacant "302 303 ..."`

⑤ **รัน SQL** (หลังพี่ศิลาเซ็น + 010/011 รันแล้ว + อลิสสั่งให้รัน)
เปิด Supabase (ฐานข้อมูล) → SQL Editor (ตัวแก้ SQL) → New query (คำถามใหม่) → วางเนื้อไฟล์ → Run (รัน) · รันซ้ำได้ ไม่เพิ่มแถวซ้ำ · ถ้าขึ้นข้อความ "ห้องเหล่านี้ยังไม่มีในฐาน" แปลว่ายังไม่ได้ใส่แบบห้องของห้องนั้น (ขั้น ②)

⑥ **ลบไฟล์ SQL ทันทีหลังรันเสร็จ** (มีเลขบัตรจริง) แล้วบอกอลิส

## อะไรเข้าตารางไหน
| ข้อมูล | ตาราง (010) | หมายเหตุ |
|---|---|---|
| ห้อง + สถานะ ว่าง/เต็ม | `rooms` | ว่าง = รายการ 32 ห้อง · ข้าม 701/702 |
| ชื่อ · เบอร์ · สัญชาติ | `tenants` | |
| เลขบัตร/พาสปอร์ต · วันเกิด · ที่อยู่ | `tenant_identity` | ตามสิทธิ์ที่ 010 กำหนด · เลข 13 หลัก = บัตรประชาชน ที่เหลือ = พาสปอร์ต |
| สัญญา · ค่าเช่า · ส่วนกลาง · โรงรถ · เงินประกัน · ประเภทการเข้าพัก | `leases` | ค่าเช่า = ตาม Excel ไม่ใช่ราคาหน้าเว็บ |
| บริษัทต้นสังกัดห้องพนักงาน | `companies` + `leases.company_id` | |
| ผู้อยู่ร่วม + ทะเบียนรถ | `lease_occupants` | จับคู่ตามลำดับในช่อง |
| มิเตอร์ไฟ/น้ำ **เดือนล่าสุดเท่านั้น** | `meter_readings` | งวดตาม `meter_period` ใน `import_map.json` |
| อัตรา ไฟ 11/27 · น้ำ 20/4 | `rate_settings` | |

## กติกาที่สคริปต์ถือ (ห้ามเดา)
- ประเภทการเข้าพักไม่ชัด · ห้องพนักงานไม่มีบริษัท · ไม่มีวันเริ่มสัญญา → **ไม่สร้างสัญญาห้องนั้น** แจ้งในรายงาน
- มิเตอร์ใหม่ < เก่า หรือติดลบ → ไม่นำเข้ามิเตอร์ห้องนั้น แจ้งในรายงาน
- ไม่ปิดสิทธิ์/RLS ใด ๆ · ไม่แก้ 001–011 · ไม่แก้ `floor_prices`
- ข้อมูลส่วนตัวอยู่ในไฟล์ SQL เท่านั้น ไม่ออกหน้าจอ

## ทดสอบ (ข้อมูลปลอมทั้งหมด)
`python make_fake.py` สร้างไฟล์ปลอม · `python -m unittest discover -s tests -v` รันเทส

## Change Log
| วันที่ | ผู้ดำเนินการ | รายละเอียด | สถานะ |
|---|---|---|---|
| 2026-11-24 | ⚡ โคลท์ตัวเขียว | สร้างสคริปต์ + แผนคอลัมน์ (โครงไฟล์ปลอม) + คู่มือ ตามใบ K-BS-IMPORT.1 / sup | รอ G3 เวก้า |

> [!terminal] FOOTER
> 2026-11-24 · ผลเทสดิบ: `D:\Balehm_Studio\03_Mailbox\04_ACTIVE_THREAD\_checks\k-bs-import-1\raw_test_run.txt` · Signature: ⚡ โคลท์ตัวเขียว
