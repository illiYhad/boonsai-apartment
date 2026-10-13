import Image from "next/image";
import { FloatingLine } from "@/components/FloatingLine";
import { Gallery, type GalleryItem } from "@/components/Gallery";
import { InquiryForm } from "@/components/InquiryForm";
import { buildFees, fullFloorsLabel, getSiteData, visibleCards } from "@/lib/data";

// ข้อมูลห้องว่างเปลี่ยนจากหลังบ้าน → อ่านใหม่ทุก 60 วิ
export const revalidate = 60;

const fmt = (n: number) => n.toLocaleString("en-US");
const wrap = "mx-auto max-w-[1200px] px-6";
const h2 = "m-0 font-display text-[clamp(28px,4vw,36px)] font-semibold leading-tight";
const pill = "inline-flex min-h-13 items-center gap-2.5 rounded-full px-6 text-[17px] font-semibold no-underline";

// คลิปเดิมจากพี่ไอซ์ · พี่หยัดอนุมัติ 2026-10-13 · มีข้อความโปรฯ ก.ย. ในคลิป (ยกเว้นเฉพาะตัวคลิป · ข้อความบนหน้าเว็บยังห้าม)
const VIDEO: { src: string; poster: string } | null = { src: "/media/boonsai.mp4", poster: "/media/boonsai-poster.jpg" };

// โปสเตอร์ใช้ฉบับที่อลิสแก้ (2,200 / @371dkpvl) · พี่หยัดอนุมัติ 2026-10-13
const GALLERY: GalleryItem[] = [
  { src: "/brand/welcome-square.webp", alt: "ป้ายต้อนรับ Boonsai Apartment มีคาปิบาร่า หมา และแมว", width: 1200, height: 1200 },
  { src: "/brand/poster-capy-coffee.webp", alt: "โปสเตอร์บุญใส คาปิบาร่าถือกาแฟ ราคาเริ่มต้น 2,200 บาท/เดือน", width: 1054, height: 1492 },
];

