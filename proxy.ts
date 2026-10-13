import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Next 16: proxy.ts (ชื่อเดิม middleware) — ต่ออายุ session + กั้น /admin/* ให้เฉพาะผู้ล็อกอินที่ is_admin() เป็นจริง
// ไม่มี Supabase env → ปล่อยผ่านเฉพาะเครื่อง dev (โหมดทดสอบ) · production ไม่มี env → 503 (ยกเว้น ALLOW_MOCK_IN_PRODUCTION=1 ตอนซ้อมบนเครื่อง)
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_IN_PRODUCTION !== "1") return blocked();
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // ต้องเรียก getUser ทุกครั้ง (ต่ออายุ token) — อย่าใช้ getSession ในที่นี้
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  const toLogin = (denied: boolean) => {
    const login = new URL("/login", request.url);
    if (denied) login.searchParams.set("denied", "1");
    else login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  };
  if (!user) return toLogin(false);
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return toLogin(true);
  return response;
}

const BLOCKED_MESSAGE = "ระบบยังไม่ได้ตั้งค่าฐานข้อมูล — ติดต่อผู้ดูแล";
function blocked() {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>ยังไม่ได้ตั้งค่าระบบ</title></head><body style="font-family:system-ui,sans-serif;background:#F4F1EB;color:#1D2826;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><main style="text-align:center;padding:24px"><h1 style="font-size:22px">${BLOCKED_MESSAGE}</h1><p><a href="/" style="color:#0E5A4C">กลับหน้าแรก</a></p></main></body></html>`;
  return new NextResponse(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export const config = { matcher: ["/admin/:path*"] };
