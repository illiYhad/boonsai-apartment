"use client";

import Image from "next/image";
import { useRef, useState } from "react";

export type GalleryItem = { src: string; alt: string; width: number; height: number };

/** แกลเลอรีรูปเล็ก กดดูรูปใหญ่ (dialog ของเบราว์เซอร์ · กด Esc / ปุ่มปิด / คลิกพื้นหลังเพื่อปิด) */
export function Gallery({ items }: { items: GalleryItem[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<GalleryItem | null>(null);

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        {items.map((it) => (
          <button
            key={it.src}
            type="button"
            onClick={() => {
              setOpen(it);
              ref.current?.showModal();
            }}
            aria-label={`ดูรูปใหญ่: ${it.alt}`}
            className="relative aspect-[3/4] min-h-11 cursor-zoom-in overflow-hidden rounded-[20px] border-2 border-cb-border bg-cb-photo p-0"
          >
            <Image src={it.src} alt={it.alt} fill sizes="(max-width: 768px) 45vw, 280px" className="object-contain" />
          </button>
        ))}
      </div>
      <dialog
        ref={ref}
        onClose={() => setOpen(null)}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto max-h-[92vh] w-[min(92vw,720px)] rounded-[24px] border-0 bg-cb-cream p-3 backdrop:bg-black/70"
      >
        {open && (
          <div className="flex flex-col gap-3">
            <Image src={open.src} alt={open.alt} width={open.width} height={open.height} sizes="92vw" className="max-h-[78vh] w-full rounded-[16px] object-contain" />
            <button type="button" onClick={() => ref.current?.close()} className="min-h-12 cursor-pointer rounded-full border-0 bg-cb-brown px-6 text-base font-semibold text-cb-cream">
              ปิด
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
