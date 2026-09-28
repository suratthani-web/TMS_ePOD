"use server"

import { getSession } from "@/lib/session"
import { isAdmin } from "@/lib/permissions"
import { uploadFileToSupabase } from "@/lib/actions/supabase-upload"

const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}

/**
 * อัปโหลดรูปโปรไฟล์ผู้ใช้ขึ้น Supabase Storage แล้วคืน URL (ยังไม่บันทึกลงผู้ใช้ —
 * ฟอร์มเป็นคนบันทึกตอนกด Save)
 * - ผู้ใช้อัปรูปของตัวเองได้ / อัปของคนอื่นต้องเป็นแอดมิน
 */
export async function uploadUserAvatar(formData: FormData) {
    const session = await getSession()
    if (!session?.userId) return { success: false as const, error: "กรุณาเข้าสู่ระบบ" }

    const targetUsername = String(formData.get("username") || "").trim() || String(session.userId)
    if (targetUsername !== String(session.userId) && !(await isAdmin())) {
        return { success: false as const, error: "ไม่มีสิทธิ์เปลี่ยนรูปของผู้ใช้อื่น" }
    }

    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
        return { success: false as const, error: "ไม่พบไฟล์รูป" }
    }
    const ext = ALLOWED_TYPES[file.type]
    if (!ext) return { success: false as const, error: "รองรับเฉพาะไฟล์ JPG, PNG, WEBP, GIF" }
    if (file.size > MAX_AVATAR_BYTES) return { success: false as const, error: "ไฟล์ใหญ่เกิน 5MB" }

    try {
        const buffer = Buffer.from(await file.arrayBuffer())
        // ใส่ timestamp กัน browser/CDN แคชรูปเก่าเมื่อเปลี่ยนรูป
        const result = await uploadFileToSupabase(buffer, `${targetUsername}_${Date.now()}.${ext}`, file.type, "avatars")
        return { success: true as const, url: result.directLink }
    } catch (e) {
        const message = e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"
        return { success: false as const, error: message }
    }
}