function Icon({ d, size = 20 }: { d: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}
const IconPaw = () => <Icon size={24} d={<><circle cx="11" cy="4" r="2" /><circle cx="18" cy="8" r="2" /><circle cx="4" cy="8" r="2" /><path d="M8 14a4 4 0 0 1 8 0c0 3-2 5-4 5s-4-2-4-5z" /></>} />;
const IconChat = () => <Icon d={<path d="M21 11.5a8.4 8.4 0 0 1-9 8.3 9.3 9.3 0 0 1-3-.5L3 21l1.6-4.4A7.9 7.9 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />} />;
const IconInfo = () => <Icon d={<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>} />;

function Placeholder({ label, className }: { label: string; className: string }) {
  return <div className={`box-border flex items-center justify-center p-6 text-center ${className}`}>{label}</div>;
}

export default async function Home() {
  const { settings, cards, amenities } = await getSiteData();
  const lineUrl = `https://line.me/R/ti/p/${settings.line_oa}`;
  const telUrl = `tel:${settings.phone.replace(/\D/g, "")}`;
  const shown = visibleCards(cards);
  const fullFloors = fullFloorsLabel(cards);
  const minPrice = shown.length ? Math.min(...shown.map((c) => c.price)) : null;

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
    <div className="bg-cb-cream pb-20 text-cb-brown">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <header className="bg-cb-brown text-cb-cream">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-3.5`}>
          <div className="flex items-center gap-3">
            <div className="flex size-11.5 items-center justify-center rounded-full bg-cb-gold text-cb-brown">
              <IconPaw />
            </div>
            <div>
              <div className="font-display text-[21px] font-semibold leading-tight">Boonsai Apartment</div>
              <div className="text-[13px] text-[#E8D3B6]">{settings.name} · Cafe &amp; Apartment</div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-1 text-[15px] [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:text-cb-cream [&_a]:no-underline">
            <a href="#rooms">ห้องและราคา</a>
            <a href="#pets">น้องๆ อยู่ได้</a>
            <a href="#location">ทำเล</a>
            <a href="#contact">นัดดูห้อง</a>
          </nav>
        </div>
      </header>

      <section className="bg-cb-sand">
        <div className={`${wrap} flex flex-wrap items-end gap-8 pt-12`}>
          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-4.5 pb-12">
            <div className="self-start rounded-full border-2 border-dashed border-cb-tan bg-white px-4 py-1.5 text-sm font-semibold text-cb-link">
              Cozy place, happy life · ที่พักสบายใจ เหมือนอยู่บ้าน
            </div>
            <h1 className="m-0 font-display text-[clamp(32px,5vw,58px)] font-semibold leading-[1.15]">
              ห้องพักใกล้ BTS ปู่เจ้า
              <br />
              <span className="text-cb-orange">พาน้องหมาน้องแมว</span>
              <br />
              มาอยู่ด้วยกันได้
            </h1>
            <p className="m-0 text-lg text-cb-text">อาคาร 6 ชั้น 72 ห้อง · มีคาเฟ่ในอาคาร · กล้องวงจรปิด 24 ชม. · ที่จอดรถ {settings.parking_slots} คัน</p>
            <div className="flex flex-wrap items-center gap-3.5">
              {minPrice !== null && (
                <div className="rounded-[22px] bg-white px-5.5 py-3 shadow-[0_6px_0_var(--color-cb-tan)]">
                  <div className="text-sm text-cb-link">ราคาเริ่มต้น</div>
                  <div className="font-display text-[40px] font-semibold leading-none text-cb-orange">
                    {fmt(minPrice)} <span className="font-sans text-base font-normal text-cb-text">บาท/เดือน</span>
                  </div>
                </div>
              )}
              <a href={lineUrl} className={`${pill} bg-line-green text-white hover:text-white`}>
                <IconChat />
                ทัก LINE ขอดูห้อง
              </a>
              <a href={telUrl} className={`${pill} border-2 border-cb-brown text-cb-brown hover:text-cb-brown`}>
                โทร {settings.phone}
              </a>
            </div>
          </div>
          <div className="flex min-w-0 flex-[1_1_380px] justify-center">
            <Image src="/brand/capy-coffee.jpg" alt="คาปิบาร่าบุญใส ถือแก้วกาแฟ" width={486} height={490} priority sizes="(max-width: 768px) 90vw, 440px" className="block h-auto w-full max-w-[440px] rounded-t-[32px]" />
          </div>
        </div>
      </section>

      <section className={`${wrap} pt-8 pb-12`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
          {[
            ["เลี้ยงสัตว์ได้", "น้องๆ อยู่ด้วยกันได้เลย"],
            ["ใกล้ BTS ปู่เจ้า", "ใกล้อิมพีเรียลเวิลด์ สำโรง"],
            ["มีคาเฟ่ในอาคาร", "Moon n Sun · ใกล้ห้องคุณ"],
            ["ผ่อนมัดจำได้", "จองล็อกห้องได้ไม่เกิน 7 วัน"],
          ].map(([title, sub]) => (
            <div key={title} className="rounded-[20px] border-2 border-cb-border bg-white p-5">
              <div className="font-display text-[19px] font-medium">{title}</div>
              <div className="text-sm text-cb-muted">{sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="rooms" className="rounded-t-[40px] bg-white py-16">
        <div className={`${wrap} flex flex-col gap-6`}>
          <div>
            <h2 className={h2}>ห้องว่างตอนนี้</h2>
            <p className="mt-1 mb-0 text-cb-muted">ราคาต่อเดือน ยังไม่รวมค่าน้ำ ค่าไฟ ค่าจอดรถ</p>
          </div>
          {shown.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4.5">
              {shown.map((c) => (
                <div key={`${c.floor}-${c.typeName}`} className="flex flex-col overflow-hidden rounded-3xl border-2 border-cb-border bg-cb-cream">
                  <div className="relative">
                    <Placeholder label="[รูปห้องจริง]" className="h-[150px] bg-cb-photo text-sm text-[#8A6A50]" />
                    <span className="absolute top-3 left-3 rounded-full bg-cb-brown px-3 py-1 text-[13px] font-semibold text-cb-cream">ชั้น {c.floor}</span>
                    <span className="absolute top-3 right-3 rounded-full bg-cb-olive px-3 py-1 text-[13px] font-semibold text-white">ว่าง {c.available} ห้อง</span>
                  </div>
                  <div className="flex flex-col gap-1 px-4.5 pt-4 pb-4.5">
                    <div className="text-[15px] text-cb-text">{c.typeName}</div>
                    <div className="font-display text-[28px] font-semibold leading-tight text-cb-orange">
                      {fmt(c.price)} <span className="font-sans text-sm font-normal text-cb-muted">บาท/เดือน</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="m-0 rounded-2xl bg-cb-cream px-5 py-4 text-cb-text">ตอนนี้ห้องเต็มทุกชั้น — ทัก LINE เพื่อสอบถามห้องว่างล่าสุด</p>
          )}
          {fullFloors && <p className="m-0 text-[15px] font-medium text-cb-muted">{fullFloors}</p>}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            {buildFees(settings).map((f) => (
              <div key={f.label} className="rounded-2xl bg-cb-cream px-4 py-3.5">
                <div className="text-[13px] text-cb-muted">{f.label}</div>
                <div className="font-semibold">{f.value}</div>
              </div>
            ))}
          </div>
          {/* แถบไม่มีลิฟต์: ใต้การ์ดห้อง เห็นชัดแต่ไม่เด่น — ห้ามย้ายไป Hero ห้ามซ่อน (ใบ B1 ข้อ 3 / B5 ข้อ 7) */}
          <div className="flex items-center gap-2.5 rounded-[14px] bg-[#F1ECE6] px-4 py-3 text-[15px] text-[#4A3628]">
            <IconInfo />
            <span>อาคารไม่มีลิฟต์ · ขึ้น-ลงทางบันได (ชั้น 1–6)</span>
          </div>
        </div>
      </section>

      <section id="booking" className="bg-cb-sand py-16">
        <div className={`${wrap} flex flex-col gap-5`}>
          <h2 className={h2}>จองห้องง่ายๆ</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
            {[
              ["ผ่อนมัดจำได้", "แบ่งจ่ายสบาย ไม่ต้องจ่ายก้อนเดียว"],
              ["จองล็อกห้องได้ไม่เกิน 7 วัน", "จองไว้ก่อนได้ ไม่ต้องรีบตัดสินใจวันนี้"],
              ["ชำระเงินจองแล้ว ล็อกห้องไว้ให้", "ทางอพาร์ตเมนต์จะล็อกห้องไว้ให้ ไม่นำห้องไปปล่อยให้ผู้อื่น"],
            ].map(([title, sub]) => (
              <div key={title} className="rounded-[20px] bg-white p-5">
                <div className="font-display text-[19px] font-medium">{title}</div>
                <div className="text-sm text-cb-muted">{sub}</div>
              </div>
            ))}
          </div>
          <p className="m-0 text-[13px] font-medium text-cb-text">*เงินจองที่ชำระแล้วไม่สามารถขอคืนได้ทุกกรณี</p>
        </div>
      </section>

      <section id="pets" className="bg-cb-brown py-16 text-cb-cream">
        <div className={`${wrap} flex flex-wrap items-center gap-9`}>
          <div className="min-w-0 flex-[1_1_520px]">
            <Image src="/brand/capy-group.jpg" alt="คาปิบาร่า หมา และแมว ต้อนรับผู้เช่า" width={1090} height={556} sizes="(max-width: 768px) 92vw, 560px" className="block h-auto w-full rounded-[28px]" />
          </div>
          <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-3.5">
            <h2 className={h2}>
              ห้องพักที่ต้อนรับ
              <br />
              สมาชิกตัวเล็กในครอบครัว
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
              {[
                ["รับ", "ขนาดเล็ก ฉีดวัคซีนแล้ว"],
                ["รวมในค่าห้อง", "ไม่เกิน 2 ตัว/ห้อง"],
                ["ตัวที่ 3 ขึ้นไป", "+500 บาท/ตัว (จ่ายครั้งเดียว)"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-cb-cream p-3.5 text-cb-brown">
                  <div className="text-[13px] text-cb-link">{k}</div>
                  <div className="font-semibold">{v}</div>
                </div>
              ))}
            </div>
            <p className="m-0 text-[#E8D3B6]">ต้องเป็นสัตว์ที่ถูกกฎหมาย ไม่ส่งเสียงดังรบกวนห้องอื่น และไม่มีกลิ่นรบกวน</p>
          </div>
        </div>
      </section>

      <section id="cafe" className={`${wrap} py-16`}>
        <div className="flex flex-wrap items-stretch gap-6 rounded-[28px] border-2 border-cb-border bg-white p-6">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col justify-center gap-3">
            <h2 className={h2}>คาเฟ่ในอาคาร · Moon n Sun</h2>
            <p className="m-0 text-lg text-cb-text">มีคาเฟ่ของทางอพาร์ตเมนต์เอง สะดวก ใกล้ห้องคุณ</p>
          </div>
          <Placeholder label="[รูปคาเฟ่ Moon n Sun · รอไฟล์]" className="min-h-[200px] min-w-0 flex-[1_1_320px] rounded-[20px] border-2 border-dashed border-cb-tan bg-cb-photo text-sm text-[#8A6A50]" />
        </div>
      </section>

      <section id="about" className={`${wrap} flex flex-col gap-6 pb-16`}>
        <h2 className={h2}>รู้จักบุญใส</h2>
        <div className="flex flex-wrap gap-6">
          <div className="min-w-0 flex-[1_1_480px]">
            {VIDEO ? (
              <video controls playsInline preload="none" poster={VIDEO.poster} className="aspect-video w-full rounded-[24px] bg-cb-brown">
                <source src={VIDEO.src} type="video/mp4" />
              </video>
            ) : (
              <Placeholder label="[วิดีโอแนะนำบุญใส · รอคลิปใหม่]" className="aspect-video w-full rounded-[24px] border-2 border-dashed border-cb-tan bg-cb-photo text-sm text-[#8A6A50]" />
            )}
          </div>
          <div className="min-w-0 flex-[1_1_340px]">
            <Gallery items={GALLERY} />
          </div>
        </div>
      </section>

      <section className={`${wrap} flex flex-col gap-5 pb-6`}>
        <h2 className={h2}>สิ่งอำนวยความสะดวก</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
          {amenities.map((a) => (
            <div key={a.name} className="rounded-2xl bg-white p-4 font-medium">{a.name}</div>
          ))}
        </div>
      </section>

      <section id="location" className={`${wrap} flex flex-wrap gap-7 pt-10 pb-16`}>
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
          <h2 className={h2}>ทำเลดี เดินทางสะดวก</h2>
          <p className="m-0 text-cb-text">{settings.address_text}</p>
          <ul className="m-0 flex flex-col gap-1.5 pl-5 text-cb-text">
            {settings.nearby_places.map((p) => (
              <li key={p.name}>{p.name} · {p.note}</li>
            ))}
          </ul>
          <a href={settings.google_maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center self-start rounded-full bg-cb-brown px-5 font-semibold text-cb-cream no-underline hover:text-cb-cream">
            เปิดใน Google Maps
          </a>
        </div>
        <iframe
          title={`แผนที่ ${settings.name}`}
          src={mapEmbed}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-80 min-w-0 flex-[1_1_520px] rounded-[28px] border-0 bg-cb-photo"
        />
      </section>

      <section id="contact" className="bg-cb-orange py-16 text-white">
        <div className={`${wrap} flex flex-wrap items-start gap-10`}>
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-3.5">
            <h2 className={`${h2} text-[clamp(30px,4vw,38px)]`}>สนใจทักเลย!</h2>
            <p className="m-0 text-[17px] text-[#FCE6D3]">ทัก LINE เร็วที่สุด หรือฝากเบอร์ไว้ แอดมินโทรกลับ</p>
            <div className="flex flex-wrap gap-3">
              <a href={lineUrl} className="inline-flex min-h-13 items-center rounded-full bg-white px-6 font-semibold text-[#06612F] no-underline hover:text-[#06612F]">LINE {settings.line_oa}</a>
              <a href={telUrl} className="inline-flex min-h-13 items-center rounded-full border-2 border-white px-6 font-semibold text-white no-underline hover:text-white">โทร {settings.phone}</a>
            </div>
            <p className="m-0 text-sm text-[#FCE6D3]">Facebook: Boonsai Apartment</p>
          </div>
          <InquiryForm />
        </div>
      </section>

      <footer className="bg-cb-brown text-[#E8D3B6]">
        <div className={`${wrap} flex flex-wrap justify-between gap-3 py-6 text-sm`}>
          <span>© Boonsai Cafe &amp; Apartment</span>
          <span>เว็บไซต์โดย Balehm Studio</span>
        </div>
      </footer>

      <FloatingLine href={lineUrl} />
    </div>
  );
}
