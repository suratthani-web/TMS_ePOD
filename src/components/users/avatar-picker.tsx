"use client"

import { useRef, useState } from "react"
import { Loader2, Upload, User } from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { formatGoogleDriveImageUrl } from "@/lib/gdrive/utils"
import { uploadUserAvatar } from "@/lib/actions/avatar-actions"

type AvatarPickerProps = {
  value?: string | null
  onChange: (url: string) => void
  /** ผู้ใช้เจ้าของรูป — ว่างไว้ = ตัวเอง */
  username?: string
  fallbackText?: string
}

/**
 * เลือกรูปโปรไฟล์ผู้ใช้: อัปโหลดไฟล์ หรือวางลิงก์ Google Drive / URL รูป
 */
export function AvatarPicker({ value, onChange, username, fallbackText }: AvatarPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [broken, setBroken] = useState(false)
  const preview = formatGoogleDriveImageUrl(value)

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      if (username) fd.append("username", username)
      const res = await uploadUserAvatar(fd)
      if (res.success) {
        setBroken(false)
        onChange(res.url)
        toast.success("อัปโหลดรูปแล้ว — กดบันทึกเพื่อยืนยัน")
      } else {
        toast.error(res.error)
      }
    } catch {
      toast.error("อัปโหลดรูปไม่สำเร็จ")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="flex gap-4 items-center">
      <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-border bg-muted/50 flex-shrink-0 flex items-center justify-center">
        {preview && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Avatar" className="w-full h-full object-cover" onError={() => setBroken(true)} />
        ) : fallbackText ? (
          <span className="text-2xl font-black text-muted-foreground">{fallbackText.charAt(0).toUpperCase()}</span>
        ) : (
          <User className="text-muted-foreground/40" size={24} />
        )}
        {uploading && (
          <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
            <Loader2 className="animate-spin text-primary" size={20} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-border bg-muted/50 text-xs font-bold hover:border-primary/40 disabled:opacity-50"
          >
            <Upload size={14} /> อัปโหลดรูป
          </button>
          {value && (
            <button
              type="button"
              onClick={() => { setBroken(false); onChange("") }}
              className="h-9 px-3 text-xs text-rose-500 hover:underline"
            >
              ล้างรูป
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
        </div>
        <Input
          value={value || ""}
          onChange={(e) => { setBroken(false); onChange(e.target.value) }}
          placeholder="หรือวางลิงก์ Google Drive / URL รูป"
          className="h-10 px-3 rounded-xl bg-muted/50 border-border text-xs"
        />
        {broken && <p className="text-[11px] text-rose-500">โหลดรูปไม่ได้ — ตรวจว่าลิงก์ถูกต้องและแชร์แบบ &quot;ทุกคนที่มีลิงก์&quot;</p>}
      </div>
    </div>
  )
}
