import { ActionForm } from "@/components/admin/ActionForm";
import { btn, btnPrimary, card, errorBox, field, h1, label, notice } from "@/components/admin/ui";
import { loadPhotos } from "@/lib/admin-data";
import { PHOTO_BUCKET, SUPABASE_URL } from "@/lib/supabase/env";
import { deletePhoto, movePhoto, updatePhoto, uploadPhoto } from "../actions";

const publicUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;

export default async function PhotosPage() {
  const { data, error, mock } = await loadPhotos();
  const { photos, types } = data;

  return (
    <>
      <div>
        <h1 className={h1}>รูป</h1>
        <p className="mt-1 mb-0 text-sm text-muted">JPG · PNG · WebP ไม่เกิน 5 MB ต่อรูป · ผูกกับประเภทห้อง · เรียงลำดับด้วยปุ่มขึ้น/ลง</p>
      </div>
      {error && <p className={errorBox}>โหลดข้อมูลไม่สำเร็จ: {error}</p>}

      <ActionForm action={uploadPhoto} resetOnOk className={`${card} grid grid-cols-1 gap-3`}>
        <label className={label}>
          เลือกรูป
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required className={`${field} py-2`} />
        </label>
        <label className={label}>
          ผูกกับประเภทห้อง (ไม่บังคับ)
          <select name="room_type_id" className={field} defaultValue="">
            <option value="">ไม่ระบุ (รูปทั่วไป)</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          คำอธิบายรูป (ไว้ให้คนตาบอด/SEO)
          <input name="alt_text" maxLength={120} className={field} placeholder="เช่น ห้องแอร์ ชั้น 4" />
        </label>
        <button type="submit" className={btnPrimary}>อัปโหลด</button>
      </ActionForm>

      {!error && photos.length === 0 && <p className={notice}>ยังไม่มีรูป{mock ? " (โหมดทดสอบอัปโหลดไม่ได้จริง)" : ""} — หน้าเว็บยังใช้กล่อง placeholder</p>}

      {photos.map((p, idx) => (
        <div key={p.id} className={`${card} flex flex-col gap-3 ${p.is_published ? "" : "opacity-70"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={publicUrl(p.path)} alt={p.alt_text} loading="lazy" className="aspect-[4/3] w-full rounded-xl bg-[#E7E2D8] object-cover" />
          <ActionForm action={updatePhoto} className="grid grid-cols-1 gap-3">
            <input type="hidden" name="id" value={p.id} />
            <label className={label}>
              ประเภทห้อง
              <select name="room_type_id" defaultValue={p.room_type_id ?? ""} className={field}>
                <option value="">ไม่ระบุ (รูปทั่วไป)</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label className={label}>
              คำอธิบายรูป
              <input name="alt_text" defaultValue={p.alt_text} maxLength={120} className={field} />
            </label>
            <button type="submit" className={btn}>บันทึก</button>
          </ActionForm>
          <div className="grid grid-cols-3 gap-2">
            <ActionForm action={movePhoto}>
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" name="dir" value="up" disabled={idx === 0} className={`${btn} w-full`}>↑ ขึ้น</button>
            </ActionForm>
            <ActionForm action={movePhoto}>
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" name="dir" value="down" disabled={idx === photos.length - 1} className={`${btn} w-full`}>↓ ลง</button>
            </ActionForm>
            <ActionForm action={updatePhoto}>
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" name="publish" value={p.is_published ? "0" : "1"} className={`${btn} w-full`}>{p.is_published ? "ซ่อน" : "แสดง"}</button>
            </ActionForm>
          </div>
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-[#A32020]">ลบรูปนี้</summary>
            <ActionForm action={deletePhoto} className="mt-1">
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" className="min-h-11 w-full cursor-pointer rounded-[10px] border-0 bg-[#A32020] px-4 text-[15px] font-semibold text-white">ยืนยันลบ (กู้คืนไม่ได้)</button>
            </ActionForm>
          </details>
        </div>
      ))}
    </>
  );
}
