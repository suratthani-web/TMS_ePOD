/**
 * Telegram integration — ช่องแจ้งเตือนเสริมจาก Web Push + LINE
 *
 * รองรับ 2 รูปแบบ:
 *  1) กลุ่มแอดมินภายใน (env TELEGRAM_CHAT_ID) — sendTelegramAlert()
 *  2) ส่วนตัวรายคน (chat_id ต่อ user/ลูกค้าใน DB) — sendTelegramText()
 *
 * ฟรี ไม่มีลิมิตแบบ LINE (300 pushes/เดือน). ทำงานแบบ opt-in: ถ้าไม่ตั้ง env token
 * ทุกฟังก์ชันจะเป็น no-op เงียบๆ ไม่กระทบระบบเดิม
 *
 * ENV:
 *   TELEGRAM_BOT_TOKEN     — token จาก @BotFather (จำเป็นสำหรับส่งทุกแบบ)
 *   TELEGRAM_CHAT_ID       — chat/group id ของกลุ่มแอดมิน (สำหรับ sendTelegramAlert)
 *   TELEGRAM_BOT_USERNAME  — username บอท (ไม่มี @) ใช้สร้างลิงก์ผูกบัญชี
 *   TELEGRAM_WEBHOOK_SECRET— secret ตรวจสอบ webhook (ตั้งตอน setWebhook)
 */

/** มี token → ส่งข้อความแบบเจาะ chat_id ได้ */
export function hasTelegramBot(): boolean {
    return !!process.env.TELEGRAM_BOT_TOKEN
}

/**
 * ตรวจสอบว่าเปิดส่งแจ้งเตือน Telegram หรือไม่
 * ปิดการแจ้งเตือนชั่วคราว (เนื่องจากยังไม่มีผู้ใช้งาน)
 * หากต้องการเปิดใช้งาน ให้ตั้งค่า TELEGRAM_NOTIFICATIONS_ENABLED=true ใน Environment Variables
 */
export function isTelegramNotificationsEnabled(): boolean {
    return process.env.TELEGRAM_NOTIFICATIONS_ENABLED === 'true'
}

/** มีทั้ง token + กลุ่มแอดมิน → sendTelegramAlert() ใช้งานได้ */
export function isTelegramConfigured(): boolean {
    return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
}

// escape อักขระที่ MarkdownV2 ของ Telegram สงวนไว้ กันข้อความพัง
function escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&")
}

/**
 * ส่งข้อความดิบไป chat_id ที่ระบุ — non-throwing เสมอ (คืน false ถ้าล้มเหลว)
 * ตั้งใจให้เรียกแบบ fire-and-forget โดยไม่บล็อก flow หลัก
 */
async function sendRaw(chatId: string, text: string, useMarkdown: boolean): Promise<boolean> {
    // ปิดแจ้งเตือนถ้าไม่ได้เปิด opt-in ผ่าน TELEGRAM_NOTIFICATIONS_ENABLED=true
    if (!isTelegramNotificationsEnabled()) return false

    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token || !chatId) return false

    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                ...(useMarkdown ? { parse_mode: "MarkdownV2" } : {}),
                disable_web_page_preview: true,
            }),
            signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) {
            console.warn("[TELEGRAM] sendMessage failed:", res.status, await res.text().catch(() => ""))
            return false
        }
        return true
    } catch (e) {
        console.warn("[TELEGRAM] sendMessage error:", e instanceof Error ? e.message : e)
        return false
    }
}

/** ส่งข้อความธรรมดา (ไม่ใช้ markdown) ไป chat_id — เหมาะกับข้อความยาว/มีอักขระพิเศษ เช่น แจ้งงาน */
export async function sendTelegramText(chatId: string, text: string): Promise<boolean> {
    return sendRaw(chatId, text, false)
}

type TelegramAlert = {
    title: string
    body?: string
    /** ลิงก์ให้กดจากในแชท (เช่นลิงก์หน้า job) */
    url?: string
}

/**
 * ส่งแจ้งเตือน (markdown) เข้ากลุ่มแอดมินภายใน (env TELEGRAM_CHAT_ID)
 */
export async function sendTelegramAlert(alert: TelegramAlert): Promise<boolean> {
    if (!isTelegramNotificationsEnabled() || !isTelegramConfigured()) return false

    const lines = [`*${escapeMarkdown(alert.title)}*`]
    if (alert.body) lines.push(escapeMarkdown(alert.body))
    if (alert.url) {
        const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || ""
        const fullUrl = alert.url.startsWith("http") ? alert.url : `${base}${alert.url}`
        if (fullUrl) lines.push(escapeMarkdown(fullUrl))
    }

    return sendRaw(process.env.TELEGRAM_CHAT_ID!, lines.join("\n"), true)
}

/**
 * สร้างลิงก์ผูกบัญชี Telegram (deep link) — ลูกค้า/แอดมินกด Start แล้ว webhook บันทึก chat_id
 *   kind 'customer' → payload c_<Customer_ID>   บันทึกลง Master_Customers
 *   kind 'user'     → payload u_<Username>      บันทึกลง Master_Users
 * คืน null ถ้ายังไม่ได้ตั้ง TELEGRAM_BOT_USERNAME
 */
export function telegramLinkFor(kind: "customer" | "user", id: string): string | null {
    const username = process.env.TELEGRAM_BOT_USERNAME
    if (!username || !id) return null
    const prefix = kind === "customer" ? "c_" : "u_"
    // start payload อนุญาตเฉพาะ A-Za-z0-9_- (สูงสุด 64 ตัว)
    const safeId = String(id).replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 60)
    return `https://t.me/${username}?start=${prefix}${safeId}`
}
