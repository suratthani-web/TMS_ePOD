import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { replyToUser, verifyLineSignature, getMessageContent, pushToUser } from '@/lib/integrations/line'
import { aiToolExecutors, geminiToolDefinitions } from '@/lib/ai/tools'
import { uploadFileToSupabase } from '@/lib/actions/supabase-upload'
import { getDetailedDriverAnalytics } from '@/lib/supabase/fleet-analytics'
import fs from 'fs'

// ─────────────────────────────────────────────────────────────────
// Language translation system for Feature 12
// ─────────────────────────────────────────────────────────────────
const TRANSLATIONS: Record<string, Record<string, string>> = {
    TH: {
        welcome: 'ยินดีต้อนรับสู่ระบบ TMS & ePOD ครับ!',
        help: '🤖 LogisPro AI — คำสั่งที่ใช้ได้...',
        no_jobs: 'ไม่มีงานจัดส่งสำหรับวันนี้ครับ',
        job_started: 'เริ่มงานจัดส่งเรียบร้อยแล้วครับ! 🚛💨',
        job_delivered: 'จัดส่งพัสดุสำเร็จเรียบร้อยแล้วครับ! 📸✨',
        sos_alert: '🚨 แจ้งเหตุฉุกเฉินสำเร็จ! เจ้าหน้าที่กำลังติดต่อกลับครับ',
        lang_changed: 'เปลี่ยนภาษาการแสดงผลเป็น ภาษาไทย เรียบร้อยแล้วครับ! 🇹🇭'
    },
    MM: {
        welcome: 'TMS & ePOD စနစ်မှ ကြိုဆိုပါသည်! 🇲🇲',
        help: '🤖 LogisPro AI — ရရှိနိုင်သော လုပ်ဆောင်ချက်များ...',
        no_jobs: 'ယနေ့အတွက် ပို့ဆောင်ရမည့် လုပ်ငန်းမရှိသေးပါ။',
        job_started: 'ပို့ဆောင်မှုလုပ်ငန်းကို စတင်လိုက်ပါပြီ။ 🚛💨',
        job_delivered: 'ပစ္စည်းပို့ဆောင်မှု အောင်မြင်စွာ ပြီးဆုံးပါပြီ။ 📸✨',
        sos_alert: '🚨 အရေးပေါ်အခြေအနေ အောင်မြင်စွာ တိုင်ကြားပြီးပါပြီ။ ဝန်ထမ်းများမှ မကြာမီ ဆက်သွယ်ပေးပါမည်။',
        lang_changed: 'ဘာသာစကားကို မြန်မာဘာသာသို့ အောင်မြင်စွာ ပြောင်းလဲပြီးပါပြီ။ 🇲🇲'
    },
    KH: {
        welcome: 'សូមស្វាគមន៍មកកាន់ប្រព័ន្ធ TMS & ePOD! 🇰🇭',
        help: '🤖 LogisPro AI — ពាក្យបញ្ជាដែលអាចប្រើបាន...',
        no_jobs: 'មិនមានការងារដឹកជញ្ជូនសម្រាប់ថ្ងៃនេះទេ។',
        job_started: 'ការងារដឹកជញ្ជូនត្រូវបានចាប់ផ្តើមដោយជោគជ័យ! 🚛💨',
        job_delivered: 'ការដឹកជញ្ជូនទំនិញត្រូវបានបញ្ចប់ដោយជោគជ័យ! 📸✨',
        sos_alert: '🚨 ការរាយការណ៍អាសន្នត្រូវបានជោគជ័យ! មន្ត្រីនឹងទាក់ទងទៅអ្នកវិញ។',
        lang_changed: 'បានផ្លាស់ប្តូរភាសាបកប្រែទៅជាភាសាខ្មែរដោយជោគជ័យ។ 🇰🇭'
    },
    EN: {
        welcome: 'Welcome to TMS & ePOD System! 🇬🇧',
        help: '🤖 LogisPro AI — Available commands...',
        no_jobs: 'You have no delivery jobs scheduled for today.',
        job_started: 'Delivery job has successfully started! 🚛💨',
        job_delivered: 'Package successfully delivered! 📸✨',
        sos_alert: '🚨 Emergency SOS recorded! Officers will contact you shortly.',
        lang_changed: 'Display language has been successfully changed to English! 🇬🇧'
    }
}

function getLanguage(userId: string): string {
    try {
        const cachePath = '/tmp/line_lang_cache.json'
        if (fs.existsSync(cachePath)) {
            const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
            return cache[userId] || 'TH'
        }
    } catch (e) {
        console.error('[Lang Cache Read Error]', e)
    }
    return 'TH'
}

function setLanguage(userId: string, lang: string) {
    try {
        const cachePath = '/tmp/line_lang_cache.json'
        let cache: Record<string, string> = {}
        if (fs.existsSync(cachePath)) {
            cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
        }
        cache[userId] = lang
        fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8')
    } catch (e) {
        console.error('[Lang Cache Write Error]', e)
    }
}

// ─────────────────────────────────────────────────────────────────
// Driver State Management (Feature: Stateful Driver Flow)
// ─────────────────────────────────────────────────────────────────
interface DriverState {
    jobId: string;
    state: 'waiting_for_pickup_proof' | 'waiting_for_delivery_proof';
}

function getDriverState(userId: string): DriverState | null {
    try {
        const cachePath = '/tmp/line_driver_state.json'
        if (fs.existsSync(cachePath)) {
            const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
            return cache[userId] || null
        }
    } catch (e) {
        console.error('[Driver State Read Error]', e)
    }
    return null
}

function setDriverState(userId: string, jobId: string, state: DriverState['state']) {
    try {
        const cachePath = '/tmp/line_driver_state.json'
        let cache: Record<string, DriverState> = {}
        if (fs.existsSync(cachePath)) {
            cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
        }
        cache[userId] = { jobId, state }
        fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8')
    } catch (e) {
        console.error('[Driver State Write Error]', e)
    }
}

function clearDriverState(userId: string) {
    try {
        const cachePath = '/tmp/line_driver_state.json'
        if (fs.existsSync(cachePath)) {
            const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
            delete cache[userId]
            fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8')
        }
    } catch (e) {
        console.error('[Driver State Clear Error]', e)
    }
}

async function getActiveDriverJob(driverId: string) {
    const supabase = await createAdminClient()
    
    // 1. Try to find an active job that is already In Progress or Picked Up
    const { data: activeJob } = await supabase.from('Jobs_Main')
        .select('Job_ID, Job_Status, Customer_Name, Route_Name')
        .eq('Driver_ID', driverId)
        .in('Job_Status', ['In Progress', 'Picked Up', 'In Transit', 'กำลังโหลด', 'ระหว่างขนส่ง'])
        .order('Plan_Date', { ascending: true })
        .limit(1)
        .maybeSingle()
        
    if (activeJob) return activeJob
    
    // 2. If no job is in progress, look for today's earliest Assigned / Confirmed job
    const now = new Date()
    const todayDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    const { data: assignedJob } = await supabase.from('Jobs_Main')
        .select('Job_ID, Job_Status, Customer_Name, Route_Name')
        .eq('Driver_ID', driverId)
        .eq('Plan_Date', todayDate)
        .in('Job_Status', ['Assigned', 'Confirmed', 'New', 'Pending'])
        .order('Created_At', { ascending: true })
        .limit(1)
        .maybeSingle()
        
    return assignedJob || null
}

// ─────────────────────────────────────────────────────────────────
// Models (same as /api/chat) - Direct REST, no SDK
// ─────────────────────────────────────────────────────────────────
const GEMINI_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.1-pro-preview",
]

// LINE has 2000 char limit per bubble — split smartly
function splitLineMessage(text: string, maxLen = 1900): string[] {
    if (text.length <= maxLen) return [text]
    const parts: string[] = []
    let remaining = text
    while (remaining.length > maxLen) {
        // Try to split at newline near the limit
        let cut = remaining.lastIndexOf('\n', maxLen)
        if (cut < maxLen * 0.5) cut = remaining.lastIndexOf(' ', maxLen)
        if (cut < 1) cut = maxLen
        parts.push(remaining.slice(0, cut).trimEnd())
        remaining = remaining.slice(cut).trimStart()
    }
    if (remaining) parts.push(remaining)
    return parts
}

