import { InquiryForm } from "@/components/InquiryForm";
import { buildFees, getSiteData } from "@/lib/data";

// ข้อมูลห้องว่างเปลี่ยนจากหลังบ้าน → อ่านใหม่ทุก 60 วิ
export const revalidate = 60;

const fmt = (n: number) => n.toLocaleString("en-US");
const wrap = "mx-auto max-w-[1200px] px-6";
const h2 = "m-0 font-head text-[34px] font-bold leading-tight";

function IconPaw() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="4" r="2" /><circle cx="18" cy="8" r="2" /><circle cx="4" cy="8" r="2" /><path d="M8 14a4 4 0 0 1 8 0c0 3-2 5-4 5s-4-2-4-5z" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.3 9.3 9.3 0 0 1-3-.5L3 21l1.6-4.4A7.9 7.9 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
    </svg>
  );
}
function IconPhone() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}
function IconInfo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
    </svg>
  );
}

function Placeholder({ label, className }: { label: string; className: string }) {
  return <div className={`box-border flex items-center justify-center p-6 text-center ${className}`}>{label}</div>;
}

export default async function Home() {
  const { settings, cards, amenities } = await getSiteData();
  const lineUrl = `https://line.me/R/ti/p/${settings.line_oa}`;
  const telUrl = `tel:${settings.phone.replace(/\D/g, "")}`;
  const minPrice = cards.length ? Math.min(...cards.map((c) => c.price)) : null;
  // มีพิกัดจริง → ปักหมุดตึก · ไม่มี → ค้นจากที่อยู่เหมือนเดิม
  const lat = settings.map_lat === null ? NaN : Number(settings.map_lat);
  const lng = settings.map_lng === null ? NaN : Number(settings.map_lng);
  const mapEmbed = Number.isFinite(lat) && Number.isFinite(lng)
    ? `https://www.google.com/maps?q=${lat},${lng}&z=17&output=embed`
    : `https://www.google.com/maps?q=${encodeURIComponent(settings.address_text)}&output=embed`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ApartmentComplex",
    name: settings.name,
    alternateName: "Boonsai Apartment",
    telephone: settings.phone,
    petsAllowed: true,
    numberOfAccommodationUnits: 72,
    hasMap: settings.google_maps_url,
    address: {
      "@type": "PostalAddress",
      streetAddress: "72/4 ภาณุวงศ์ 3 ต.บางเมืองใหม่",
      addressLocality: "อ.เมืองสมุทรปราการ",
      addressRegion: "สมุทรปราการ",
      postalCode: "10270",
      addressCountry: "TH",
    },
  };

  return (
    <div className="text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <header className="border-b border-line bg-white">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-4`}>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-accent font-head text-xl font-bold text-white">บ</div>
            <div>
              <div className="font-head text-xl font-bold leading-tight">{settings.name}</div>
              <div className="text-[13px] text-subtle">Boonsai Apartment · สมุทรปราการ</div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-5 text-[15px] [&_a]:no-underline">
            <a href="#rooms">ห้องและราคา</a>
            <a href="#pets">สัตว์เลี้ยง</a>
            <a href="#location">ทำเล</a>
            <a href="#contact">ติดต่อ</a>
          </nav>
        </div>
      </header>

      <section className={`${wrap} flex flex-wrap items-center gap-10 pt-14 pb-10`}>
        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-5">
          <div className="inline-flex items-center gap-2 self-start rounded-full bg-pet px-3.5 py-1.5 text-sm font-semibold text-pet-ink">
            <IconPaw />
            Pet Friendly · พาน้องหมาน้องแมวมาอยู่ด้วยได้
          </div>
          <h1 className="m-0 font-head text-[clamp(32px,4.5vw,52px)] font-bold leading-[1.15]">
            ห้องพักใกล้ BTS ปู่เจ้า
            <br />
            อยู่สบาย ปลอดภัย ใกล้แหล่งงาน
          </h1>
          <p className="m-0 text-lg text-body">
            อาคาร 6 ชั้น 72 ห้อง
            {minPrice !== null && (
              <>
                {" "}· เริ่มต้น <strong className="text-ink">{fmt(minPrice)} บาท/เดือน</strong>
              </>
            )}{" "}
            · กล้องวงจรปิด 24 ชม. · ที่จอดรถ {settings.parking_slots} คัน
          </p>
          <div className="mt-1 flex flex-wrap gap-3">
            <a href={lineUrl} className="inline-flex min-h-13 items-center gap-2.5 rounded-[14px] bg-line-green px-6.5 text-[17px] font-semibold text-white no-underline hover:text-white">
              <IconChat />
              ทัก LINE ขอดูห้อง
            </a>
            <a href={telUrl} className="inline-flex min-h-13 items-center gap-2.5 rounded-[14px] border-2 border-accent bg-white px-6 text-[17px] font-semibold no-underline">
              <IconPhone />
              โทร {settings.phone}
            </a>
          </div>
        </div>
        <Placeholder label="[รูปตึกบุญใสจริง · ถ่ายใหม่]" className="h-[400px] min-w-0 flex-[1_1_420px] rounded-3xl border-2 border-dashed border-[#A79F90] bg-[#DCD6CA] text-[#5E574B]" />
      </section>

      <section className={`${wrap} pb-14`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          {[
            ["ใกล้ BTS ปู่เจ้า", "เดินทางเข้าเมืองสะดวก"],
            ["ใกล้อิมพีเรียลเวิลด์ สำโรง", "ใกล้แหล่งงาน สำโรง · เทพารักษ์ · บางพลี"],
            ["เข้า-ออกทางด่วนง่าย", "ใกล้ถนนกาญจนาภิเษก"],
          ].map(([title, sub]) => (
            <div key={title} className="flex flex-col gap-1.5 rounded-[18px] bg-white p-5.5">
              <div className="font-head text-[19px] font-semibold">{title}</div>
              <div className="text-[15px] text-muted">{sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="rooms" className="bg-white py-16">
        <div className={`${wrap} flex flex-col gap-7`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className={h2}>ห้องและราคา</h2>
              <p className="mt-1.5 mb-0 text-muted">ราคาต่อเดือน ยังไม่รวมค่าน้ำ ค่าไฟ และค่าจอดรถ</p>
            </div>
            <div className="flex gap-4 text-sm text-body">
              <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#0E7A4C]" />มีห้องว่าง</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#8B918F]" />เต็ม</span>
            </div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {cards.map((c) => (
              <div key={`${c.floor}-${c.typeName}`} className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-[#FBFAF7]">
                <Placeholder label="[รูปห้องจริง]" className="h-[110px] bg-[#E7E2D8] text-sm text-[#6B6457]" />
                <div className="flex flex-col gap-1.5 p-4">
                  <div className="font-head text-xl font-bold">ชั้น {c.floor}</div>
                  <div className="text-sm text-muted">{c.typeName}</div>
                  <div className="text-xl font-semibold">
                    {fmt(c.price)} <span className="text-sm font-normal text-muted">บาท/เดือน</span>
                  </div>
                  <div className={`mt-1 self-start rounded-full px-3 py-1 text-[13px] font-semibold ${c.available > 0 ? "bg-ok-bg text-ok-ink" : "bg-[#E6E8E7] text-[#4E5553]"}`}>
                    {c.available > 0 ? `ว่าง ${c.available} ห้อง` : "เต็ม"}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            {buildFees(settings).map((f) => (
              <div key={f.label} className="rounded-[14px] bg-cream px-4 py-3.5">
                <div className="text-[13px] text-subtle">{f.label}</div>
                <div className="font-semibold">{f.value}</div>
              </div>
            ))}
          </div>
          {/* แถบไม่มีลิฟต์: ใต้การ์ดห้อง สีเทา เห็นชัดแต่ไม่เด่น — ห้ามย้ายไป Hero ห้ามซ่อน (ใบ B1 ข้อ 3) */}
          <div className="flex items-center gap-2.5 rounded-xl bg-[#EEF1F0] px-4 py-3 text-[15px] text-[#2F3B38]">
            <IconInfo />
            <span>อาคารไม่มีลิฟต์ · ขึ้น-ลงทางบันได (ชั้น 1–6)</span>
          </div>
          <p className="m-0 text-[13px] text-[#6B7472]">สถานะห้องว่างตามโปรฯ ก.ย. 2569 · ของจริงแอดมินกดอัปเดตเองจากมือถือ</p>
        </div>
      </section>

      <section className={`${wrap} flex flex-col gap-6 py-16`}>
        <h2 className={h2}>สิ่งอำนวยความสะดวก</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {amenities.map((a) => (
            <div key={a.name} className="rounded-[14px] bg-white p-4.5 font-medium">{a.name}</div>
          ))}
        </div>
      </section>

      <section id="pets" className="bg-pet py-16">
        <div className={`${wrap} flex flex-wrap items-center gap-8`}>
          <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-3.5">
            <h2 className={`${h2} text-[#4A2D06]`}>ห้องพักที่ต้อนรับสมาชิกตัวเล็กในครอบครัว</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              {[
                ["รับ", "สัตว์เลี้ยงขนาดเล็ก ฉีดวัคซีนแล้ว"],
                ["รวมในค่าห้อง", "ไม่เกิน 2 ตัว/ห้อง"],
                ["ตัวที่ 3 ขึ้นไป", "+500 บาท/ตัว (จ่ายครั้งเดียว)"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-[14px] bg-white p-4">
                  <div className="text-[13px] text-pet-ink">{k}</div>
                  <div className="font-semibold">{v}</div>
                </div>
              ))}
            </div>
            <p className="m-0 text-[#5C3A0C]">ต้องเป็นสัตว์ที่ถูกกฎหมาย ไม่ส่งเสียงดังรบกวนห้องอื่น และไม่มีกลิ่นรบกวน</p>
          </div>
          <Placeholder label="[รูปสัตว์เลี้ยงของผู้เช่าจริง]" className="h-[260px] min-w-0 flex-[1_1_320px] rounded-[20px] border-2 border-dashed border-[#C49B5E] bg-[#F3D8AE] text-[#6B4510]" />
        </div>
      </section>

      <section id="location" className={`${wrap} flex flex-wrap gap-8 py-16`}>
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
          <h2 className={h2}>ทำเลและการเดินทาง</h2>
          <p className="m-0 text-body">{settings.address_text}</p>
          <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">
            {settings.nearby_places.map((p) => (
              <li key={p.name}>{p.name} · {p.note}</li>
            ))}
          </ul>
          <a href={settings.google_maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center self-start rounded-xl border border-line-strong bg-white px-5 font-semibold no-underline">
            เปิดใน Google Maps
          </a>
        </div>
        <iframe
          title={`แผนที่ ${settings.name}`}
          src={mapEmbed}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-80 min-w-0 flex-[1_1_520px] rounded-[20px] border-0 bg-[#DDE5E2]"
        />
      </section>

      <section id="contact" className="bg-accent py-16 text-white">
        <div className={`${wrap} flex flex-wrap gap-10`}>
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
            <h2 className={h2}>นัดดูห้อง</h2>
            <p className="m-0 text-[17px] text-[#DCEDE8]">ทัก LINE เร็วที่สุด หรือฝากเบอร์ไว้ แอดมินโทรกลับ</p>
            <div className="flex flex-wrap gap-3">
              <a href={lineUrl} className="inline-flex min-h-13 items-center rounded-[14px] bg-white px-6 font-semibold text-[#06612F] no-underline">LINE {settings.line_oa}</a>
              <a href={telUrl} className="inline-flex min-h-13 items-center rounded-[14px] border-2 border-white px-6 font-semibold text-white no-underline hover:text-white">โทร {settings.phone}</a>
            </div>
            <p className="m-0 text-sm text-[#DCEDE8]">Facebook: Boonsai Apartment</p>
          </div>
          <InquiryForm />
        </div>
      </section>

      <footer className={`${wrap} flex flex-wrap justify-between gap-3 py-7 text-sm text-subtle`}>
        <span>© {settings.name}</span>
        <span>เว็บไซต์โดย Balehm Studio</span>
      </footer>
    </div>
  );
}
