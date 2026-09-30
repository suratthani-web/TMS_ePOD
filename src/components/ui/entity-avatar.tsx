"use client"

import { useEffect, useState } from "react"
import { Truck, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatGoogleDriveImageUrl } from "@/lib/gdrive/utils"
import { getEntityImageIndex, type EntityImageIndex } from "@/lib/actions/entity-image-actions"

type Kind = "driver" | "vehicle" | "user"

// ดึงดัชนีรูปครั้งเดียวต่อการโหลดหน้า แล้วใช้ร่วมทุก avatar (ไม่ยิงซ้ำต่อแถว)
let indexPromise: Promise<EntityImageIndex | null> | null = null
let indexCache: EntityImageIndex | null = null

function loadIndex() {
  if (!indexPromise) {
    indexPromise = getEntityImageIndex()
      .then((idx) => { indexCache = idx; return idx })
      .catch(() => null)
  }
  return indexPromise
}

/** รูปจากรหัส (Driver_ID / Vehicle_Plate / Username) — null ถ้าไม่มี */
export function useEntityImage(kind: Kind, id?: string | null, enabled = true) {
  const [index, setIndex] = useState<EntityImageIndex | null>(indexCache)
  useEffect(() => {
    if (!enabled || !id || indexCache) return
    let alive = true
    loadIndex().then((idx) => { if (alive) setIndex(idx) })
    return () => { alive = false }
  }, [enabled, id])
  if (!id) return null
  const idx = index || indexCache
  if (!idx) return null
  const group = kind === "driver" ? idx.drivers : kind === "vehicle" ? idx.vehicles : idx.users
  return group[id] || null
}

type EntityAvatarProps = {
  /** ลิงก์รูปตรงๆ (ถ้ามี) — ไม่ส่ง = หาจาก id */
  url?: string | null
  /** Driver_ID / Vehicle_Plate / Username สำหรับหารูปเอง */
  id?: string | null
  /** ชื่อ/ทะเบียน ใช้เป็น alt + ตัวอักษร fallback */
  name?: string | null
  kind?: Kind
  className?: string
}

/**
 * รูปคนขับ / รถ / ผู้ใช้ แบบปลอดภัย: ไม่มีรูป หรือโหลดไม่ได้ (ลิงก์เสีย/ไม่ได้แชร์)
 * → แสดงตัวอักษรแรก (คน) หรือไอคอนรถ แทน ไม่มีไอคอนรูปแตก
 * ใช้ <img> ธรรมดา เพราะ URL มาจากผู้ใช้ (host ไหนก็ได้) — next/image จะ error ถ้า host ไม่อยู่ใน config
 */
export function EntityAvatar({ url, id, name, kind = "driver", className }: EntityAvatarProps) {
  const looked = useEntityImage(kind, id, !url)
  const src = formatGoogleDriveImageUrl(url || looked)
  // จำ src ที่โหลดพัง (ไม่ใช่ boolean) → เปลี่ยนลิงก์ใหม่แล้วลองโหลดอีกครั้งอัตโนมัติ
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null)
  const broken = brokenSrc === src

  const initial = (name || id || "").trim().charAt(0).toUpperCase()

  return (
    <div className={cn("w-9 h-9 rounded-xl overflow-hidden border border-border bg-muted flex items-center justify-center shrink-0", className)}>
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name || kind}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          onError={() => setBrokenSrc(src)}
        />
      ) : kind === "vehicle" ? (
        <Truck className="w-1/2 h-1/2 text-muted-foreground" />
      ) : initial ? (
        <span className="text-xs font-black text-muted-foreground">{initial}</span>
      ) : (
        <User className="w-1/2 h-1/2 text-muted-foreground" />
      )}
    </div>
  )
}