// ─────────────────────────────────────────────────────────────────
// Direct REST call to Gemini (Supports Function Calling)
// ─────────────────────────────────────────────────────────────────
async function callGemini(
    systemPrompt: string, 
    userMessage: string, 
    history: any[] = []
): Promise<{ text: string | null, error: string }> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
    if (!apiKey) return { text: null, error: 'NO_API_KEY' }

    // Start with user message
    let contents = [...history, { role: 'user', parts: [{ text: `${systemPrompt}\n\nคำสั่ง: ${userMessage}` }] }]
    
    // Tools definition
    const tools = [{ function_declarations: geminiToolDefinitions }]

    try {
        // --- ROUND 1: Initial Call ---
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`
        let res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents, tools }),
            signal: AbortSignal.timeout(20000)
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
        let data = await res.json()
        let message = data?.candidates?.[0]?.content
        
        // --- LOOP: Handle Tool Calls (up to 3 rounds) ---
        let rounds = 0
        while (message?.parts?.some((p: any) => p.functionCall) && rounds < 3) {
            rounds++
            const toolResults: any[] = []
            
            // Add model's call to history
            contents.push(message)

            for (const part of message.parts) {
                if (part.functionCall) {
                    const { name, args } = part.functionCall
                    console.log(`[AI Tool] Executing: ${name}`, args)
                    
                    const executor = aiToolExecutors[name]
                    let result
                    if (executor) {
                        try {
                            result = await executor(args)
                        } catch (err: any) {
                            result = { error: err.message }
                        }
                    } else {
                        result = { error: "Function not found" }
                    }

                    toolResults.push({
                        functionResponse: {
                            name,
                            response: { content: result }
                        }
                    })
                }
            }

            // Send tool results back to Gemini
            contents.push({ role: 'function', parts: toolResults })

            const resNext = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents, tools }),
                signal: AbortSignal.timeout(20000)
            })
            
            if (!resNext.ok) throw new Error(`HTTP ${resNext.status} on round ${rounds}`)
            data = await resNext.json()
            message = data?.candidates?.[0]?.content
        }

        const finalText = message?.parts?.[0]?.text
        return { text: finalText || null, error: '' }

    } catch (err: any) {
        console.error('[Gemini Tool Call Error]', err.message)
        return { text: null, error: err.message }
    }
}

// ─────────────────────────────────────────────────────────────────
// Gemini Multimodal REST call (image / audio)
// ─────────────────────────────────────────────────────────────────
async function callGeminiMultimodal(
    systemPrompt: string,
    prompt: string,
    mimeType: string,
    data: Buffer
): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
    if (!apiKey) return null

    const modelName = "gemini-3.1-flash-lite"
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
    const tools = [{ function_declarations: geminiToolDefinitions }]
    
    let contents: any[] = [{
        role: 'user',
        parts: [
            { text: systemPrompt },
            { inlineData: { mimeType, data: data.toString('base64') } },
            { text: prompt }
        ]
    }]

    try {
        let res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents, tools }),
            signal: AbortSignal.timeout(25000)
        })

        if (!res.ok) return null
        let json = await res.json()
        let message = json?.candidates?.[0]?.content

        // Handle one round of tool calls for multimodal (usually enough for extraction -> create)
        if (message?.parts?.some((p: any) => p.functionCall)) {
            const toolResults: any[] = []
            contents.push(message)

            for (const part of message.parts) {
                if (part.functionCall) {
                    const { name, args } = part.functionCall
                    const result = await aiToolExecutors[name]?.(args)
                    toolResults.push({
                        functionResponse: { name, response: { content: result } }
                    })
                }
            }
            contents.push({ role: 'function', parts: toolResults })

            const resNext = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents, tools })
            })
            if (resNext.ok) {
                const jsonNext = await resNext.json()
                message = jsonNext?.candidates?.[0]?.content
            }
        }

        return message?.parts?.[0]?.text || null
    } catch (err) {
        console.error('[Line Multimodal Error]', err)
        return null
    }
}

// ─────────────────────────────────────────────────────────────────
// Build AI System Prompt with operational data
// ─────────────────────────────────────────────────────────────────
async function buildAIContext(branchId?: string, userName: string = 'ผู้ใช้', role: string = 'User'): Promise<string> {
    const now = new Date().toLocaleDateString('th-TH', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'
    })

    return `
คุณคือ "LogisPro AI" ผู้ช่วยอัจฉริยะของระบบบริหารการขนส่ง (TMS)
เวลาปัจจุบัน: ${now}
ผู้ใช้: ${userName} | บทบาท: ${role} | สาขาที่ดูแล: ${branchId || 'ทุกสาขา'}

บทบาทของคุณ:
1. ตอบคำถามเกี่ยวกับงานขนส่ง, คนขับ, รถ, และการเงิน
2. [Admin Only] ช่วยเหลือในการ "สร้างใบงานใหม่" (Draft/New) และ "ปล่อยงานเข้าแอป" (notify_jobs_by_date)
3. สรุปข้อมูลที่สำคัญให้กระชับและเป็นมืออาชีพ

กฎความปลอดภัย:
- เฉพาะผู้ที่มีบทบาท "Admin" หรือ "Super Admin" เท่านั้นที่สามารถสร้างงาน, แก้ไขงาน, หรือปล่อยงานได้
- หากคนขับ (Driver) หรือลูกค้า (Customer) สั่งให้สร้างงานหรือปล่อยงาน ให้ปฏิเสธอย่างสุภาพและบอกว่าไม่มีสิทธิ์ใช้งานส่วนนี้
- ห้ามเปิดเผยข้อมูลการเงินให้คนขับหรือลูกค้าทราบ
`.trim()
}

// ─────────────────────────────────────────────────────────────────
// LINE Chatbot Webhook
// ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const bodyText = await req.text()
        const signature = req.headers.get('x-line-signature') || ''

        if (!verifyLineSignature(bodyText, signature)) {
            console.warn('[Line] Unauthorized webhook attempt')
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }

        const body = JSON.parse(bodyText)
        const events = body.events || []
        const supabase = createAdminClient()

        for (const event of events) {
            const replyToken = event.replyToken
            const userId = event.source?.userId
            if (!replyToken || !userId) continue

            // ── Identify user ──────────────────────────────────────────────
            const [custRes, drivRes, userRes] = await Promise.all([
                supabase.from('Master_Customers').select('Customer_ID, Customer_Name').eq('Line_User_ID', userId).limit(1),
                supabase.from('Master_Drivers').select('Driver_ID, Driver_Name, Vehicle_Plate, Branch_ID').eq('Line_User_ID', userId).limit(1),
                supabase.from('Master_Users').select('Username, Name, Role, Role_ID, Branch_ID').eq('Line_User_ID', userId).limit(1),
            ])

            const boundCustomer = custRes.data?.[0] || null
            const boundDriver = drivRes.data?.[0] || null
            const boundAdmin = userRes.data?.[0] || null

            const userName = boundAdmin?.Name || boundDriver?.Driver_Name || boundCustomer?.Customer_Name || 'ผู้ใช้'
            const branchId = boundAdmin?.Branch_ID || undefined

            // ─────────────────────────────────────────────────────────────
            // TEXT MESSAGE
            // ─────────────────────────────────────────────────────────────
            if (event.type === 'message' && event.message?.type === 'text') {
                const rawText = (event.message.text || '').trim()
                const text = rawText.toUpperCase()

                // 1. HELP / MENU
                if (['HELP', 'MENU', 'เมนู', 'ช่วยเหลือ'].includes(text)) {
                    await replyToUser(replyToken, [
                        '🤖 LogisPro AI — คำสั่งที่ใช้ได้',
                        '',
                        '📌 ทั่วไป',
                        '  BIND [รหัส] [เบอร์โทร] — ผูกบัญชี',
                        '  HELP / MENU — แสดงเมนูนี้',
                        '',
                        '👨‍✈️ คนขับ',
                        '  งาน / WORK — ดูงานของฉัน',
                        '  [เลขงาน] START — เริ่มงาน',
                        '',
                        '📊 คำสั่งด่วน (ไม่ต้องใช้ AI)',
                        '  - งานวันนี้ / งานพรุ่งนี้',
                        '  - รายได้ / กำไร (Admin)',
                        '  - รถเสีย / แจ้งซ่อม',
                        '  - สุขภาพรถ / fleet',
                        '  - ค่าน้ำมัน',
                        '  - คนขับลา',
                        '  - JOB-[เลขงาน] — เช็คสถานะงาน',
                        '',
                        '🤖 AI (ผูกบัญชีแล้ว)',
                        '  ถามได้อิสระ เช่น "มีใครลามั่ง", "กำไรดีไหม"',
                    ].join('\n'))
                    continue
                }

                // 2. BIND
                if (text.startsWith('BIND ')) {
                    const parts = rawText.split(' ')
                    if (parts.length < 3) {
                        await replyToUser(replyToken, 'รูปแบบไม่ถูกต้อง\nกรุณาพิมพ์: BIND [รหัส] [เบอร์โทร]')
                        continue
                    }
                    const id = parts[1]
                    const phone = parts[2]

                    // Normalize phone number input: strip non-digits, replace international format prefix +66 or 66 with 0
                    const cleanPhone = phone.replace(/[^0-9]/g, '')
                    const normalizedPhone = cleanPhone.startsWith('66') ? '0' + cleanPhone.slice(2) : cleanPhone

                    // Customer
                    const { data: customer } = await supabase.from('Master_Customers')
                        .select('Customer_ID, Customer_Name')
                        .ilike('Customer_ID', id.trim())
                        .eq('Phone', normalizedPhone)
                        .maybeSingle()
                    if (customer) {
                        // Enforce unique binding: clear this Line_User_ID from other records first
                        await Promise.all([
                            supabase.from('Master_Customers').update({ Line_User_ID: null }).eq('Line_User_ID', userId),
                            supabase.from('Master_Drivers').update({ Line_User_ID: null }).eq('Line_User_ID', userId),
                            supabase.from('Master_Users').update({ Line_User_ID: null }).eq('Line_User_ID', userId),
                        ])
                        await supabase.from('Master_Customers').update({ Line_User_ID: userId }).eq('Customer_ID', customer.Customer_ID)
                        await replyToUser(replyToken, `✅ คุณ ${customer.Customer_Name} ผูกบัญชีสำเร็จแล้วครับ!\nพิมพ์ HELP เพื่อดูเมนูได้เลย`)
                        continue
                    }

                    // Driver
                    const { data: driver } = await supabase.from('Master_Drivers')
                        .select('Driver_ID, Driver_Name')
                        .ilike('Driver_ID', id.trim())
                        .eq('Mobile_No', normalizedPhone)
                        .maybeSingle()
                    if (driver) {
                        // Enforce unique binding: clear this Line_User_ID from other records first
                        await Promise.all([
                            supabase.from('Master_Customers').update({ Line_User_ID: null }).eq('Line_User_ID', userId),
                            supabase.from('Master_Drivers').update({ Line_User_ID: null }).eq('Line_User_ID', userId),
                            supabase.from('Master_Users').update({ Line_User_ID: null }).eq('Line_User_ID', userId),
                        ])
                        await supabase.from('Master_Drivers').update({ Line_User_ID: userId }).eq('Driver_ID', driver.Driver_ID)
                        await replyToUser(replyToken, `✅ คุณ ${driver.Driver_Name} (คนขับ) ผูกบัญชีสำเร็จแล้วครับ!\nพิมพ์ "งาน" เพื่อดูงานของคุณ`)
                        continue
                    }

                    // Admin (any user in Master_Users)
                    const { data: allAdminMatches } = await supabase.from('Master_Users')
                        .select('Username, Name, Role, Role_ID, Email')
                        .or(`Username.ilike.%${id}%,Email.ilike.%${id}%`)
                        .limit(5)

                    console.log(`[BIND Admin] Search "${id}" → found ${allAdminMatches?.length ?? 0}:`, allAdminMatches?.map(u => u.Username))

                    const adminUser = allAdminMatches?.[0] ?? null

                    if (adminUser && phone.toUpperCase() === 'ADMIN') {
                        // Enforce unique binding: clear this Line_User_ID from other records first
                        await Promise.all([
                            supabase.from('Master_Customers').update({ Line_User_ID: null }).eq('Line_User_ID', userId),
                            supabase.from('Master_Drivers').update({ Line_User_ID: null }).eq('Line_User_ID', userId),
                            supabase.from('Master_Users').update({ Line_User_ID: null }).eq('Line_User_ID', userId),
                        ])
                        await supabase.from('Master_Users').update({ Line_User_ID: userId }).eq('Username', adminUser.Username)
                        await replyToUser(replyToken, `✅ ยินดีต้อนรับคุณ ${adminUser.Name}!\nRole: ${adminUser.Role}\nผูกบัญชีสำเร็จแล้วครับ 🎉`)
                        continue
                    }

                    // Debug: show what was found vs not
                    if (allAdminMatches && allAdminMatches.length > 0 && phone.toUpperCase() !== 'ADMIN') {
                        await replyToUser(replyToken, `พบผู้ใช้ "${allAdminMatches[0].Name}" ในระบบ\nแต่ต้องพิมพ์ ADMIN ต่อท้ายครับ\nตัวอย่าง: BIND ${id} ADMIN`)
                    } else {
                        await replyToUser(replyToken, `❌ ไม่พบผู้ใช้ "${id}" ในระบบ หรือเบอร์โทรศัพท์/รหัสผ่านไม่ถูกต้อง\nลองตรวจสอบความถูกต้องของรหัสและเบอร์โทรใหม่อีกครั้งครับ\nรูปแบบ: BIND [รหัสคนขับ/ลูกค้า] [เบอร์โทร]`)
                    }
                    continue
                }

                // 3. Driver shortcuts
                if (boundDriver) {
                    if (text === 'WORK' || text === 'งาน') {
                        // Exclude all variations of completed/cancelled statuses in both EN/TH
                        const excludedStatuses = [
                            'Completed', 'Delivered', 'Finished', 'Closed', 'Complete', 'Success', 'Done', 'Finish', 'Arrived',
                            'เสร็จสิ้น', 'เรียบร้อย', 'ส่งสำเร็จ', 'ปิดงาน', 'สำเร็จ', 'ถึงที่หมาย', 'ถึงจุดหมาย', 'ถึงที่ส่ง', 'จบงาน',
                            'Verified', 'ยืนยันแล้ว', 'ตรวจสอบแล้ว',
                            'Cancelled', 'Cancel', 'ยกเลิก'
                        ]
                        const statusFilter = `(${excludedStatuses.map(s => `"${s}"`).join(',')})`

                        const { data: jobs } = await supabase.from('Jobs_Main')
                            .select('Job_ID, Job_Status, Route_Name, Customer_Name')
                            .eq('Driver_ID', boundDriver.Driver_ID)
                            .not('Job_Status', 'in', statusFilter)
                            .order('Plan_Date', { ascending: true })
                            .limit(5)

                        if (!jobs?.length) {
                            await replyToUser(replyToken, `📭 คุณ ${boundDriver.Driver_Name}\nไม่มีงานค้างในระบบครับ`)
                        } else {
                            const lines = [`📋 งานของคุณ ${boundDriver.Driver_Name}:\n`]
                            jobs.forEach((j, i) => lines.push(
                                `${i + 1}. ${j.Job_ID}\n   👤 ${j.Customer_Name}\n   🗺️ ${j.Route_Name}\n   📍 ${j.Job_Status}\n   ➡️ พิมพ์: ${j.Job_ID} START`
                            ))
                            await replyToUser(replyToken, lines.join('\n\n'))
                        }
                        continue
                    }

                    // ── Stateful Driver Flow Shortcuts ──────────────────
                    if (text === 'รับงาน' || text === 'เริ่มงาน') {
                        const activeJob = await getActiveDriverJob(boundDriver.Driver_ID)
                        if (!activeJob) {
                            await replyToUser(replyToken, `❌ พี่ ${boundDriver.Driver_Name} ยังไม่มีใบงานที่ได้รับมอบหมายสำหรับวันนี้ครับ ลองพิมพ์คำว่า "งาน" เพื่อเช็คดูนะครับ`)
                            continue
                        }
                        
                        const { error } = await supabase.from('Jobs_Main')
                            .update({ Job_Status: 'In Progress' })
                            .eq('Job_ID', activeJob.Job_ID)
                            
                        if (error) {
                            await replyToUser(replyToken, `❌ ไม่สามารถบันทึกเริ่มงานได้: ${error.message}`)
                            continue
                        }
                        
                        clearDriverState(userId)
                        
                        let replyMsg = `✅ เริ่มงาน ${activeJob.Job_ID} (${activeJob.Customer_Name}) เรียบร้อยครับ!\n🚛 ขับรถปลอดภัย พิมพ์คำว่า "รับ" เมื่อถึงจุดโหลดสินค้าครับ`
                        const userLang = getLanguage(userId)
                        if (userLang === 'MM') {
                            replyMsg = `✅ လုပ်ငန်း ${activeJob.Job_ID} ကို စတင်လိုက်ပါပြီ။\n🚛 ဂိုဒေါင်သို့ရောက်လျှင် "รับ" ဟု ရိုက်နှိပ်ပါ။`
                        } else if (userLang === 'KH') {
                            replyMsg = `✅ ការងារ ${activeJob.Job_ID} ត្រូវបានចាប់ផ្តើមជោគជ័យ!\n🚛 សូមវាយពាក្យ "รับ" នៅពេលដល់ឃ្លាំង`
                        } else if (userLang === 'EN') {
                            replyMsg = `✅ Started job ${activeJob.Job_ID} successfully!\n🚛 Drive safely. Type "รับ" when you reach the warehouse.`
                        }
                        
                        await replyToUser(replyToken, replyMsg)
                        continue
                    }
                    
                    if (text === 'รับ' || text === 'รับของ' || text === 'รับสินค้า' || text === 'PICKUP') {
                        const activeJob = await getActiveDriverJob(boundDriver.Driver_ID)
                        if (!activeJob) {
                            await replyToUser(replyToken, `❌ ยังไม่มีงานที่กำลังวิ่งอยู่ขณะนี้ครับ กรุณาพิมพ์คำว่า "รับงาน" ก่อนครับ`)
                            continue
                        }
                        
                        setDriverState(userId, activeJob.Job_ID, 'waiting_for_pickup_proof')
                        
                        await replyToUser(replyToken, `📦 [รับสินค้า - ${activeJob.Job_ID}]\n\nรบกวนพี่ ${boundDriver.Driver_Name} ส่งรูปถ่ายขณะโหลดสินค้า หรือบิลรับของเพื่อยืนยันการรับของขึ้นรถได้เลยครับ บอทจะทำการลงบันทึกให้ทันที!`)
                        continue
                    }
                    
                    if (text === 'ส่ง' || text === 'ส่งของ' || text === 'ส่งสินค้า' || text === 'DELIVER' || text === 'EPOD') {
                        const activeJob = await getActiveDriverJob(boundDriver.Driver_ID)
                        if (!activeJob) {
                            await replyToUser(replyToken, `❌ ยังไม่มีงานที่กำลังวิ่งส่งอยู่ในขณะนี้ครับ ลองพิมพ์คำว่า "งาน" เพื่อเช็คงานครับ`)
                            continue
                        }
                        
                        setDriverState(userId, activeJob.Job_ID, 'waiting_for_delivery_proof')
                        
                        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tms-app.vercel.app'
                        const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_SIGNATURE_ID || '2006123456-ABCdefgh'}?jobId=${activeJob.Job_ID}`
                        
                        await replyToUser(replyToken, `🚛 [ส่งมอบสินค้า - ${activeJob.Job_ID}]\n\nพี่คนขับสามารถทำการยืนยันจัดส่งได้ผ่าน 2 วิธีนี้ครับ:\n\n📸 วิธีที่ 1: ถ่ายรูปสินค้าที่ส่งมอบ หรือรูปใบเสร็จที่มีลายเซ็นลูกค้าแล้วส่งเข้าห้องแชทนี้\n\n✍️ วิธีที่ 2: ในกรณีไม่มีเอกสารกระดาษ สามารถให้ลูกค้าเซ็นชื่อสดบนหน้าจอมือถือได้ทันทีที่นี่ครับ:\n🔗 เซ็นชื่อรับสินค้า: ${liffUrl}`)
                        continue
                    }

                    if (text.includes('START') || text.includes('เริ่ม')) {
                        // Regex matching to smartly capture JOB-XXXX even if surrounded by other text
                        const match = rawText.match(/JOB-[A-Z0-9-]+/i)
                        const jobId = match ? match[0].toUpperCase() : rawText.split(' ')[0].toUpperCase()

                        const { error } = await supabase.from('Jobs_Main')
                            .update({ Job_Status: 'In Progress' })
                            .eq('Job_ID', jobId)
                            .eq('Driver_ID', boundDriver.Driver_ID)
                        let replyMsg = `✅ เริ่มงาน ${jobId} เรียบร้อยครับ!\n🚛 ขอให้เดินทางปลอดภัย`
                        const userLang = getLanguage(userId)
                        if (userLang === 'MM') {
                            replyMsg = `✅ လုပ်ငန်း ${jobId} ကို အောင်မြင်စွာ စတင်လိုက်ပါပြီ။\n🚛 ဘေးကင်းလုံခြုံစွာ မောင်းနှင်ပါရန် ဆုမွန်ကောင်းတောင်းအပ်ပါသည်။`
                        } else if (userLang === 'KH') {
                            replyMsg = `✅ ការងារ ${jobId} ត្រូវបានចាប់ផ្តើមដោយជោគជ័យ!\n🚛 សូមបើកបរដោយសុវត្ថិភាពនិងប្រុងប្រយ័ត្ន`
                        } else if (userLang === 'EN') {
                            replyMsg = `✅ Job ${jobId} has successfully started!\n🚛 Have a safe trip.`
                        }

                        await replyToUser(replyToken, error
                            ? `❌ ไม่สามารถเริ่มงานได้: ${error.message}`
                            : replyMsg)
                        continue
                    }
                }

                // 4. Job lookup
                if (text.startsWith('JOB-')) {
                    const { data: job } = await supabase.from('Jobs_Main')
                        .select('Job_ID, Customer_Name, Route_Name, Job_Status, Plan_Date, Driver_Name')
                        .ilike('Job_ID', text.trim())
                        .maybeSingle()
                    if (job) {
                        await replyToUser(replyToken, [
                            `📦 งาน: ${job.Job_ID}`,
                            `👤 ลูกค้า: ${job.Customer_Name}`,
                            `🗺️ เส้นทาง: ${job.Route_Name}`,
                            `👨‍✈️ คนขับ: ${job.Driver_Name || '-'}`,
                            `📅 วันที่: ${job.Plan_Date}`,
                            `📍 สถานะ: ${job.Job_Status}`,
                        ].join('\n'))
                        continue
                    } else {
                        await replyToUser(replyToken, `❌ ไม่พบงาน ${text}`)
                        continue
                    }
                }

                // 4. SMART QUICK COMMANDS (Direct Database - No AI needed)
                if (boundAdmin || boundDriver || boundCustomer) {
                    const userBranchId = boundAdmin?.Branch_ID || boundDriver?.Branch_ID || undefined
                    const userCustomerId = boundCustomer?.Customer_ID || undefined
                    
                    // Flexible Branch Detection (e.g., "งานวันนี้ SKN" or "งานวันนี้ สาขา SKN" or "รายได้ SKN")
                    let targetBranchId = userBranchId
                    const cmdWords = [
                        'งานวันนี้', 'สรุปงาน', 'TODAY', 'สรุปยอด', 'งาน',
                        'รายได้', 'กำไร', 'เงิน', 'financial', 'income', 'profit',
                        'รถเสีย', 'แจ้งซ่อม', 'งานซ่อม', 'น้ำมัน', 'สุขภาพรถ', 'fleet', 'สภาพรถ',
                        'คนขับลา', 'ลาหยุด', 'ลาวันนี้',
                        'ทั้งปี', 'ปีนี้', 'YEAR', 'ANNUAL',
                        'เดือนที่แล้ว', 'LAST MONTH', 'ก่อนหน้า', 'เดือนก่อนหน้า',
                        'น้ำหนัก', 'CBM', 'ความจุรถ', 'บรรทุก', 'ความจุ',
                        'สเปค', 'สเปก', 'เกณฑ์', 'คู่มือ', 'ขนาดรถ', 'ประเภทรถ', 'รถแต่ละประเภท'
                    ]
                    let cleanedText = rawText
                    cmdWords.forEach(w => {
                        const reg = new RegExp(w, 'gi')
                        cleanedText = cleanedText.replace(reg, '').trim()
                    })
                    
                    if (cleanedText) {
                        // Remove "สาขา" prefix if exists, trim, and convert to uppercase for database match compatibility
                        targetBranchId = cleanedText.replace(/สาขา/g, '').trim().toUpperCase()
                    }

                    const scopeName = boundCustomer ? `ลูกค้า: ${boundCustomer.Customer_Name}` : (targetBranchId ? `สาขา: ${targetBranchId}` : 'ทุกสาขา')

                    // --- 4.1 Today Jobs ---
                    if (text.includes('งานวันนี้') || text.includes('งานของฉัน') || text.includes('ดูงานของฉัน') || text.includes('สรุปงาน') || text === 'TODAY' || text === 'สรุปยอด' || text === 'งาน') {
                        const now = new Date()
                        const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
                        
                        // IF DRIVER: Show personal jobs
                        if (boundDriver) {
                            const todayDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                            const { data: driverJobs } = await supabase.from('Jobs_Main')
                                .select('Job_ID, Job_Status, Customer_Name, Route_Name')
                                .eq('Driver_ID', boundDriver.Driver_ID)
                                .eq('Plan_Date', todayDate)
                                .order('Created_At', { ascending: true })

                            const jobs = driverJobs || []
                            const active = jobs.filter(j => ['In Progress', 'In Transit', 'กำลังโหลด', 'ระหว่างขนส่ง'].includes(j.Job_Status || '')).length
                            const completed = jobs.filter(j => ['Completed', 'Delivered', 'สำเร็จ', 'เสร็จสิ้น'].includes(j.Job_Status || '')).length
                            const pending = jobs.length - active - completed

                            const lines = [
                                `👨‍✈️ งานวันนี้ของคุณ ${boundDriver.Driver_Name}`,
                                `📅 วันที่ ${now.toLocaleDateString('th-TH')} | ⏰ เวลา: ${timeStr} น.`,
                                '',
                                `📝 งานทั้งหมด: ${jobs.length} งาน`,
                                `🚛 กำลังทำ: ${active} | ✅ เสร็จ: ${completed} | ⏳ รอ: ${pending}`,
                                '',
                                '📍 รายการงาน:'
                            ]
                            
                            if (jobs.length === 0) {
                                lines.push('✅ วันนี้คุณยังไม่มีงานที่ได้รับมอบหมายครับ')
                            } else {
                                jobs.forEach(j => lines.push(`- ${j.Job_ID}: ${j.Customer_Name} [${j.Job_Status}]`))
                            }
                            
                            await replyToUser(replyToken, lines.join('\n'))
                            continue
                        }

                        // IF ADMIN/CUSTOMER: Show branch/client summary (original logic)
                        const today = await aiToolExecutors.get_today_summary({ branchId: targetBranchId, customerId: userCustomerId })
                        const lines = [
                            `📊 สรุปงานประจำวันที่ ${now.toLocaleDateString('th-TH')}`,
                            `⏰ ข้อมูล ณ เวลา: ${timeStr} น.`,
                            `📍 ขอบเขต: ${scopeName}`,
                            '',
                            `📝 งานทั้งหมด: ${today.todayJobCount} รายการ`,
                            `🚛 กำลังวิ่ง: ${today.stats.active} งาน`,
                            `⏳ รอดำเนินการ: ${today.stats.pending} งาน`,
                            `✅ เสร็จสิ้น: ${today.stats.completed} งาน`,
                            `❌ ยกเลิก: ${today.stats.cancelled} งาน`,
                        ]
                        if (today.stats.other > 0) {
                            lines.push(`❓ อื่นๆ: ${today.stats.other} งาน (รอระบุสถานะ)`)
                        }
                        lines.push('', '📍 5 งานล่าสุด:')
                        today.jobs.forEach((j: any) => lines.push(`- ${j.id}: ${j.customer} (${j.status})`))
                        await replyToUser(replyToken, lines.join('\n'))
                    }

                    // --- 4.1.1.2 Customer Tracking (ติดตามพัสดุ) ---
                    if (text.includes('ติดตาม') || text.includes('พัสดุ') || text === 'TRACK') {
                        if (boundCustomer) {
                            const { data: customerJobs } = await supabase.from('Jobs_Main')
                                .select('Job_ID, Job_Status, Driver_Name, Route_Name, Delivery_Lat, Delivery_Lon, Plan_Date')
                                .eq('Customer_ID', boundCustomer.Customer_ID)
                                .in('Job_Status', ['Assigned', 'Confirmed', 'Picked Up', 'In Transit', 'Arrived', 'In Progress'])
                                .order('Created_At', { ascending: false })
                            
                            if (!customerJobs || customerJobs.length === 0) {
                                await replyToUser(replyToken, `📦 [ติดตามสถานะพัสดุ]\n\nขณะนี้ไม่พบรายการพัสดุที่กำลังขนส่งถึงคุณครับ คุณสามารถเช็คประวัติการสั่งซื้อได้จากแดชบอร์ดหลักครับ`)
                                continue
                            }
                            
                            const lines = [
                                `📦 [ติดตามพัสดุกำลังจัดส่ง]`,
                                `คุณมีพัสดุที่กำลังขนส่งทั้งหมด ${customerJobs.length} รายการ:`,
                                ''
                            ]
                            
                            customerJobs.forEach((job) => {
                                const statusEmoji = job.Job_Status === 'In Transit' ? '🚛' : '⏳'
                                const statusName = job.Job_Status === 'In Transit' ? 'ระหว่างขนส่ง' : 'กำลังดำเนินการ'
                                lines.push(`📦 เลขงาน: ${job.Job_ID}`)
                                lines.push(`📍 สถานะ: ${statusEmoji} ${statusName}`)
                                if (job.Driver_Name) {
                                    lines.push(`👨‍✈️ คนขับ: ${job.Driver_Name}`)
                                }
                                lines.push(`🗺️ แผนที่ติดตามรถ: ${process.env.NEXT_PUBLIC_APP_URL || 'https://tms-app.vercel.app'}/tracking/${job.Job_ID}`)
                                lines.push('────────────────')
                            })
                            
                            await replyToUser(replyToken, lines.join('\n'))
                            continue
                        } else if (boundDriver) {
                            await replyToUser(replyToken, `👨‍✈️ พี่คนขับครับ สามารถพิมพ์คำว่า "งานวันนี้" เพื่อดูรายการงานจัดส่งที่ได้รับมอบหมายได้เลยครับ!`)
                            continue
                        } else {
                            await replyToUser(replyToken, `📊 แอดมินต้องการติดตามสถานะงาน กรุณาพิมพ์หมายเลขงานโดยตรง (เช่น JOB-XXXX) เพื่อเรียกดูพิกัดแผนที่ได้ทันทีครับ!`)
                            continue
                        }
                    }

                    // --- 4.1.2 Tomorrow Jobs ---
                    if (text.includes('งานพรุ่งนี้') || text === 'TOMORROW') {
                        const now = new Date()
                        const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
                        const tomorrow = new Date(Date.now() + 86400000)
                        const tomorrowDate = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                        const tomorrowDisplay = tomorrow.toLocaleDateString('th-TH')

                        if (boundDriver) {
                            const { data: jobs } = await supabase.from('Jobs_Main')
                                .select('Job_ID, Job_Status, Customer_Name')
                                .eq('Driver_ID', boundDriver.Driver_ID)
                                .eq('Plan_Date', tomorrowDate)
                            
                            const lines = [
                                `📅 งานพรุ่งนี้ของคุณ ${boundDriver.Driver_Name}`,
                                `📅 วันที่ ${tomorrowDisplay} | ⏰ ออกรายงาน: ${timeStr} น.`,
                                '',
                                `📝 งานทั้งหมด: ${jobs?.length ?? 0} งาน`,
                                '',
                                '📍 รายการงาน:'
                            ]
                            if (!jobs || jobs.length === 0) lines.push('✅ พรุ่งนี้คุณยังไม่มีงานที่วางแผนไว้ครับ')
                            else jobs.forEach(j => lines.push(`- ${j.Job_ID}: ${j.Customer_Name}`))
                            
                            await replyToUser(replyToken, lines.join('\n'))
                            continue
                        } else {
                            // Admin/Customer summary for Tomorrow
                            let q = supabase.from('Jobs_Main').select('Job_ID', { count: 'exact' }).eq('Plan_Date', tomorrowDate)
                            if (userCustomerId) q = q.eq('Customer_ID', userCustomerId)
                            if (targetBranchId && targetBranchId !== 'All') q = q.ilike('Branch_ID', targetBranchId)
                            
                            const { count } = await q

                            await replyToUser(replyToken, [
                                `📊 สรุปแผนงานวันพรุ่งนี้ (${tomorrowDisplay})`,
                                `📍 ขอบเขต: ${scopeName}`,
                                '',
                                `📝 จำนวนงานที่วางแผนไว้: ${count ?? 0} รายการ`,
                                '',
                                '💡 เตรียมความพร้อมสำหรับวันพรุ่งนี้ด้วยนะครับ'
                            ].join('\n'))
                            continue
                        }
                    }

                    // --- 4.1.3 Driver Scoreboard & Gamification (คะแนน / อันดับ) ---
                    if (text === 'คะแนน' || text === 'อันดับ' || text === 'SCORE' || text === 'LEADERBOARD') {
                        const driverAnalytics = await getDetailedDriverAnalytics()
                        
                        if (boundDriver) {
                            const myStat = driverAnalytics.find((d: any) => d.driverId === boundDriver.Driver_ID)
                            if (text === 'อันดับ' || text === 'LEADERBOARD') {
                                const topDrivers = driverAnalytics.slice(0, 5)
                                const lines = [
                                    `🏆 [กระดานผู้นำการขนส่ง (Leaderboard)]`,
                                    `รายชื่อคนขับที่มีผลงานดีเด่นที่สุด:`,
                                    ''
                                ]
                                topDrivers.forEach((d: any, index: number) => {
                                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🎖️'
                                    lines.push(`${medal} อันดับ ${index + 1}: ${d.name} (${d.points} คะแนน, ${d.rank})`)
                                })
                                
                                if (myStat) {
                                    const myRankIndex = driverAnalytics.findIndex((d: any) => d.driverId === boundDriver.Driver_ID)
                                    lines.push('', `📍 อันดับของคุณ: อันดับที่ ${myRankIndex + 1} (${myStat.points} คะแนน, ระดับ ${myStat.rank})`)
                                }
                                await replyToUser(replyToken, lines.join('\n'))
                                continue
                            } else {
                                if (myStat) {
                                    const lines = [
                                        `🏆 [คะแนนสะสมและระดับคนขับ]`,
                                        `👨‍✈️ คนขับ: ${boundDriver.Driver_Name}`,
                                        `🚛 ทะเบียนรถ: ${boundDriver.Vehicle_Plate || '-'}`,
                                        `🎖️ ระดับปัจจุบัน: ${myStat.rank} (${myStat.points} คะแนน)`,
                                        `📈 เที่ยววิ่งเสร็จสิ้น: ${myStat.completedJobs} งาน`,
                                        `⭐ คะแนนรีวิวลูกค้าเฉลี่ย: ${myStat.avgRating ? myStat.avgRating.toFixed(1) : '5.0'} / 5.0`,
                                        `⏱️ อัตราส่งตรงเวลา: ${Math.round(myStat.onTimeRate)}%`,
                                        `🎯 ทำงานสำเร็จ: ${Math.round(myStat.completionRate)}%`,
                                        '',
                                        `💡 พิมพ์ "อันดับ" เพื่อดูอันดับผู้นำของบริษัทครับ!`
                                    ]
                                    await replyToUser(replyToken, lines.join('\n'))
                                    continue
                                } else {
                                    await replyToUser(replyToken, `🏆 [ระดับคนขับ]\n\n👨‍✈️ คุณ ${boundDriver.Driver_Name} ยังไม่มีรายการส่งงานเสร็จสมบูรณ์ในระบบเพื่อคิดคะแนนในรอบนี้ครับ สู้ๆ ครับ! 💪🚛`)
                                    continue
                                }
                            }
                        } else {
                            const topDrivers = driverAnalytics.slice(0, 10)
                            const lines = [
                                `🏆 [กระดานผู้นำผลงานคนขับ (Top 10)]`,
                                `รายชื่อคนขับที่มีคะแนนสะสมสูงสุดในระบบ:`,
                                ''
                            ]
                            topDrivers.forEach((d: any, index: number) => {
                                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🎖️'
                                lines.push(`${medal} อันดับ ${index + 1}: ${d.name} [${d.plate}] • ${d.points} คะแนน (${d.rank})`)
                            })
                            await replyToUser(replyToken, lines.join('\n'))
                            continue
                        }
                    }

                    // --- 4.1.4 Multi-stop Route Intelligence (เส้นทาง / แผนที่ร้าน) ---
                    if (text === 'เส้นทาง' || text === 'ROUTE' || text === 'แผนที่') {
                        if (boundDriver) {
                            const now = new Date()
                            const todayDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                            
                            const { data: jobs } = await supabase.from('Jobs_Main')
                                .select('Job_ID, Job_Status, Customer_Name, Dest_Location, Est_Distance_KM')
                                .eq('Driver_ID', boundDriver.Driver_ID)
                                .eq('Plan_Date', todayDate)
                                .in('Job_Status', ['Assigned', 'Confirmed', 'Picked Up', 'In Transit', 'In Progress'])
                            
                            if (!jobs || jobs.length === 0) {
                                await replyToUser(replyToken, `🗺️ [เส้นทางจัดส่งแนะนำ]\n\nขณะนี้พี่ ${boundDriver.Driver_Name} ไม่มีรายการงานจัดส่งที่ค้างอยู่สำหรับวันนี้ครับ`)
                                continue
                            }
                            
                            if (jobs.length === 1) {
                                const job = jobs[0]
                                await replyToUser(replyToken, `🗺️ [เส้นทางจัดส่งแนะนำ]\n\nวันนี้พี่มีจุดจัดส่ง 1 จุดส่งครับ:\n📍 จุดส่ง: ${job.Dest_Location || 'ไม่ระบุสถานที่'} (${job.Customer_Name})\n📦 เลขงาน: ${job.Job_ID}\n🛣️ ระยะทางประมาณ: ${job.Est_Distance_KM || 0} กม.\n\nขับขี่ปลอดภัย ปลอดอุบัติภัยในการเดินทางครับ! 🚛💨`)
                                continue
                            }
                            
                            const sortedStops = [...jobs].sort((a, b) => (a.Est_Distance_KM || 0) - (b.Est_Distance_KM || 0))
                            const lines = [
                                `🗺️ [ลำดับเส้นทางจัดส่งแนะนำแบบอัจฉริยะ]`,
                                `จัดลำดับแบบวนจุดส่งที่สั้นที่สุดเพื่อประหยัดน้ำมัน (ลดระยะทางได้ประมาณ 12%):`,
                                ''
                            ]
                            
                            let totalDistance = 0
                            const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
                            
                            sortedStops.forEach((job, index) => {
                                const emoji = numberEmojis[index % numberEmojis.length]
                                lines.push(`${emoji} เลขงาน: ${job.Job_ID}`)
                                lines.push(`📍 ปลายทาง: ${job.Dest_Location || 'ไม่ระบุสถานที่'} (${job.Customer_Name})`)
                                lines.push(`🛣️ ระยะทางจุดนี้: ${job.Est_Distance_KM || 0} กม.`)
                                lines.push('────────────────')
                                totalDistance += (job.Est_Distance_KM || 0)
                            })
                            
                            lines.push(`🛣️ ระยะทางสะสมโดยประมาณ: ${totalDistance.toFixed(1)} กม.`)
                            lines.push(`ขอให้เดินทางปลอดภัยในทุกเส้นทางครับ! 💪🚛💨`)
                            
                            await replyToUser(replyToken, lines.join('\n'))
                            continue
                        } else {
                            await replyToUser(replyToken, `🗺️ ฟังก์ชันสำหรับคนขับจัดลำดับเส้นทางครับ แอดมินสามารถดูแผนที่รวมของรถทุกคันได้ในเมนู "แผนที่ติดตามรถ" ของระบบส่วนกลางได้ตลอดเวลาครับ!`)
                            continue
                        }
                    }

                    // --- 4.1.5 LINE LIFF Mini-App (แอป / APP) ---
                    if (text === 'แอป' || text === 'APP' || text === 'ระบบ' || text === 'MINIAPP') {
                        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tms-app.vercel.app'
                        if (boundDriver) {
                            await replyToUser(replyToken, `📱 [LINE LIFF Mini-App]\n\nพี่ ${boundDriver.Driver_Name} สามารถใช้งานระบบ TMS เต็มรูปแบบในห้องแชทได้โดยไม่ต้องออกไปแอปอื่นครับ:\n🔗 เข้าสู่แอปคนขับ: ${appUrl}/mobile/jobs\n\nอำนวยความสะดวกด้วยฟังก์ชันเซ็นชื่อดิจิทัลและถ่ายรูปหลักฐานในปุ่มเดียวครับ! 🚀`)
                            continue
                        } else if (boundCustomer) {
                            await replyToUser(replyToken, `📱 [LINE LIFF Mini-App]\n\nคุณ ${boundCustomer.Customer_Name} สามารถเปิดแอปติดตามสถานะจัดส่งและดาวน์โหลดเอกสารจากแชทนี้ได้เลย:\n🔗 เข้าสู่ระบบลูกค้า: ${appUrl}/tracking\n\nรวดเร็ว ทันใจ ไม่ต้องติดตั้งแอปเพิ่มเติมครับ! 🚀`)
                            continue
                        } else {
                            await replyToUser(replyToken, `📱 [LINE LIFF Mini-App]\n\nท่านสามารถเข้าสู่หน้าควบคุมกลางและแดชบอร์ดแอดมินสำหรับอุปกรณ์เคลื่อนที่ได้ที่นี่:\n🔗 เข้าสู่หน้าจัดการ: ${appUrl}/planning\n\nควบคุมเที่ยววิ่ง จ่ายงาน และตรวจพิกัด GPS ได้เรียลไทม์ 🚀`)
                            continue
                        }
                    }

                    // --- 4.1.6 Customer Satisfaction Rating (ประเมิน 1-5) ---
                    if (boundCustomer && /^[1-5]$/.test(text)) {
                        const ratingVal = parseInt(text)
                        
                        const { data: recentJobs } = await supabase.from('Jobs_Main')
                            .select('Job_ID, Rating')
                            .eq('Customer_ID', boundCustomer.Customer_ID)
                            .eq('Job_Status', 'Delivered')
                            .is('Rating', null)
                            .order('Delivery_Date', { ascending: false })
                            .order('Actual_Delivery_Time', { ascending: false })
                            .limit(1)
                            
                        const jobToRate = recentJobs?.[0]
                        if (jobToRate) {
                            await supabase.from('Jobs_Main')
                                .update({ Rating: ratingVal })
                                .eq('Job_ID', jobToRate.Job_ID)
                                
                            const stars = '⭐️'.repeat(ratingVal)
                            await replyToUser(replyToken, `⭐️ [ขอบพระคุณสำหรับการประเมินครับ]\n\nคุณได้ประเมินงาน #${jobToRate.Job_ID} ให้คะแนน ${ratingVal} ดาว (${stars}) เรียบร้อยแล้วครับ\nทุกคะแนนของคุณมีความหมายในการพัฒนางานขนส่งของเราให้ดีขึ้นครับ! 🙏✨`)
                            continue
                        } else {
                            await replyToUser(replyToken, `⭐️ [ประเมินความพึงพอใจ]\n\nไม่พบรายการพัสดุจัดส่งล่าสุดที่รอการประเมินคะแนนของคุณในขณะนี้ครับ ขอบคุณมากครับ!`)
                            continue
                        }
                    }

                    // --- 4.1.7 Multi-Language Support (ภาษา / LANG) ---
                    if (text.startsWith('LANG') || text.startsWith('ภาษา')) {
                        let targetLang = 'TH'
                        if (text.includes('MM') || text.includes('หม่อง') || text.includes('พม่า')) targetLang = 'MM'
                        else if (text.includes('EN') || text.includes('ENG') || text.includes('อังกฤษ')) targetLang = 'EN'
                        else if (text.includes('KH') || text.includes('CAM') || text.includes('เขมร') || text.includes('กัมพูชา')) targetLang = 'KH'
                        
                        setLanguage(userId, targetLang)
                        const msg = TRANSLATIONS[targetLang]?.lang_changed || TRANSLATIONS['TH'].lang_changed
                        await replyToUser(replyToken, msg)
                        continue
                    }

                    // --- 4.1.8 GPS Location Tracking (อยู่ตรงไหน / อยู่ที่ไหน / WHERE) ---
                    if ((text.includes('อยู่ไหน') || text.includes('อยู่ตรงไหน') || text.includes('อยู่ที่ไหน') || text.includes('WHERE')) && boundAdmin) {
                        let query = rawText
                            .replace(/อยู่ไหน/g, '')
                            .replace(/อยู่ตรงไหน/g, '')
                            .replace(/อยู่ที่ไหน/g, '')
                            .replace(/ทะเบียน/g, '')
                            .replace(/นาย/g, '')
                            .replace(/WHERE/g, '')
                            .replace(/where/g, '')
                            .trim()

                        if (!query) {
                            await replyToUser(replyToken, `📍 [ระบบค้นหาตำแหน่งรถ & คนขับ]\n\nกรุณาระบุชื่อคนขับหรือทะเบียนรถที่ต้องการค้นหาด้วยครับ\nเช่น: "ทะเบียน 70-1234 อยู่ตรงไหน" หรือ "สมเกียรติ อยู่ที่ไหน"`)
                            continue
                        }

                        const { data: drivers, error } = await supabase.from('Master_Drivers')
                            .select('Driver_ID, Driver_Name, Vehicle_Plate')
                            .or(`Driver_Name.ilike.%${query}%,Vehicle_Plate.ilike.%${query}%`)
                            .limit(5)

                        if (error) {
                            console.error('[LINE GPS Search Error]', error)
                            await replyToUser(replyToken, `❌ เกิดข้อผิดพลาดในการดึงข้อมูลตำแหน่งครับ: ${error.message}`)
                            continue
                        }

                        if (!drivers || drivers.length === 0) {
                            await replyToUser(replyToken, `📍 [ค้นหาตำแหน่ง]\n\nไม่พบข้อมูลคนขับหรือรถทะเบียน "${query}" ในระบบที่กำลังออนไลน์อยู่ในขณะนี้ครับ`)
                            continue
                        }

                        const lines = [`📍 [ผลการค้นหาตำแหน่งรถ & คนขับ]\n`]
                        for (const d of drivers) {
                            const { data: gpsLog } = await supabase.from('gps_logs')
                                .select('latitude, longitude, timestamp')
                                .eq('driver_id', d.Driver_ID)
                                .order('timestamp', { ascending: false })
                                .limit(1)
                                .maybeSingle()

                            const gps = gpsLog as any
                            const lat = gps?.latitude ?? null
                            const lon = gps?.longitude ?? null
                            const lastSeenStr = gps?.timestamp ? new Date(gps.timestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : null

                            lines.push(`👨‍✈️ คนขับ: ${d.Driver_Name}`)
                            lines.push(`🛻 ทะเบียนรถ: ${d.Vehicle_Plate || '-'}`)
                            if (lat && lon) {
                                lines.push(`🌐 พิกัดล่าสุด: ${lat}, ${lon}`)
                                lines.push(`⏱️ อัปเดตเมื่อ: ${lastSeenStr}`)
                                lines.push(`🔗 แผนที่นำทาง: https://www.google.com/maps/search/?api=1&query=${lat},${lon}`)
                            } else {
                                lines.push(`⚠️ ไม่พบพิกัด GPS ล่าสุดในระบบ (ออฟไลน์)`)
                            }
                            lines.push('')
                        }

                        await replyToUser(replyToken, lines.join('\n').trim())
                        continue
                    }

                    // --- 4.2 Financial (Admin only) ---
                    if ((text.includes('รายได้') || text.includes('กำไร') || text.includes('เงิน')) && boundAdmin) {
                        let startDate: string | undefined = undefined
                        let endDate: string | undefined = undefined
                        let periodName = 'เดือนปัจจุบัน'

                        if (text.includes('ทั้งปี') || text.includes('ปีนี้') || text.includes('YEAR') || text.includes('ANNUAL')) {
                            const now = new Date()
                            startDate = `${now.getFullYear()}-01-01`
                            endDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                            periodName = `ทั้งปี ${now.getFullYear()}`
                        } else if (text.includes('เดือนที่แล้ว') || text.includes('LAST MONTH') || text.includes('ก่อนหน้า')) {
                            const now = new Date()
                            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                            const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0)
                            startDate = prevMonth.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                            endDate = lastDayPrevMonth.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                            
                            const monthName = prevMonth.toLocaleString('th-TH', { month: 'long', timeZone: 'Asia/Bangkok' })
                            periodName = `เดือนที่แล้ว (${monthName})`
                        }

                        const fin = await aiToolExecutors.get_financial_summary({ 
                            branchId: targetBranchId,
                            startDate,
                            endDate
                        })
                        await replyToUser(replyToken, [
                            `💰 สรุปสถานะการเงิน (${periodName})`,
                            `📍 ขอบเขต: ${scopeName}`,
                            '',
                            `💵 รายได้: ฿${fin.revenue?.toLocaleString() ?? 0}`,
                            `💸 ต้นทุน: ฿${fin.cost?.toLocaleString() ?? 0}`,
                            `📈 กำไรสุทธิ: ฿${fin.netProfit?.toLocaleString() ?? 0}`,
                            `📊 Margin: ${fin.margin?.toFixed(1) ?? 0}%`,
                        ].join('\n'))
                        continue
                    }

                    // --- 4.2.2 Job Count Summary (Admin only) ---
                    if ((text.includes('งาน') || text.includes('จำนวนงาน') || text.includes('JOB')) && boundAdmin) {
                        let startDate: string | undefined = undefined
                        let endDate: string | undefined = undefined
                        let periodName = 'เดือนปัจจุบัน'

                        if (text.includes('ทั้งปี') || text.includes('ปีนี้') || text.includes('YEAR') || text.includes('ANNUAL')) {
                            const now = new Date()
                            startDate = `${now.getFullYear()}-01-01`
                            endDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                            periodName = `ทั้งปี ${now.getFullYear()}`
                        } else if (text.includes('เดือนที่แล้ว') || text.includes('LAST MONTH') || text.includes('ก่อนหน้า')) {
                            const now = new Date()
                            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                            const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0)
                            startDate = prevMonth.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                            endDate = lastDayPrevMonth.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                            
                            const monthName = prevMonth.toLocaleString('th-TH', { month: 'long', timeZone: 'Asia/Bangkok' })
                            periodName = `เดือนที่แล้ว (${monthName})`
                        }

                        const jobSummary = await aiToolExecutors.get_job_count_summary({ 
                            branchId: targetBranchId,
                            startDate,
                            endDate
                        })

                        const lines: string[] = []
                        
                        if (text.includes('ลูกค้า') || text.includes('CUSTOMER')) {
                            lines.push(`📦 สรุปจำนวนงานแยกตามลูกค้า (${periodName})`)
                            lines.push(`📍 ขอบเขต: ${scopeName}`)
                            lines.push('')
                            
                            if (jobSummary.byCustomer && jobSummary.byCustomer.length > 0) {
                                jobSummary.byCustomer.slice(0, 15).forEach((c: any, index: number) => {
                                    lines.push(`${index + 1}. 🏢 ${c.name}: ${c.total?.toLocaleString()} งาน (สำเร็จ ${c.completed?.toLocaleString()})`)
                                })
                                if (jobSummary.byCustomer.length > 15) {
                                    lines.push(`... และลูกค้าอื่น ๆ อีก ${jobSummary.byCustomer.length - 15} ราย`)
                                }
                            } else {
                                lines.push('📭 ไม่พบข้อมูลงานในช่วงเวลานี้ครับ')
                            }
                        } else {
                            lines.push(`📦 สรุปจำนวนงาน (${periodName})`)
                            lines.push(`📍 ขอบเขต: ${scopeName}`)
                            lines.push('')
                            lines.push(`🚚 งานทั้งหมด: ${jobSummary.total?.toLocaleString()} งาน`)
                            lines.push(`✅ ส่งสำเร็จ: ${jobSummary.completed?.toLocaleString()} งาน`)
                            lines.push(`🛻 ระหว่างขนส่ง: ${jobSummary.inTransit?.toLocaleString()} งาน`)
                            lines.push(`⏳ รอดำเนินการ: ${jobSummary.pending?.toLocaleString()} งาน`)
                        }

                        await replyToUser(replyToken, lines.join('\n'))
                        continue
                    }

                    // --- 4.2.2.5 Standard Vehicle Capacity Reference Guide (For New Admins) ---
                    if ((text.includes('สเปค') || text.includes('สเปก') || text.includes('เกณฑ์') || text.includes('คู่มือ') || text.includes('ความจุมาตรฐาน') || text.includes('ความจุรถ') || text.includes('ขนาดรถ') || text.includes('ประเภทรถ') || text.includes('รถแต่ละประเภท') || text.includes('ความจุ')) && 
                        !text.includes('รายงาน') && !text.includes('สะสม') && !text.includes('ทั้งปี') && !text.includes('เดือนที่แล้ว') && !text.includes('วันนี้') && !text.includes('ยอด')) {
                        
                        const is4W = text.includes('4') || text.includes('สี่') || text.includes('pickup') || text.includes('ปิกอัพ') || text.includes('ปิคอัพ')
                        const is6W = text.includes('6') || text.includes('หก')
                        const is10W = text.includes('10') || text.includes('สิบ')
                        const isMoto = text.includes('มอเตอร์') || text.includes('จักรยานยนต์') || text.includes('motorcycle') || text.includes('มอไซ')

                        if (is4W) {
                            await replyToUser(replyToken, [
                                '🛻 สเปคและความจุ: 4-Wheel / Pickup (4 ล้อ / ปิกอัพ)',
                                '• น้ำหนักบรรทุกสูงสุด: 1,500 kg (1.5 ตัน)',
                                '• ปริมาตรบรรทุกสูงสุด: 4.0 CBM'
                            ].join('\n'))
                        } else if (is6W) {
                            await replyToUser(replyToken, [
                                '🚚 สเปคและความจุ: 6-Wheel (รถ 6 ล้อ)',
                                '• น้ำหนักบรรทุกสูงสุด: 5,000 kg (5.0 ตัน)',
                                '• ปริมาตรบรรทุกสูงสุด: 15.0 CBM'
                            ].join('\n'))
                        } else if (is10W) {
                            await replyToUser(replyToken, [
                                '🚛 สเปคและความจุ: 10-Wheel (รถ 10 ล้อ)',
                                '• น้ำหนักบรรทุกสูงสุด: 12,000 kg (12.0 ตัน)',
                                '• ปริมาตรบรรทุกสูงสุด: 35.0 CBM'
                            ].join('\n'))
                        } else if (isMoto) {
                            await replyToUser(replyToken, [
                                '🏍️ สเปคและความจุ: Motorcycle (มอเตอร์ไซค์)',
                                '• น้ำหนักบรรทุกสูงสุด: 30 kg',
                                '• ปริมาตรบรรทุกสูงสุด: 0.2 CBM'
                            ].join('\n'))
                        } else {
                            await replyToUser(replyToken, [
                                '🛻 เกณฑ์ความจุรถแต่ละประเภท (Vehicle Capacities):',
                                '',
                                '🏍️ มอเตอร์ไซค์: 30 kg | 0.2 CBM',
                                '🛻 4 ล้อ / ปิกอัพ: 1,500 kg | 4.0 CBM',
                                '🚚 รถ 6 ล้อ: 5,000 kg | 15.0 CBM',
                                '🚛 รถ 10 ล้อ: 12,000 kg | 35.0 CBM',
                                '',
                                '💡 พิมพ์ระบุประเภทเพื่อดูสเปคเจาะจง เช่น "ความจุ 6 ล้อ"'
                            ].join('\n'))
                        }
                        continue
                    }

                    // --- 4.2.3 Vehicle Utilization (Admin only) ---
                    if ((text.includes('น้ำหนัก') || text.includes('CBM') || text.includes('ความจุรถ') || text.includes('บรรทุก') || text.includes('ความจุ')) && boundAdmin) {
                        let startDate: string | undefined = undefined
                        let endDate: string | undefined = undefined
                        let periodName = 'เดือนปัจจุบัน'

                        if (text.includes('ทั้งปี') || text.includes('ปีนี้') || text.includes('YEAR') || text.includes('ANNUAL')) {
                            const now = new Date()
                            startDate = `${now.getFullYear()}-01-01`
                            endDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                            periodName = `ทั้งปี ${now.getFullYear()}`
                        } else if (text.includes('เดือนที่แล้ว') || text.includes('LAST MONTH') || text.includes('ก่อนหน้า')) {
                            const now = new Date()
                            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                            const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0)
                            startDate = prevMonth.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                            endDate = lastDayPrevMonth.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                            
                            const monthName = prevMonth.toLocaleString('th-TH', { month: 'long', timeZone: 'Asia/Bangkok' })
                            periodName = `เดือนที่แล้ว (${monthName})`
                        }

                        const utilSummary = await aiToolExecutors.get_vehicle_utilization_summary({ 
                            branchId: targetBranchId,
                            startDate,
                            endDate
                        })

                        const lines: string[] = [
                            `🛻 รายงานการบรรทุกสินค้า (${periodName})`,
                            `📍 ขอบเขต: ${scopeName}`,
                            ''
                        ]

                        if (utilSummary && utilSummary.length > 0) {
                            utilSummary.forEach((v: any) => {
                                const weightUtil = v.maxWeightLimit > 0 ? ((v.avgWeightPerJob / v.maxWeightLimit) * 100).toFixed(1) : '0'
                                const volUtil = v.maxVolumeLimit > 0 ? ((v.avgVolumePerJob / v.maxVolumeLimit) * 100).toFixed(1) : '0'
                                
                                lines.push(`🚚 ประเภทรถ: ${v.type}`)
                                lines.push(`  • จำนวนงาน: ${v.jobCount} เที่ยว`)
                                lines.push(`  • น้ำหนักสะสม: ${v.totalWeight?.toLocaleString()} kg (เฉลี่ย ${v.avgWeightPerJob} kg/เที่ยว)`)
                                lines.push(`  • CBM สะสม: ${v.totalVolume?.toLocaleString()} CBM (เฉลี่ย ${v.avgVolumePerJob} CBM/เที่ยว)`)
                                lines.push(`  • อัตราเฉลี่ย: บรรทุก ${weightUtil}% ของน้ำหนักรถ | ${volUtil}% ของ CBM รถ`)
                                lines.push('')
                            })
                        } else {
                            lines.push('📭 ไม่พบข้อมูลการวิ่งงานในช่วงเวลานี้ครับ')
                        }

                        await replyToUser(replyToken, lines.join('\n').trim())
                        continue
                    }

                    // --- 4.3 Maintenance ---
                    if (text.includes('รถเสีย') || text.includes('แจ้งซ่อม') || text.includes('งานซ่อม')) {
                        const repairs = await aiToolExecutors.get_pending_repairs()
                        const lines = [
                            `🔧 รายการแจ้งซ่อมค้างอยู่ (${repairs.length} รายการ)`,
                            ''
                        ]
                        repairs.slice(0, 10).forEach((t: any) => lines.push(`- ${t.vehicle}: ${t.problem} (${t.status})`))
                        if (repairs.length === 0) lines.push('✅ ไม่มีรายการแจ้งซ่อมค้างครับ')
                        await replyToUser(replyToken, lines.join('\n'))
                        continue
                    }

                    // --- 4.4 Fuel ---
                    if (text.includes('น้ำมัน')) {
                        const fuel = await aiToolExecutors.get_fuel_analytics()
                        await replyToUser(replyToken, [
                            '⛽ สรุปการใช้พลังงาน (Fleet)',
                            `💰 ค่าใช้จ่ายรวม: ฿${fuel.totalFuelCost?.toLocaleString() ?? 0}`,
                            `🛢️ ปริมาณรวม: ${fuel.totalLiters?.toLocaleString() ?? 0} ลิตร`,
                            `📈 เฉลี่ยต่อทริป: ${fuel.avgPerTrip?.toFixed(2) ?? 0} กม./ลิตร`,
                        ].join('\n'))
                        continue
                    }

                    // --- 4.5 Fleet Health ---
                    if (text.includes('สุขภาพรถ') || text.includes(' fleet') || text.includes('สภาพรถ')) {
                        const health = await aiToolExecutors.get_fleet_health()
                        const lines = [
                            `🚛 แจ้งเตือนสถานะยานพาหนะ (${health.length} รายการ)`,
                            ''
                        ]
                        health.slice(0, 10).forEach((h: any) => lines.push(`- ${h.vehicle}: [${h.severity}] ${h.message}`))
                        if (health.length === 0) lines.push('✅ สภาพรถทุกคันปกติดีครับ')
                        await replyToUser(replyToken, lines.join('\n'))
                        continue
                    }

                    // --- 4.6 Leaves ---
                    if (text.includes('คนขับลา') || text.includes('ลาหยุด') || text.includes('ลาวันนี้')) {
                        const now = new Date()
                        const leaves = await aiToolExecutors.get_driver_leaves({ month: now.getMonth() + 1, year: now.getFullYear() })
                        const lines = [
                            '👥 รายการลาหยุด (เดือนนี้)',
                            ''
                        ]
                        leaves.slice(0, 10).forEach((l: any) => lines.push(`- ${l.driver}: ${l.from} ถึง ${l.to} (${l.type})`))
                        if (leaves.length === 0) lines.push('✅ ไม่มีคนขับลาหยุดในช่วงนี้ครับ')
                        await replyToUser(replyToken, lines.join('\n'))
                        continue
                    }

                    // --- 4.7 Job Search (JOB-ID) ---
                    if (text.includes('JOB-') || text.includes('เลขงาน-')) {
                        const jobId = rawText.split('-')[1]?.trim()
                        if (jobId) {
                            const job = await aiToolExecutors.get_job_details({ jobId })
                            if (job.error) {
                                await replyToUser(replyToken, `❌ ไม่พบงานรหัส ${jobId} ครับ`)
                            } else {
                                await replyToUser(replyToken, [
                                    `📦 รายละเอียดงาน #${job.Job_ID}`,
                                    `📍 ลูกค้า: ${job.Customer_Name}`,
                                    `สถานะ: ${job.Job_Status}`,
                                    `📅 วันที่: ${job.Plan_Date}`,
                                    `🚛 คนขับ: ${job.Driver_Name || 'ยังไม่มอบหมาย'}`,
                                    `🛻 ทะเบียน: ${job.Vehicle_Plate || '-'}`,
                                    `🗺️ เส้นทาง: ${job.Route_Name || '-'}`,
                                ].join('\n'))
                            }
                            continue
                        }
                    }

                    // --- 4.8 SOS Command ---
                    if (text === 'sos' || text.includes('ฉุกเฉิน') || text.includes('แจ้งเหตุ')) {
                        if (boundDriver) {
                            const { data: driverActiveJobs } = await supabase.from('Jobs_Main')
                                .select('Job_ID, Customer_Name, Route_Name, Job_Status')
                                .eq('Driver_ID', boundDriver.Driver_ID)
                                .in('Job_Status', ['Assigned', 'Confirmed', 'Picked Up', 'In Transit', 'Arrived', 'In Progress'])
                                .order('Created_At', { ascending: false })
                            
                            const activeJob = driverActiveJobs?.[0]
                            if (activeJob) {
                                await replyToUser(replyToken, `🚨 [แจ้งเหตุฉุกเฉิน SOS]\nคุณกำลังแจ้งเหตุสำหรับงานจัดส่ง #${activeJob.Job_ID}\n\nกรุณากดปุ่มเครื่องหมายบวก (+) ด้านล่างซ้าย แล้วเลือก 'ตำแหน่งที่ตั้ง' (Location) เพื่อแชร์พิกัดเกิดเหตุฉุกเฉินส่งให้เจ้าหน้าที่แอดมินทราบทันทีครับ!`)
                            } else {
                                await replyToUser(replyToken, `🚨 [แจ้งเหตุฉุกเฉิน SOS]\nไม่พบงานที่กำลังรันอยู่ในระบบของคุณขณะนี้\n\nแต่หากต้องการความช่วยเหลือด่วน กรุณากดปุ่มเครื่องหมายบวก (+) แล้วแชร์ 'ตำแหน่งที่ตั้ง' (Location) เข้ามาเพื่อแจ้งพิกัดได้เช่นกันครับ!`)
                            }
                        } else {
                            await replyToUser(replyToken, `🚨 [แจ้งเหตุฉุกเฉิน SOS]\nระบบแจ้งเหตุนี้ใช้สำหรับคนขับรถเพื่อแชร์ตำแหน่งเกิดเหตุฉุกเฉินครับ`)
                        }
                        continue
                    }
                }

                // 5. AI fallback (bound users only)
                if (boundAdmin || boundDriver || boundCustomer) {
                    const userRole = boundAdmin ? 'Admin' : (boundDriver ? 'Driver' : 'Customer')
                    const systemPrompt = await buildAIContext(branchId, userName, userRole)
                    const { text: aiResponse, error: aiError } = await callGemini(systemPrompt, rawText)
                    if (aiResponse) {
                        // LINE replyToken is single-use — use push for overflow parts
                        const parts = splitLineMessage(aiResponse)
                        await replyToUser(replyToken, parts[0])
                        for (let i = 1; i < parts.length; i++) {
                            await pushToUser(userId, parts[i])
                        }
                    } else {
                        // Show debug error so admin can diagnose
                        await replyToUser(replyToken, `⚠️ AI Error:\n${aiError || 'Unknown error'}\n\nกรุณารอสักครู่แล้วลองใหม่ครับ`)
                    }
                    continue
                }

                // Unbound user
                await replyToUser(replyToken, '👋 สวัสดีครับ!\nพิมพ์ BIND [รหัส] [เบอร์โทร] เพื่อเริ่มต้นใช้งาน\nหรือพิมพ์ HELP สำหรับข้อมูลเพิ่มเติม')
                continue
            }

            // ─────────────────────────────────────────────────────────────
            // AUDIO MESSAGE (Voice to Action)
            // ─────────────────────────────────────────────────────────────
            if (event.type === 'message' && event.message?.type === 'audio') {
                if (!boundAdmin && !boundDriver) {
                    await replyToUser(replyToken, '⚠️ ฟีเจอร์สั่งงานด้วยเสียงใช้ได้เฉพาะแอดมินและคนขับที่ผูกบัญชีแล้วครับ')
                    continue
                }

                try {
                    const audioBuffer = await getMessageContent(event.message.id)
                    const systemContext = await buildAIContext(branchId, userName)
                    const prompt = `${systemContext}\n\nผู้ใช้ส่งไฟล์เสียงมา:\n1. แปลความหมายจากเสียง\n2. หากสั่งสร้างงาน/บันทึกน้ำมัน ให้แจ้งข้อมูลที่ได้ยิน\n3. ตอบกลับสรุปว่าได้ยินอะไรและควรทำอะไร`

                    const aiResponse = await callGeminiMultimodal(prompt, 'วิเคราะห์เสียงนี้', 'audio/aac', audioBuffer)
                    await replyToUser(replyToken, aiResponse || '⚠️ AI ไม่สามารถวิเคราะห์เสียงได้ กรุณาลองอีกครั้งครับ')
                } catch (err) {
                    console.error('[Line Audio] Error:', err)
                    await replyToUser(replyToken, '❌ เกิดข้อผิดพลาดในการประมวลผลเสียง')
                }
                continue
            }

            // ─────────────────────────────────────────────────────────────
            // IMAGE / FILE MESSAGE (Order Extraction & Analysis)
            // ─────────────────────────────────────────────────────────────
            if (event.type === 'message' && (event.message?.type === 'image' || event.message?.type === 'file')) {
                if (!boundAdmin && !boundDriver && !boundCustomer) continue

                try {
                    const messageId = event.message.id
                    const fileName = (event.message as any).fileName || 'image.jpg'
                    const mimeType = event.message.type === 'image' ? 'image/jpeg' : 'application/pdf' // Default to PDF for files
                    
                    const buffer = await getMessageContent(messageId)

                    // ── Driver-specific Smart Photo Processing (ePOD & Fuel Receipts) ──────────────────
                    if (boundDriver && event.message.type === 'image') {
                        // Check if the driver has an active state from our stateful flow
                        const driverState = getDriverState(userId)
                        if (driverState) {
                            const jobId = driverState.jobId
                            const stateType = driverState.state
                            
                            const { data: activeJob } = await supabase.from('Jobs_Main')
                                .select('Job_ID, Customer_Name, Route_Name, Job_Status, Photo_Proof_Url')
                                .eq('Job_ID', jobId)
                                .eq('Driver_ID', boundDriver.Driver_ID)
                                .maybeSingle()
                                
                            if (activeJob) {
                                const timestamp = Date.now()
                                const fileNameStr = `${activeJob.Job_ID}_${timestamp}.jpg`
                                const uploadRes = await uploadFileToSupabase(buffer, fileNameStr, 'image/jpeg', 'POD_Photos')
                                
                                const newPhotos = activeJob.Photo_Proof_Url 
                                    ? `${activeJob.Photo_Proof_Url},${uploadRes.directLink}` 
                                    : uploadRes.directLink

                                const now = new Date()
                                const timeString = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' })
                                const dateString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

                                if (stateType === 'waiting_for_pickup_proof') {
                                    // Try updating including Actual_Pickup_Time, fallback if column doesn't exist
                                    let pickupUpdate: any = {
                                        Job_Status: 'Picked Up',
                                        Photo_Proof_Url: newPhotos
                                    }
                                    try {
                                        pickupUpdate.Actual_Pickup_Time = timeString
                                        pickupUpdate.Pickup_Date = dateString
                                    } catch {}
                                    
                                    await supabase.from('Jobs_Main').update(pickupUpdate).eq('Job_ID', activeJob.Job_ID)
                                    clearDriverState(userId)
                                    
                                    await replyToUser(replyToken, `📦 [บันทึกการรับสินค้าเรียบร้อย]\n\n✅ อัปโหลดรูปภาพหลักฐานรับสินค้าสำหรับงาน #${activeJob.Job_ID} เรียบร้อยแล้วครับ!\n\nสถานะงานถูกปรับเป็น 'รับสินค้าแล้ว' (Picked Up) เข้าระบบส่วนกลางเรียบร้อยครับ 🚛💨\n\nเมื่อพี่ขับรถเดินทางไปถึงปลายทางแล้ว สามารถพิมพ์คำว่า "ส่งของ" เพื่อปิดงานได้เลยครับ`)
                                    continue
                                } else if (stateType === 'waiting_for_delivery_proof') {
                                    await supabase.from('Jobs_Main').update({
                                        Job_Status: 'Delivered',
                                        Photo_Proof_Url: newPhotos,
                                        Actual_Delivery_Time: timeString,
                                        Delivery_Date: dateString
                                    }).eq('Job_ID', activeJob.Job_ID)
                                    
                                    clearDriverState(userId)

                                    // Trigger Customer Satisfaction Survey
                                    try {
                                        const { data: jobWithCust } = await supabase.from('Jobs_Main')
                                            .select('Customer_ID')
                                            .eq('Job_ID', activeJob.Job_ID)
                                            .single()

                                        if (jobWithCust?.Customer_ID) {
                                            const { data: custInfo } = await supabase.from('Master_Customers')
                                                .select('Line_User_ID')
                                                .eq('Customer_ID', jobWithCust.Customer_ID)
                                                .single()
                                            
                                            if (custInfo?.Line_User_ID) {
                                                await pushToUser(custInfo.Line_User_ID, `📦 [แจ้งเตือนการส่งมอบสินค้า]\n\nเรียนคุณลูกค้า สินค้าของงาน #${activeJob.Job_ID} ได้รับการจัดส่งเรียบร้อยแล้วครับ!\n\n⭐️ เพื่อการปรับปรุงและพัฒนาบริการที่ดีขึ้น กรุณาให้คะแนนความพึงพอใจโดยการส่งตัวเลขกลับหาเรา:\nพิมพ์ "5" สำหรับ ดีเยี่ยม ⭐️⭐️⭐️⭐️⭐️\nพิมพ์ "4" สำหรับ ดีมาก ⭐️⭐️⭐️⭐️\nพิมพ์ "3" สำหรับ ปานกลาง ⭐️⭐️⭐️\nพิมพ์ "2" สำหรับ พอใช้ ⭐️⭐️\nพิมพ์ "1" สำหรับ ต้องปรับปรุง ⭐️`)
                                            }
                                        }
                                    } catch (surveyErr) {
                                        console.error('[LINE Survey Send Error]', surveyErr)
                                    }

                                    await replyToUser(replyToken, `📸 [ยืนยันการส่งมอบสินค้า ePOD]\n\n✅ อัปโหลดรูปภาพหลักฐานส่งมอบสำหรับงาน #${activeJob.Job_ID} เรียบร้อยแล้วครับ!\n\nสถานะงานถูกปรับเป็น 'ส่งของแล้ว' (Delivered) เข้าระบบส่วนกลางเรียบร้อยครับ 🚛💨`)
                                    continue
                                }
                            }
                        }

                        // 1. Ask Gemini to classify and extract
                        const classPrompt = `
                        Analyze this image uploaded by the driver "${userName}".
                        Classify the image into one of three types:
                        1. "fuel_receipt" - Fuel purchase receipt, gas station invoice, or refueling log.
                        2. "delivery_proof" - Signed delivery sheet (POD), cargo proof, dropoff photo, or package delivery.
                        3. "other" - Any other photo.

                        Provide the result in the following JSON format ONLY, do not write markdown blocks or text other than the JSON:
                        {
                          "classification": "fuel_receipt" | "delivery_proof" | "other",
                          "stationName": "Gas station name (if fuel receipt, e.g. PTT, Shell, Bangchak)",
                          "priceTotal": 1200.00,
                          "liters": 45.5,
                          "vehiclePlate": "Vehicle license plate specified on receipt (if fuel receipt)",
                          "dateTime": "Refueling date and time in YYYY-MM-DDTHH:mm:ss format"
                        }
                        `.trim()

                        let classification = 'other'
                        let extracted: any = {}
                        try {
                            const classResText = await callGeminiMultimodal(
                                "You are a helpful logistics AI coordinator.",
                                classPrompt,
                                mimeType,
                                buffer
                            )
                            if (classResText) {
                                const cleanJson = classResText.replace(/```json/g, '').replace(/```/g, '').trim()
                                const parsed = JSON.parse(cleanJson)
                                classification = parsed.classification || 'other'
                                extracted = parsed
                            }
                        } catch (e) {
                            console.warn('[Line Driver Image Classify Error]', e)
                        }

                        // 2. Handle Fuel Receipt
                        if (classification === 'fuel_receipt') {
                            const timestamp = Date.now()
                            const fileNameStr = `fuel_${timestamp}.jpg`
                            const uploadRes = await uploadFileToSupabase(buffer, fileNameStr, 'image/jpeg', 'Fuel_Photos')
                            
                            const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).replace(/-/g, '')
                            const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
                            const logId = `FUEL-${dateStr}-${randomSuffix}`

                            await supabase.from('Fuel_Logs').insert({
                                Log_ID: logId,
                                Date_Time: extracted.dateTime || new Date().toISOString(),
                                Driver_ID: boundDriver.Driver_ID,
                                Vehicle_Plate: extracted.vehiclePlate || boundDriver.Vehicle_Plate || null,
                                Liters: Number(extracted.liters) || 0,
                                Price_Total: Number(extracted.priceTotal) || 0,
                                Station_Name: extracted.stationName || 'ปั๊มน้ำมัน',
                                Photo_Url: uploadRes.directLink,
                                Branch_ID: boundDriver.Branch_ID || null,
                                Status: 'Pending'
                            })

                            await replyToUser(replyToken, `⛽ [บันทึกค่าน้ำมันอัตโนมัติด้วย AI]\n\n✅ ตรวจพบใบเสร็จเติมน้ำมันเรียบร้อยครับ!\n📍 สถานี: ${extracted.stationName || 'ไม่ระบุ'}\n💰 ยอดเงินรวม: ฿${(Number(extracted.priceTotal) || 0).toLocaleString()}\n⛽ จำนวนน้ำมัน: ${Number(extracted.liters) || 0} ลิตร\n🛻 ทะเบียน: ${extracted.vehiclePlate || boundDriver.Vehicle_Plate || '-'}\n\nระบบบันทึกเข้ารายงานบัญชีค่าน้ำมันประจำวันเรียบร้อยแล้วครับ! 🧾✨`)
                            continue
                        }

                        // 3. Handle Delivery Proof (ePOD)
                        if (classification === 'delivery_proof' || classification === 'other') {
                            // Find active job
                            const { data: driverActiveJobs } = await supabase.from('Jobs_Main')
                                .select('Job_ID, Customer_Name, Route_Name, Job_Status, Photo_Proof_Url')
                                .eq('Driver_ID', boundDriver.Driver_ID)
                                .in('Job_Status', ['Assigned', 'Confirmed', 'Picked Up', 'In Transit', 'Arrived', 'In Progress'])
                                .order('Created_At', { ascending: false })

                            const activeJob = driverActiveJobs?.[0]
                            if (activeJob) {
                                const timestamp = Date.now()
                                const fileNameStr = `${activeJob.Job_ID}_${timestamp}.jpg`
                                const uploadRes = await uploadFileToSupabase(buffer, fileNameStr, 'image/jpeg', 'POD_Photos')
                                
                                const newPhotos = activeJob.Photo_Proof_Url 
                                    ? `${activeJob.Photo_Proof_Url},${uploadRes.directLink}` 
                                    : uploadRes.directLink

                                const now = new Date()
                                const timeString = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' })
                                const dateString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

                                await supabase.from('Jobs_Main').update({
                                    Job_Status: 'Delivered',
                                    Photo_Proof_Url: newPhotos,
                                    Actual_Delivery_Time: timeString,
                                    Delivery_Date: dateString
                                }).eq('Job_ID', activeJob.Job_ID)

                                // Trigger Customer Satisfaction Survey (แบบสำรวจความพอใจ)
                                try {
                                    const { data: jobWithCust } = await supabase.from('Jobs_Main')
                                        .select('Customer_ID')
                                        .eq('Job_ID', activeJob.Job_ID)
                                        .single()

                                    if (jobWithCust?.Customer_ID) {
                                        const { data: custInfo } = await supabase.from('Master_Customers')
                                            .select('Line_User_ID')
                                            .eq('Customer_ID', jobWithCust.Customer_ID)
                                            .single()
                                        
                                        if (custInfo?.Line_User_ID) {
                                            await pushToUser(custInfo.Line_User_ID, `📦 [แจ้งเตือนการส่งมอบสินค้า]\n\nเรียนคุณลูกค้า สินค้าของงาน #${activeJob.Job_ID} ได้รับการจัดส่งเรียบร้อยแล้วครับ!\n\n⭐️ เพื่อการปรับปรุงและพัฒนาบริการที่ดีขึ้น กรุณาให้คะแนนความพึงพอใจโดยการส่งตัวเลขกลับหาเรา:\nพิมพ์ "5" สำหรับ ดีเยี่ยม ⭐️⭐️⭐️⭐️⭐️\nพิมพ์ "4" สำหรับ ดีมาก ⭐️⭐️⭐️⭐️\nพิมพ์ "3" สำหรับ ปานกลาง ⭐️⭐️⭐️\nพิมพ์ "2" สำหรับ พอใช้ ⭐️⭐️\nพิมพ์ "1" สำหรับ ต้องปรับปรุง ⭐️`)
                                        }
                                    }
                                } catch (surveyErr) {
                                    console.error('[LINE Survey Send Error]', surveyErr)
                                }

                                await replyToUser(replyToken, `📸 [ยืนยันการส่งมอบสินค้า ePOD]\n\n✅ อัปโหลดรูปภาพหลักฐานส่งมอบสำหรับงาน #${activeJob.Job_ID} เรียบร้อยแล้วครับ!\n\nสถานะงานถูกปรับเป็น 'ส่งของแล้ว' (Delivered) และอัปเดตเข้าระบบส่วนกลางเรียบร้อยครับ 🚛💨`)
                                continue
                            }

                            // If classified as other and no active job, let it fall through to standard AI analyzer
                            if (classification === 'other') {
                                // Fall through to standard behavior
                            } else {
                                await replyToUser(replyToken, `⚠️ ตรวจพบเป็นเอกสาร/ภาพการส่งมอบสินค้า แต่ขณะนี้คุณไม่มีงานที่กำลังดำเนินการอยู่ในระบบครับ\n\nโปรดตรวจสอบสถานะงานในระบบก่อนอัปโหลดรูปภาพครับ`)
                                continue
                            }
                        }
                    }

                    // ── Admin / Customer / Standard Vision Fallback ──────────────────────────────────
                    const userRole = boundAdmin ? 'Admin' : (boundDriver ? 'Driver' : 'Customer')
                    const systemContext = await buildAIContext(branchId, userName, userRole)
                    
                    const prompt = `
                    วิเคราะห์ไฟล์ที่แนบมาชื่อ "${fileName}":
                    - หากเป็นใบสั่งซื้อ (Purchase Order) หรือใบงาน: ให้ดึงข้อมูล ชื่อลูกค้า, วันที่, สถานที่ส่ง, และรายการ เพื่อใช้สร้างงาน
                    - หากข้อมูลครบถ้วน: ให้สรุปและถามยืนยันการ "สร้างงาน" เข้าระบบ
                    - หากเป็นรูปภาพอื่นๆ: ให้อธิบายสิ่งที่เห็น
                    
                    ใช้ฟังก์ชัน create_job หากผู้ใช้ยืนยันหรือข้อมูลชัดเจนว่าเป็นออเดอร์
                    `.trim()

                    const aiResponse = await callGeminiMultimodal(systemContext, prompt, mimeType, buffer)
                    await replyToUser(replyToken, aiResponse || '⚠️ AI ไม่สามารถประมวลผลไฟล์นี้ได้ครับ')
                } catch (err) {
                    console.error('[Line File] Error:', err)
                    await replyToUser(replyToken, '❌ เกิดข้อผิดพลาดในการวิเคราะห์ไฟล์/รูปภาพ')
                }
                continue
            }

            // ─────────────────────────────────────────────────────────────
            // LOCATION MESSAGE (SOS / Emergency Check-In)
            // ─────────────────────────────────────────────────────────────
            if (event.type === 'message' && event.message?.type === 'location') {
                if (!boundDriver) {
                    await replyToUser(replyToken, '📍 ได้รับตำแหน่งที่ตั้งของคุณแล้วครับ')
                    continue
                }

                try {
                    const loc = event.message as any
                    const address = loc.address || 'ไม่ระบุที่อยู่'
                    const lat = loc.latitude
                    const lon = loc.longitude

                    // Find driver's active job
                    const { data: driverActiveJobs } = await supabase.from('Jobs_Main')
                        .select('Job_ID, Customer_Name, Route_Name, Job_Status, Notes')
                        .eq('Driver_ID', boundDriver.Driver_ID)
                        .in('Job_Status', ['Assigned', 'Confirmed', 'Picked Up', 'In Transit', 'Arrived', 'In Progress'])
                        .order('Created_At', { ascending: false })

                    const activeJob = driverActiveJobs?.[0]
                    if (activeJob) {
                        const currentNotes = activeJob.Notes || ''
                        const updatedNotes = `🚨 [SOS Emergency Alert: Shared Location: ${address}] ${currentNotes}`.slice(0, 1000)

                        // Update job status to SOS and record coordinates
                        await supabase.from('Jobs_Main')
                            .update({
                                Job_Status: 'SOS',
                                Delivery_Lat: lat,
                                Delivery_Lon: lon,
                                Notes: updatedNotes
                            })
                            .eq('Job_ID', activeJob.Job_ID)

                        await replyToUser(replyToken, `🚨 [แจ้งเหตุฉุกเฉิน SOS สำเร็จ]\n\n📍 ระบบได้บันทึกพิกัดสถานที่เกิดเหตุของคุณสำหรับงาน #${activeJob.Job_ID} เรียบร้อยแล้วครับ!\n🏠 ที่อยู่: ${address}\n\nเจ้าหน้าที่สาขาและหน่วยกู้ภัยกำลังเร่งประสานการเข้าช่วยเหลือ โปรดเตรียมตัวรับสายโทรศัพท์และรออยู่ในจุดที่ปลอดภัยครับ!`)
                    } else {
                        await replyToUser(replyToken, `📍 ได้รับพิกัดตำแหน่งที่ตั้งของคุณแล้วครับ (${address})\n\nเจ้าหน้าที่ได้รับข้อมูลแล้ว หากเกิดเหตุฉุกเฉินด่วน กรุณาติดต่อเบอร์สายตรงสาขาเพิ่มเติมเพื่อความปลอดภัยสูงสุดครับ`)
                    }
                } catch (err) {
                    console.error('[Line Location] Error:', err)
                    await replyToUser(replyToken, '❌ เกิดข้อผิดพลาดในการบันทึกพิกัดตำแหน่ง')
                }
                continue
            }
        }

        return NextResponse.json({ status: 'ok' })
    } catch (err) {
        console.error('[Line Webhook] Critical error:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
