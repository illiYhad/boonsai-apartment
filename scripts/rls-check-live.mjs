// ตรวจ RLS บน Supabase จริงด้วย anon key (พี่หยัดรันหลังรัน SQL 001–006) — ไม่ต้องติดตั้งอะไรเพิ่ม
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... node scripts/rls-check-live.mjs
// ไม่เขียนข้อมูลจริง: ถ้า RLS ทำงานถูก ทุกคำสั่งเขียนจะถูกปฏิเสธ/กระทบ 0 แถว · ถ้า RLS รั่ว สคริปต์จะแก้ห้องหนึ่งแถวเป็นสถานะเดิม (ค่าเดิมกลับเข้าไปเอง)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("ตั้ง NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY ก่อน");
  process.exit(2);
}
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
const call = async (method, path, body) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json };
};

let fail = 0;
const check = (name, ok, extra = "") => { if (!ok) fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`); };

// ห้องแรกที่อ่านได้ ไว้ลองแก้ (ค่าเดิมเก็บไว้เผื่อรั่ว)
const rooms = await call("GET", "rooms?select=id,status&limit=1");
check("anon อ่าน rooms ที่เผยแพร่ได้", rooms.status === 200 && Array.isArray(rooms.json) && rooms.json.length > 0, `status ${rooms.status}`);
const room = rooms.json?.[0];

if (room) {
  const upd = await call("PATCH", `rooms?id=eq.${room.id}`, { status: room.status === "available" ? "occupied" : "available" });
  const changed = Array.isArray(upd.json) && upd.json.length > 0;
  check("anon แก้ rooms ไม่ได้", !changed, `status ${upd.status} · แถวที่ถูกแก้ ${Array.isArray(upd.json) ? upd.json.length : 0}`);
  if (changed) await call("PATCH", `rooms?id=eq.${room.id}`, { status: room.status }); // คืนค่าเดิม
}

const inq = await call("GET", "inquiries?select=id&limit=1");
check("anon อ่าน inquiries ไม่ได้", Array.isArray(inq.json) ? inq.json.length === 0 : inq.status >= 400, `status ${inq.status}`);
const ins = await call("POST", "inquiries", { guest_name: "rls-check", phone: "0800000000", consent_at: new Date().toISOString() });
check("anon เขียน inquiries ตรง ๆ ไม่ได้", ins.status >= 400, `status ${ins.status}`);
const set = await call("PATCH", "site_settings?singleton=eq.true", { common_fee: 1 });
check("anon แก้ site_settings ไม่ได้", !(Array.isArray(set.json) && set.json.length > 0), `status ${set.status}`);
const adm = await call("GET", "admin_users?select=user_id&limit=1");
check("anon อ่าน admin_users ไม่ได้", Array.isArray(adm.json) ? adm.json.length === 0 : adm.status >= 400, `status ${adm.status}`);

console.log(fail ? `\nไม่ผ่าน ${fail} ข้อ — อย่าเปิดเว็บจริง` : "\nผ่านทุกข้อ");
process.exit(fail ? 1 : 0);
