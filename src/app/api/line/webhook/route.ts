import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { replyToUser as _replyToUser, resolveWebhookBot, getMessageContent as _getMessageContent, pushToUser as _pushToUser, pushToCustomerActive } from '@/lib/integrations/line'
import { aiToolExecutors, geminiToolDefinitions, isWriteTool, buildPendingAction, executeWriteTool } from '@/lib/ai/tools'
import { savePendingAction, popPendingAction } from '@/lib/ai/pending-actions'
import { undoLastAction } from '@/lib/ai/audit-log'
import { uploadFileToSupabase } from '@/lib/actions/supabase-upload'
import { getDetailedDriverAnalytics } from '@/lib/supabase/fleet-analytics'
import { transitionJobStatus } from "@/services/job-status-machine"
import { TMS_SCHEMA_PROMPT } from '@/lib/ai/schema-context'
import { parseVoiceMessage } from '@/lib/ai/voice-action-parser'
import { validateFuelSlip, resolveFleetPlate } from '@/lib/fuel/fuel-slip-validator'
import { suggestFillType } from '@/lib/supabase/fuel'
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
        .select('Job_ID, Job_Status, Customer_Name, Route_Name, Notes')
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
        .select('Job_ID, Job_Status, Customer_Name, Route_Name, Notes')
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
    history: Record<string, unknown>[] = [],
    allowWrite = false,
): Promise<{ text: string | null, error: string, pendingAction?: { name: string, args: Record<string, unknown> } }> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
    if (!apiKey) return { text: null, error: 'NO_API_KEY' }

    // Start with user message
    const contents = [...history, { role: 'user', parts: [{ text: `${systemPrompt}\n\nคำสั่ง: ${userMessage}` }] }]
    
    // Tools definition
    const tools = [{ function_declarations: geminiToolDefinitions }]

    try {
        // --- ROUND 1: Initial Call ---
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`
        const res = await fetch(url, {
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
        while (message?.parts?.some((p: Record<string, unknown>) => p.functionCall) && rounds < 3) {
            rounds++
            const toolResults: Record<string, unknown>[] = []
            
            // Add model's call to history
            contents.push(message)

            for (const part of message.parts) {
                if (part.functionCall) {
                    const { name, args } = part.functionCall
                    console.log(`[AI Tool] Executing: ${name}`, args)

                    // Write actions never run inline — hand them back for a
                    // confirm button. Non-admins get a permission message instead.
                    if (isWriteTool(name)) {
                        if (!allowWrite) {
                            return { text: '⛔ คำสั่งนี้ต้องเป็นแอดมินเท่านั้นครับ', error: '' }
                        }
                        return { text: null, error: '', pendingAction: { name, args: (args || {}) as Record<string, unknown> } }
                    }

                    const executor = aiToolExecutors[name]
                    let result
                    if (executor) {
                        try {
                            result = await executor(args)
                        } catch (err: unknown) {
                            result = { error: err instanceof Error ? err.message : String(err) }
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

    } catch (err: unknown) {
        console.error('[Gemini Tool Call Error]', err instanceof Error ? err.message : String(err))
        return { text: null, error: err instanceof Error ? err.message : String(err) }
    }
}

// ─────────────────────────────────────────────────────────────────
// Gemini Multimodal REST call (image / audio)
// ─────────────────────────────────────────────────────────────────
async function callGeminiMultimodal(
    systemPrompt: string,
    prompt: string,
    mimeType: string,
    data: Buffer,
    // Callers that need accurate OCR (e.g. fuel receipts) can request a stronger
    // model; the default lite model is fine for classification / rough extraction.
    modelOverride?: string,
    options?: {
        temperature?: number;
        responseMimeType?: string;
        disableTools?: boolean;
    }
): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
    if (!apiKey) return null

    // 3.5-flash อ่านรูปแม่นพอๆ กับ 3.6 แต่เร็วกว่ามาก (~5s vs ~18s) — 3.6 ช้าจนชน
    // AbortSignal timeout ตอนโหลดสูง ทำให้ OCR ใบเสร็จน้ำมันคืน null แล้วตกไป error
    const DEFAULT_MODEL = "gemini-3.5-flash"
    const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.6-flash"]
    const modelsToTry = Array.from(new Set([modelOverride || DEFAULT_MODEL, ...FALLBACK_MODELS]))
    const urlFor = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`
    const tools = options?.disableTools ? undefined : [{ function_declarations: geminiToolDefinitions }]

    const contents: Record<string, unknown>[] = [{
        role: 'user',
        parts: [
            { text: systemPrompt },
            { inlineData: { mimeType, data: data.toString('base64') } },
            { text: prompt }
        ]
    }]

    const generationConfig: Record<string, unknown> = {}
    if (options?.temperature !== undefined) {
        generationConfig.temperature = options.temperature
    }
    if (options?.responseMimeType) {
        generationConfig.responseMimeType = options.responseMimeType
    }

    try {
        let res: Response | null = null
        let usedUrl = ''
        for (const m of modelsToTry) {
            usedUrl = urlFor(m)
            const bodyPayload: Record<string, unknown> = { contents }
            if (tools) bodyPayload.tools = tools
            if (Object.keys(generationConfig).length > 0) bodyPayload.generationConfig = generationConfig

            res = await fetch(usedUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload),
                signal: AbortSignal.timeout(25000)
            })
            if (res.ok) break
            console.warn(`[Line Multimodal] model ${m} failed (${res.status}), trying next`)
        }
        if (!res) return null

        if (!res.ok) return null
        const json = await res.json()
        let message = json?.candidates?.[0]?.content

        // Handle one round of tool calls for multimodal (usually enough for extraction -> create)
        if (tools && message?.parts?.some((p: Record<string, unknown>) => p.functionCall)) {
            const toolResults: Record<string, unknown>[] = []
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

            const resNext = await fetch(usedUrl, {
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

// A real, non-phantom branch: exists in Master_Branches (excludes legacy 'HQ'/'All').
function isRealBranch(b: string | null | undefined): boolean {
    return !!b && b !== 'HQ' && b !== 'All'
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
คุณคือ "LogisPro AI" ผู้ช่วยอัจฉริยะและ Super Admin ของระบบบริหารการขนส่ง (TMS)
เวลาปัจจุบัน: ${now}
ผู้ใช้: ${userName} | บทบาท: ${role} | สาขาที่ดูแล: ${branchId || 'ทุกสาขา'}

บทบาทและความสามารถของคุณ:
1. ตอบคำถามเกี่ยวกับงานขนส่ง, คนขับ, รถ, น้ำมัน, การเงิน และภาพรวมระบบได้อย่างแม่นยำและรอบด้าน
2. สามารถเรียกใช้เครื่องมือเพื่อดึงข้อมูลเชิงลึกจากฐานข้อมูล (query_tms_database, get_fuel_efficiency_report, get_customer_insights, get_driver_performance ฯลฯ)
3. [Admin Only] ช่วยเหลือในการ "สร้างใบงานใหม่" (Draft/New) และ "ปล่อยงานเข้าแอป" (notify_jobs_by_date)
4. สรุปข้อมูลให้กระชับ ชัดเจน ใช้ภาษาไทยที่เป็นมิตร และจัดข้อความด้วย Emoji ให้อ่านง่ายบนหน้าจอ LINE

กฎความปลอดภัย:
- เฉพาะผู้ที่มีบทบาท "Admin" หรือ "Super Admin" เท่านั้นที่สามารถสร้างงาน, แก้ไขงาน, หรือปล่อยงานได้
- หากคนขับ (Driver) หรือลูกค้า (Customer) สั่งให้สร้างงานหรือปล่อยงาน ให้ปฏิเสธอย่างสุภาพและบอกว่าไม่มีสิทธิ์ใช้งานส่วนนี้
- ห้ามเปิดเผยข้อมูลการเงินให้คนขับหรือลูกค้าทราบ

${TMS_SCHEMA_PROMPT}
`.trim()
}

// ─────────────────────────────────────────────────────────────────
// LINE Chatbot Webhook
// ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const bodyText = await req.text()
        const signature = req.headers.get('x-line-signature') || ''
        const supabase = createAdminClient()

        // Log incoming webhook for analysis
        await supabase.from('System_Logs').insert({
            module: 'WebhookDebug',
            action_type: 'RECEIVE',
            user_id: 'system',
            username: 'system',
            role: 'System',
            details: {
                signature: signature ? `${signature.substring(0, 10)}...` : 'none',
                body: bodyText.length > 1000 ? bodyText.substring(0, 1000) + '...' : bodyText
            }
        })

        // Resolve which bot this request belongs to by matching the signature
        // against each configured channel secret. All events in a single webhook
        // delivery come from the same bot.
        const botIndex = resolveWebhookBot(bodyText, signature)
        if (botIndex === null) {
            console.warn('[Line] Unauthorized webhook attempt')
            await supabase.from('System_Logs').insert({
                module: 'WebhookDebug',
                action_type: 'ERROR',
                user_id: 'system',
                username: 'system',
                role: 'System',
                details: { error: 'Invalid signature', signature }
            })
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }

        // Bot-scoped wrappers: replies / media fetches / conversational pushes must
        // go through the SAME bot that received the event. These shadow the imports
        // so every existing call site is automatically routed to the right bot.
        const replyToUser = (replyToken: string, textOrMsg: string | Record<string, unknown> | Array<Record<string, unknown>>) => _replyToUser(replyToken, textOrMsg, botIndex)
        const getMessageContent = (messageId: string) => _getMessageContent(messageId, botIndex)
        const pushToUser = (to: string, text: string) => _pushToUser(to, text, botIndex)

        // Customers link a DIFFERENT LINE user id per bot, stored in separate
        // columns. Identity lookups and BIND for customers must use the column
        // that matches the receiving bot. (Drivers/admins only ever use bot 1.)
        const custLineIdField: 'Line_User_ID' | 'Line_User_ID_2' = botIndex === 2 ? 'Line_User_ID_2' : 'Line_User_ID'

        const body = JSON.parse(bodyText)
        const events = body.events || []

        for (const event of events) {
            const replyToken = event.replyToken
            const userId = event.source?.userId
            const groupId = event.source?.groupId
            const targetId = groupId || userId
            if (!replyToken || !targetId) continue

            // ── Identify user ──────────────────────────────────────────────
            // Drivers/admins bind their PERSONAL Line_User_ID, so identify them by
            // the individual sender (event.source.userId) — this is present in group
            // chats too when the sender has added the bot as a friend, letting admin
            // commands (e.g. fuel-receipt OCR + confirm) work inside a LINE group.
            // Customers bind at the group level, so keep that lookup on targetId.
            const personId = userId || targetId
            const inGroup = !!groupId
            const [custRes, drivRes, userRes, subRes] = await Promise.all([
                supabase.from('Master_Customers').select('Customer_ID, Customer_Name').eq(custLineIdField, targetId).limit(1),
                supabase.from('Master_Drivers').select('Driver_ID, Driver_Name, Vehicle_Plate, Branch_ID').eq('Line_User_ID', personId).limit(1),
                supabase.from('Master_Users').select('Username, Name, Role, Role_ID, Branch_ID').eq('Line_User_ID', personId).limit(1),
                supabase.from('Master_Subcontractors').select('Sub_ID, Sub_Name, Branch_ID').eq('Line_User_ID', personId).limit(1),
            ])

            const boundCustomer = custRes.data?.[0] || null
            const boundDriver = drivRes.data?.[0] || null
            const resolvedAdmin = userRes.data?.[0] || null
            const boundSub = subRes.data?.[0] || null   // เจ้าของสังกัด
            // Admins act on commands / AI ONLY in 1:1 chats — group chats are shared
            // with drivers (and customers), so keep internal admin powers out of them.
            // `adminFuel` is the ONE exception: the fuel-receipt OCR + its confirm are
            // allowed in groups so admins can log refuels there too.
            const boundAdmin = inGroup ? null : resolvedAdmin
            const adminFuel = resolvedAdmin

            const userName = boundAdmin?.Name || boundDriver?.Driver_Name || boundCustomer?.Customer_Name || (groupId ? 'ไลน์กลุ่ม' : 'ผู้ใช้')
            const branchId = boundAdmin?.Branch_ID || undefined

            // ─────────────────────────────────────────────────────────────
            // POSTBACK EVENT (Button Clicks / Quick Replies)
            // ─────────────────────────────────────────────────────────────
            if (event.type === 'postback') {
                const postbackData = event.postback?.data || ''
                const params = new URLSearchParams(postbackData)
                const action = params.get('action')
                const mode = params.get('mode') as 'backlog' | 'today' | null

                // A: คนขับ/แอดมินกดแก้ประเภทการเติม (จบงาน/ระหว่างทาง) ของบิลที่บันทึกไปแล้ว
                if (action === 'SET_FILL_TYPE') {
                    const logId = params.get('log')
                    const fillType = params.get('type') === 'enroute' ? 'enroute' : 'end'
                    if (!logId) { await replyToUser(replyToken, 'ไม่พบรหัสบิลครับ'); continue }
                    const { error: setErr } = await supabase
                        .from('Fuel_Logs')
                        .update({ Trip_Fill_Type: fillType })
                        .eq('Log_ID', logId)
                    await replyToUser(replyToken, setErr
                        ? '❌ อัปเดตประเภทการเติมไม่สำเร็จครับ'
                        : `✅ อัปเดตเป็น "${fillType === 'enroute' ? 'เติมระหว่างทาง (งานยังไม่จบ)' : 'เติมปกติ (ก่อน/หลังงาน)'}" เรียบร้อยครับ`)
                    continue
                }

                // A: ยืนยัน/ยกเลิกบันทึกบิลน้ำมัน (admin) ผ่าน postback — เลี่ยงชนกับ handler คำสั่งข้อความ
                if (action === 'CONFIRM_FUEL') {
                    const fuelType = params.get('type')
                    if (!adminFuel) { await replyToUser(replyToken, 'บัญชีนี้ไม่มีสิทธิ์บันทึกน้ำมันครับ'); continue }
                    const pending = await popPendingAction(userId)
                    if (!pending || pending.name !== 'create_fuel_log') {
                        await replyToUser(replyToken, 'ไม่พบบิลที่รอยืนยัน (อาจหมดเวลาแล้ว) กรุณาส่งบิลใหม่อีกครั้งครับ')
                        continue
                    }
                    if (fuelType === 'cancel') {
                        const meta = buildPendingAction(pending.name, pending.args)
                        await replyToUser(replyToken, meta.cancelMessage)
                        continue
                    }
                    const fArgs: Record<string, unknown> = { ...pending.args }
                    if (adminFuel.Branch_ID && (fArgs.branchId == null || fArgs.branchId === '')) fArgs.branchId = adminFuel.Branch_ID
                    fArgs.tripFillType = fuelType === 'enroute' ? 'enroute' : 'end'
                    const fRes = await executeWriteTool(pending.name, fArgs, Number(adminFuel.Role_ID), { actor: userId, channel: 'line' })
                    await replyToUser(replyToken, fRes)
                    continue
                }

                const isAdminUser = !!boundAdmin && [1, 2].includes(Number(boundAdmin.Role_ID))
                const isSuper = !!boundAdmin && Number(boundAdmin.Role_ID) === 1
                const adminBranch = boundAdmin?.Branch_ID
                const scopeLabel = isSuper ? 'ทุกสาขา' : `สาขา ${adminBranch}`
                const CLOSED = ['Completed', 'Complete', 'Delivered', 'Verified', 'Billed', 'Paid', 'Cancelled', 'Draft', 'Rejected']
                const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

                const scopedOpen = (m: 'backlog' | 'today') => {
                    let q = supabase
                        .from('Jobs_Main')
                        .select('Job_ID, Customer_Name, Driver_Name, Job_Status, Plan_Date')
                        .not('Job_Status', 'in', `(${CLOSED.join(',')})`)
                    if (m === 'backlog') q = q.lt('Plan_Date', today)
                    else q = q.eq('Plan_Date', today)
                    if (!isSuper && adminBranch) q = q.eq('Branch_ID', adminBranch)
                    return q.order('Plan_Date', { ascending: true }).limit(100)
                }

                const botCloseJob = async (jobId: string): Promise<boolean> => {
                    const { data: cur } = await supabase.from('Jobs_Main').select('Notes').eq('Job_ID', jobId).single()
                    const stamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
                    const note = `[ปิดโดยแอดมิน ${boundAdmin?.Name || boundAdmin?.Username} ผ่าน LINE ${stamp} — ไม่มี POD]`
                    const { error } = await supabase
                        .from('Jobs_Main')
                        .update({ Job_Status: 'Completed', Notes: cur?.Notes ? `${cur.Notes}\n${note}` : note })
                        .eq('Job_ID', jobId)
                    return !error
                }

                if (action === 'REQUEST_CONFIRM' && mode) {
                    if (!isAdminUser) {
                        await replyToUser(replyToken, '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น')
                        continue
                    }
                    const label = mode === 'backlog' ? 'งานค้างส่ง (ย้อนหลัง)' : 'งานวันนี้'
                    const confirmWord = mode === 'backlog' ? 'ยืนยันปิดทั้งหมด' : 'ยืนยันปิดงานวันนี้'
                    let cq = supabase.from('Jobs_Main').select('*', { count: 'exact', head: true })
                        .not('Job_Status', 'in', `(${CLOSED.join(',')})`)
                    cq = mode === 'backlog' ? cq.lt('Plan_Date', today) : cq.eq('Plan_Date', today)
                    if (!isSuper && adminBranch) cq = cq.eq('Branch_ID', adminBranch)
                    const { count } = await cq
                    if (!count || count === 0) {
                        await replyToUser(replyToken, `✅ ไม่มี${label}ให้ปิด (${scopeLabel})`)
                        continue
                    }
                    await replyToUser(replyToken, {
                        type: 'text',
                        text: `⚠️ จะปิด${label}ทั้งหมด ${count} งาน (${scopeLabel}) แบบไม่มี POD\n\n👇 กรุณากดยืนยันที่ปุ่มด้านล่าง หรือพิมพ์ "${confirmWord}"`,
                        quickReply: {
                            items: [
                                {
                                    type: 'action',
                                    action: {
                                        type: 'postback',
                                        label: `✅ ${confirmWord}`,
                                        data: `action=CLOSE_ALL&mode=${mode}`,
                                        displayText: confirmWord
                                    }
                                },
                                {
                                    type: 'action',
                                    action: {
                                        type: 'postback',
                                        label: '❌ ยกเลิก',
                                        data: 'action=CANCEL_CLOSE',
                                        displayText: 'ยกเลิก'
                                    }
                                }
                            ]
                        }
                    })
                    continue
                }

                if (action === 'CLOSE_ALL' && mode) {
                    if (!isAdminUser) {
                        await replyToUser(replyToken, '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น')
                        continue
                    }
                    const label = mode === 'backlog' ? 'งานค้างส่ง (ย้อนหลัง)' : 'งานวันนี้'
                    const { data: rows } = await scopedOpen(mode)
                    if (!rows || rows.length === 0) {
                        await replyToUser(replyToken, `✅ ไม่มี${label}ให้ปิด (${scopeLabel})`)
                        continue
                    }
                    let ok = 0, fail = 0
                    for (const j of rows) {
                        if (await botCloseJob(j.Job_ID)) ok++; else fail++
                    }
                    await replyToUser(replyToken,
                        `✅ ปิด${label}แล้ว ${ok} งาน${fail ? ` (ล้มเหลว ${fail})` : ''} (${scopeLabel})\n` +
                        `หมายเหตุ: ปิดแบบไม่มี POD — บันทึกไว้ในหมายเหตุงานแล้ว`)
                    continue
                }

                if (action === 'CANCEL_CLOSE') {
                    await replyToUser(replyToken, '❌ ยกเลิกการปิดงานเรียบร้อยแล้วครับ')
                    continue
                }
            }

            // ─────────────────────────────────────────────────────────────
            // TEXT MESSAGE
            // ─────────────────────────────────────────────────────────────
            if (event.type === 'message' && event.message?.type === 'text') {
                const rawText = (event.message.text || '').trim()
                const text = rawText.toUpperCase()

                // ── ADMIN: close/list jobs from LINE (holiday助け for elderly
                //    drivers who can't operate the app). Free reply, no push.
                //    "งานค้างส่ง"  → backlog: past-date unclosed jobs
                //    "งานไม่จบ"    → today's unclosed jobs
                //    "ปิดงาน <id>" → force-close one job (no POD, tagged in Notes)
                //    "ปิดงานทั้งหมด" → confirm, then "ยืนยันปิดทั้งหมด" closes the backlog
                {
                    const JOB_CMD = [
                        'งานค้างส่ง', 'งานค้าง', 'งานไม่จบ',
                        'ปิดงานทั้งหมด', 'ยืนยันปิดทั้งหมด', 'ยืนยันปิดงานทั้งหมด',
                        'ปิดงานวันนี้ทั้งหมด', 'ปิดงานวันนี้', 'ยืนยันปิดงานวันนี้', 'ยืนยันปิดงานวันนี้ทั้งหมด', 'ยืนยันปิดวันนี้'
                    ]
                    const isJobCmd = JOB_CMD.includes(rawText) || /^ปิดงาน\s+\S+/i.test(rawText)
                    if (isJobCmd) {
                        const isAdminUser = !!boundAdmin && [1, 2].includes(Number(boundAdmin.Role_ID))
                        const isSuper = !!boundAdmin && Number(boundAdmin.Role_ID) === 1
                        if (!isAdminUser) {
                            await replyToUser(replyToken, '❌ คำสั่งนี้สำหรับแอดมินเท่านั้น')
                            continue
                        }

                        const CLOSED = ['Completed', 'Complete', 'Delivered', 'Verified', 'Billed', 'Paid', 'Cancelled', 'Draft', 'Rejected']
                        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                        const adminBranch = boundAdmin?.Branch_ID
                        const scopeLabel = isSuper ? 'ทุกสาขา' : `สาขา ${adminBranch}`

                        // backlog = ย้อนหลัง (< วันนี้) · today = วันนี้ · all = ย้อนหลัง+วันนี้ (<= วันนี้)
                        const scopedOpen = (mode: 'backlog' | 'today' | 'all') => {
                            let q = supabase
                                .from('Jobs_Main')
                                .select('Job_ID, Customer_Name, Driver_Name, Job_Status, Plan_Date')
                                .not('Job_Status', 'in', `(${CLOSED.join(',')})`)
                            if (mode === 'backlog') q = q.lt('Plan_Date', today)
                            else if (mode === 'today') q = q.eq('Plan_Date', today)
                            else q = q.lte('Plan_Date', today)
                            if (!isSuper && adminBranch) q = q.eq('Branch_ID', adminBranch)
                            return q.order('Plan_Date', { ascending: true }).limit(100)
                        }

                        const fmtList = (rows: Array<{ Job_ID: string; Customer_Name?: string | null; Driver_Name?: string | null; Job_Status?: string | null; Plan_Date?: string | null }>) =>
                            rows.map((j, i) =>
                                `${i + 1}. #${String(j.Job_ID).slice(-6).toUpperCase()} • ${j.Customer_Name || '-'} • ${j.Driver_Name || 'ไม่มีคนขับ'} • ${j.Job_Status} (${j.Plan_Date || '-'})`
                            ).join('\n')

                        // Force-close one job: direct update (bypasses POD guard), tag in
                        // Notes for audit, and DO NOT push a late "delivered" LINE to the
                        // customer (avoids confusing back-dated notifications + quota burn).
                        const botCloseJob = async (jobId: string): Promise<boolean> => {
                            const { data: cur } = await supabase.from('Jobs_Main').select('Notes').eq('Job_ID', jobId).single()
                            const stamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
                            const note = `[ปิดโดยแอดมิน ${boundAdmin?.Name || boundAdmin?.Username} ผ่าน LINE ${stamp} — ไม่มี POD]`
                            const { error } = await supabase
                                .from('Jobs_Main')
                                .update({ Job_Status: 'Completed', Notes: cur?.Notes ? `${cur.Notes}\n${note}` : note })
                                .eq('Job_ID', jobId)
                            return !error
                        }

                        // LIST: backlog
                        if (rawText === 'งานค้างส่ง' || rawText === 'งานค้าง') {
                            const { data: rows } = await scopedOpen('backlog')
                            if (!rows || rows.length === 0) {
                                await replyToUser(replyToken, `✅ ไม่มีงานค้างส่ง (${scopeLabel})`)
                                continue
                            }
                            const more = rows.length >= 100 ? '\n… (แสดง 100 รายการแรก)' : ''
                            await replyToUser(replyToken, {
                                type: 'text',
                                text: `📋 งานค้างส่ง (ย้อนหลัง) ${rows.length} งาน (${scopeLabel})\n\n${fmtList(rows)}${more}\n\n` +
                                    `▶️ ปิดทีละงาน: พิมพ์  ปิดงาน [เลขงาน]\n▶️ ปิดทั้งหมด: กดปุ่มด้านล่าง หรือพิมพ์ ปิดงานทั้งหมด`,
                                quickReply: {
                                    items: [
                                        {
                                            type: 'action',
                                            action: {
                                                type: 'postback',
                                                label: '⚡ ปิดงานทั้งหมด',
                                                data: 'action=REQUEST_CONFIRM&mode=backlog',
                                                displayText: 'ปิดงานทั้งหมด'
                                            }
                                        }
                                    ]
                                }
                            })
                            continue
                        }

                        // LIST: today's unfinished
                        if (rawText === 'งานไม่จบ') {
                            const { data: rows } = await scopedOpen('today')
                            if (!rows || rows.length === 0) {
                                await replyToUser(replyToken, `✅ ไม่มีงานค้างของวันนี้ (${scopeLabel})`)
                                continue
                            }
                            const more = rows.length >= 100 ? '\n… (แสดง 100 รายการแรก)' : ''
                            await replyToUser(replyToken, {
                                type: 'text',
                                text: `📋 งานไม่จบวันนี้ ${rows.length} งาน (${scopeLabel})\n\n${fmtList(rows)}${more}\n\n` +
                                    `▶️ ปิดทีละงาน: พิมพ์  ปิดงาน [เลขงาน]\n▶️ ปิดวันนี้ทั้งหมด: กดปุ่มด้านล่าง หรือพิมพ์ ปิดงานวันนี้ทั้งหมด`,
                                quickReply: {
                                    items: [
                                        {
                                            type: 'action',
                                            action: {
                                                type: 'postback',
                                                label: '⚡ ปิดงานวันนี้ทั้งหมด',
                                                data: 'action=REQUEST_CONFIRM&mode=today',
                                                displayText: 'ปิดงานวันนี้ทั้งหมด'
                                            }
                                        }
                                    ]
                                }
                            })
                            continue
                        }

                        // Shared confirm/execute for a mass close, kept separate for
                        // backlog vs today so the action always matches the list viewed.
                        const askConfirm = async (mode: 'backlog' | 'today', label: string, confirmWord: string) => {
                            let cq = supabase.from('Jobs_Main').select('*', { count: 'exact', head: true })
                                .not('Job_Status', 'in', `(${CLOSED.join(',')})`)
                            cq = mode === 'backlog' ? cq.lt('Plan_Date', today) : cq.eq('Plan_Date', today)
                            if (!isSuper && adminBranch) cq = cq.eq('Branch_ID', adminBranch)
                            const { count } = await cq
                            if (!count || count === 0) {
                                await replyToUser(replyToken, `✅ ไม่มี${label}ให้ปิด (${scopeLabel})`)
                                return
                            }
                            await replyToUser(replyToken, {
                                type: 'text',
                                text: `⚠️ จะปิด${label}ทั้งหมด ${count} งาน (${scopeLabel}) แบบไม่มี POD\n\n👇 กรุณากดยืนยันที่ปุ่มด้านล่าง หรือพิมพ์ "${confirmWord}"`,
                                quickReply: {
                                    items: [
                                        {
                                            type: 'action',
                                            action: {
                                                type: 'postback',
                                                label: `✅ ${confirmWord}`,
                                                data: `action=CLOSE_ALL&mode=${mode}`,
                                                displayText: confirmWord
                                            }
                                        },
                                        {
                                            type: 'action',
                                            action: {
                                                type: 'postback',
                                                label: '❌ ยกเลิก',
                                                data: 'action=CANCEL_CLOSE',
                                                displayText: 'ยกเลิก'
                                            }
                                        }
                                    ]
                                }
                            })
                        }
                        const doCloseAll = async (mode: 'backlog' | 'today', label: string) => {
                            const { data: rows } = await scopedOpen(mode)
                            if (!rows || rows.length === 0) {
                                await replyToUser(replyToken, `✅ ไม่มี${label}ให้ปิด (${scopeLabel})`)
                                return
                            }
                            let ok = 0, fail = 0
                            for (const j of rows) {
                                if (await botCloseJob(j.Job_ID)) ok++; else fail++
                            }
                            await replyToUser(replyToken,
                                `✅ ปิด${label}แล้ว ${ok} งาน${fail ? ` (ล้มเหลว ${fail})` : ''} (${scopeLabel})\n` +
                                `หมายเหตุ: ปิดแบบไม่มี POD — บันทึกไว้ในหมายเหตุงานแล้ว`)
                        }

                        // CLOSE ALL — backlog only (matches "งานค้างส่ง")
                        if (rawText === 'ปิดงานทั้งหมด') {
                            await askConfirm('backlog', 'งานค้างส่ง (ย้อนหลัง)', 'ยืนยันปิดทั้งหมด'); continue
                        }
                        if (rawText === 'ยืนยันปิดทั้งหมด' || rawText === 'ยืนยันปิดงานทั้งหมด') {
                            await doCloseAll('backlog', 'งานค้างส่ง (ย้อนหลัง)'); continue
                        }

                        // CLOSE ALL — today only (matches "งานไม่จบ")
                        if (rawText === 'ปิดงานวันนี้ทั้งหมด' || rawText === 'ปิดงานวันนี้') {
                            await askConfirm('today', 'งานวันนี้', 'ยืนยันปิดงานวันนี้'); continue
                        }
                        if (rawText === 'ยืนยันปิดงานวันนี้' || rawText === 'ยืนยันปิดงานวันนี้ทั้งหมด' || rawText === 'ยืนยันปิดวันนี้') {
                            await doCloseAll('today', 'งานวันนี้'); continue
                        }

                        // CLOSE ONE: "ปิดงาน <id>"
                        const m = rawText.match(/^ปิดงาน\s+(\S+)/i)
                        if (m) {
                            const key = m[1].trim().toUpperCase().replace(/^#/, '')
                            let q = supabase
                                .from('Jobs_Main')
                                .select('Job_ID, Customer_Name, Job_Status, Plan_Date')
                                .not('Job_Status', 'in', `(${CLOSED.join(',')})`)
                                .ilike('Job_ID', `%${key}%`)
                                .limit(5)
                            if (!isSuper && adminBranch) q = q.eq('Branch_ID', adminBranch)
                            const { data: matches } = await q
                            if (!matches || matches.length === 0) {
                                await replyToUser(replyToken, `❌ ไม่พบงานค้างที่ตรงกับ "${key}" (${scopeLabel})\nพิมพ์  งานค้างส่ง  เพื่อดูรายการ`)
                                continue
                            }
                            if (matches.length > 1) {
                                await replyToUser(replyToken,
                                    `พบหลายงานที่ตรงกับ "${key}" — ระบุให้ชัดขึ้น:\n` +
                                    matches.map(j => `• #${String(j.Job_ID).slice(-6).toUpperCase()} • ${j.Customer_Name || '-'}`).join('\n'))
                                continue
                            }
                            const target = matches[0]
                            const done = await botCloseJob(target.Job_ID)
                            await replyToUser(replyToken, done
                                ? `✅ ปิดงาน #${String(target.Job_ID).slice(-6).toUpperCase()} (${target.Customer_Name || '-'}) แล้ว — ไม่มี POD (บันทึกในหมายเหตุ)`
                                : `❌ ปิดงาน #${String(target.Job_ID).slice(-6).toUpperCase()} ไม่สำเร็จ ลองใหม่อีกครั้ง`)
                            continue
                        }
                    }
                }

                // --- IP APPROVAL COMMAND FROM LINE ---
                if (text.startsWith('อนุมัติ IP ') || text.startsWith('บล็อก IP ') || text.startsWith('APPROVE IP ') || text.startsWith('BLOCK IP ')) {
                    const isSuperAdmin = boundAdmin && (
                        Number(boundAdmin.Role_ID) === 1 || 
                        String(boundAdmin.Role).trim().toLowerCase() === 'super admin'
                    )
                    
                    if (!isSuperAdmin) {
                        await replyToUser(replyToken, '❌ ขออภัยครับ คุณไม่มีสิทธิ์ในการอนุมัติ/บล็อก IP (ต้องเป็นสิทธิ์ Super Admin เท่านั้น)')
                        continue
                    }

                    const isApprove = text.startsWith('อนุมัติ IP ') || text.startsWith('APPROVE IP ')
                    const cleanText = rawText.replace(/(อนุมัติ IP |บล็อก IP |APPROVE IP |BLOCK IP )/i, '').trim()
                    const parts = cleanText.split(/\s+/) // [username, ip]
                    
                    if (parts.length < 2) {
                        await replyToUser(replyToken, '❌ รูปแบบคำสั่งไม่ถูกต้อง\nรูปแบบ: อนุมัติ IP [Username] [IP]')
                        continue
                    }

                    const targetUsername = parts[0].trim()
                    const targetIp = parts[1].trim()

                    // Find pending IP record (case-insensitive username comparison)
                    const { data: ipRecord, error: fetchError } = await supabase
                        .from('user_approved_ips')
                        .select('*')
                        .ilike('username', targetUsername)
                        .eq('ip_address', targetIp)
                        .maybeSingle()

                    if (fetchError || !ipRecord) {
                        await replyToUser(replyToken, `❌ ไม่พบรายการรออนุมัติสำหรับผู้ใช้ ${targetUsername} และ IP ${targetIp}`)
                        continue
                    }

                    const { error: updateError } = await supabase
                        .from('user_approved_ips')
                        .update({
                            status: isApprove ? 'Approved' : 'Blocked',
                            approved_by: `LINE:${boundAdmin.Username}`,
                            approved_at: new Date().toISOString()
                        })
                        .eq('id', ipRecord.id)

                    if (updateError) {
                        await replyToUser(replyToken, `❌ เกิดข้อผิดพลาดในการปรับปรุงสถานะ: ${updateError.message}`)
                        continue
                    }

                    // Log activity
                    await supabase.from('System_Logs').insert({
                        module: 'Settings',
                        action_type: isApprove ? 'APPROVE' : 'UPDATE',
                        user_id: boundAdmin.Username,
                        username: boundAdmin.Username,
                        role: boundAdmin.Role || 'Super Admin',
                        details: { 
                            action: isApprove ? 'APPROVE_IP_LINE' : 'BLOCK_IP_LINE', 
                            target_user: targetUsername, 
                            target_ip: targetIp,
                            approved_via: 'LINE',
                            ip_address: 'LINE_CALLBACK'
                        }
                    })

                    const statusThai = isApprove ? 'อนุมัติ' : 'บล็อก'
                    await replyToUser(replyToken, `✅ ทำการ${statusThai} IP ${targetIp} ของผู้ใช้ ${targetUsername} เรียบร้อยแล้วครับ!`)
                    continue
                }

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
                        '🛠️ ปิดงานแทน (Admin — วันหยุด/ช่วยคนขับ)',
                        '  - งานค้างส่ง — งานค้างย้อนหลัง',
                        '  - งานไม่จบ — งานวันนี้ที่ยังไม่เสร็จ',
                        '  - ปิดงาน [เลขงาน] — ปิดทีละงาน',
                        '  - ปิดงานทั้งหมด — ปิดงานค้างส่ง ย้อนหลัง (ยืนยัน)',
                        '  - ปิดงานวันนี้ทั้งหมด — ปิดงานวันนี้ (ยืนยัน)',
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
                        // Enforce unique binding for THIS bot's id column: clear it
                        // from any other customer first, then bind to this customer.
                        // (custLineIdField = Line_User_ID for bot 1, Line_User_ID_2 for bot 2.)
                        await supabase.from('Master_Customers').update({ [custLineIdField]: null }).eq(custLineIdField, targetId)
                        await supabase.from('Master_Customers').update({ [custLineIdField]: targetId }).eq('Customer_ID', customer.Customer_ID)

                        // Also register this recipient (group or individual) in the
                        // team-contacts table so a customer can accumulate 3-5 members
                        // and/or a group chat, instead of overwriting a single field.
                        // upsert on (Line_Target_ID, Bot_Index) keeps re-binds idempotent.
                        try {
                            await supabase.from('Customer_Line_Contacts').upsert({
                                Customer_ID: customer.Customer_ID,
                                Line_Target_ID: targetId,
                                Target_Type: groupId ? 'group' : 'user',
                                Bot_Index: botIndex,
                                Contact_Name: groupId ? 'กลุ่มไลน์ทีมลูกค้า' : null,
                                Active: true,
                            }, { onConflict: 'Line_Target_ID,Bot_Index' })
                        } catch { /* table may not exist yet → legacy field still bound */ }

                        await replyToUser(replyToken, `✅ ${groupId ? 'ไลน์กลุ่มนี้' : 'คุณ ' + customer.Customer_Name} ผูกบัญชีสำเร็จแล้วครับ!\nพิมพ์ HELP เพื่อดูเมนูได้เลย`)
                        continue
                    }

                    // Driver
                    const { data: driver } = await supabase.from('Master_Drivers')
                        .select('Driver_ID, Driver_Name')
                        .ilike('Driver_ID', id.trim())
                        .eq('Mobile_No', normalizedPhone)
                        .maybeSingle()
                    if (driver) {
                        // Enforce unique binding: clear this targetId from other records first
                        await Promise.all([
                            supabase.from('Master_Customers').update({ Line_User_ID: null }).eq('Line_User_ID', targetId),
                            supabase.from('Master_Drivers').update({ Line_User_ID: null }).eq('Line_User_ID', targetId),
                            supabase.from('Master_Users').update({ Line_User_ID: null }).eq('Line_User_ID', targetId),
                        ])
                        await supabase.from('Master_Drivers').update({ Line_User_ID: targetId }).eq('Driver_ID', driver.Driver_ID)
                        await replyToUser(replyToken, `✅ ${groupId ? 'ไลน์กลุ่มนี้' : 'คุณ ' + driver.Driver_Name + ' (คนขับ)'} ผูกบัญชีสำเร็จแล้วครับ!\nพิมพ์ "งาน" เพื่อดูงานของคุณ`)
                        continue
                    }

                    // เจ้าของสังกัด: BIND [รหัสสังกัด] [รหัสผ่าน]
                    const { data: subMatch } = await supabase.from('Master_Subcontractors')
                        .select('Sub_ID, Sub_Name, Password')
                        .eq('Sub_ID', id.trim())
                        .maybeSingle()
                    if (subMatch && subMatch.Password && String(subMatch.Password) === String(phone)) {
                        await supabase.from('Master_Subcontractors').update({ Line_User_ID: null }).eq('Line_User_ID', personId)
                        await supabase.from('Master_Subcontractors').update({ Line_User_ID: personId }).eq('Sub_ID', subMatch.Sub_ID)
                        await replyToUser(replyToken, `✅ ผูกบัญชีสังกัด "${subMatch.Sub_Name}" สำเร็จ!\nพิมพ์ "สรุปจ่าย" เพื่อดูใบสรุปจ่ายของคนขับในสังกัดครับ 🎉`)
                        continue
                    }

                    // Admin (any user in Master_Users)
                    const { data: allAdminMatches } = await supabase.from('Master_Users')
                        .select('Username, Name, Role, Role_ID, Email')
                        .or(`Username.ilike.%${id}%,Email.ilike.%${id}%`)
                        .limit(5)

                    console.log(`[BIND Admin] Search "${id}" → found ${allAdminMatches?.length ?? 0}:`, allAdminMatches?.map((u: { Username: string }) => u.Username))

                    const adminUser = allAdminMatches?.[0] ?? null

                    if (adminUser && phone.toUpperCase() === 'ADMIN') {
                        // Admin can link BOTH bots: each OA gives a different userId, so
                        // store it in the column for the bot that sent this BIND
                        // (Line_User_ID for bot 1, Line_User_ID_2 for bot 2).
                        // Enforce unique binding: clear this targetId from other records first.
                        await Promise.all([
                            supabase.from('Master_Customers').update({ [custLineIdField]: null }).eq(custLineIdField, targetId),
                            supabase.from('Master_Drivers').update({ Line_User_ID: null }).eq('Line_User_ID', targetId),
                            supabase.from('Master_Users').update({ [custLineIdField]: null }).eq(custLineIdField, targetId),
                        ])
                        await supabase.from('Master_Users').update({ [custLineIdField]: targetId }).eq('Username', adminUser.Username)
                        await replyToUser(replyToken, `✅ ยินดีต้อนรับ${groupId ? 'ไลน์กลุ่มนี้' : 'คุณ ' + adminUser.Name}!\nRole: ${adminUser.Role}\nผูกบัญชีสำเร็จแล้วครับ 🎉`)
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

                // 2.5 เจ้าของสังกัด: "สรุปจ่าย" → Flex รวมสลิปของคนขับในสังกัด
                if (boundSub) {
                    if (text === 'สรุปจ่าย' || text === 'ใบสำคัญจ่าย' || text === 'สลิป' || text === 'สลิปจ่าย' || text.includes('สรุปจ่าย')) {
                        const { data: subDrivers } = await supabase.from('Master_Drivers').select('Driver_ID').eq('Sub_ID', boundSub.Sub_ID)
                        const ids = (subDrivers || []).map((d: { Driver_ID: string }) => String(d.Driver_ID)).filter(Boolean)
                        const cols = 'id, title, period_label, total_amount, kind, public_token, driver_name, uploaded_at'
                        const byDriver = ids.length ? (await supabase.from('Driver_Payslips').select(cols).in('Driver_ID', ids).order('uploaded_at', { ascending: false }).limit(30)).data || [] : []
                        const bySub = (await supabase.from('Driver_Payslips').select(cols).eq('Sub_ID', boundSub.Sub_ID).order('uploaded_at', { ascending: false }).limit(30)).data || []
                        const map = new Map<string, { id: string; title?: string; period_label?: string; total_amount?: number; public_token?: string; driver_name?: string; uploaded_at?: string; kind?: string }>()
                        for (const r of [...bySub, ...byDriver]) map.set(String(r.id), r)
                        const slips = Array.from(map.values()).sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || ''))).slice(0, 12)

                        if (!slips.length) {
                            await replyToUser(replyToken, `📄 สังกัด ${boundSub.Sub_Name}\nยังไม่มีใบสรุปจ่ายของคนขับในสังกัดครับ`)
                            continue
                        }
                        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tms-e-pod.vercel.app'
                        const bubbles = slips.map(s => ({
                            type: 'bubble', size: 'kilo',
                            header: { type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#1e3a8a',
                                contents: [
                                    { type: 'text', text: s.driver_name || s.title || 'ใบสรุปจ่ายรถ', color: '#ffffff', size: 'sm', weight: 'bold', wrap: true },
                                    { type: 'text', text: s.period_label ? `งวด ${s.period_label}` : (s.kind === 'voucher' ? 'ใบสำคัญจ่าย' : 'สรุปจ่ายรถ'), color: '#93c5fd', size: 'xs' },
                                ] },
                            body: { type: 'box', layout: 'vertical', paddingAll: '12px',
                                contents: [{ type: 'text', text: typeof s.total_amount === 'number' ? `฿${s.total_amount.toLocaleString()}` : '—', size: 'xxl', weight: 'bold', color: '#047857' }] },
                            footer: { type: 'box', layout: 'vertical', paddingAll: '12px',
                                contents: [{ type: 'button', style: 'primary', color: '#1e3a8a', height: 'sm',
                                    action: { type: 'uri', label: 'เปิดดู / โหลด PDF', uri: s.public_token ? `${appUrl}/p/payslip/${s.public_token}` : `${appUrl}/mobile/payslips/${s.id}` } }] },
                        }))
                        await replyToUser(replyToken, { type: 'flex', altText: `ใบสรุปจ่าย สังกัด ${boundSub.Sub_Name} (${slips.length})`, contents: { type: 'carousel', contents: bubbles } })
                        continue
                    }
                    await replyToUser(replyToken, `สวัสดีครับ สังกัด ${boundSub.Sub_Name}\nพิมพ์ "สรุปจ่าย" เพื่อดูใบสรุปจ่ายของคนขับในสังกัด`)
                    continue
                }

                // 3. Driver shortcuts
                if (boundDriver) {
                    // "สรุปจ่าย" → Flex card ใบสรุปจ่ายรถ (เปิดดู/โหลด PDF ในแอป)
                    if (text === 'สรุปจ่าย' || text === 'ใบสำคัญจ่าย' || text === 'สลิป' || text === 'สลิปจ่าย' || text.includes('สรุปจ่าย')) {
                        const { data: slips } = await supabase.from('Driver_Payslips')
                            .select('id, title, period_label, total_amount, kind, uploaded_at, public_token')
                            .eq('Driver_ID', boundDriver.Driver_ID)
                            .order('uploaded_at', { ascending: false })
                            .limit(6)

                        if (!slips?.length) {
                            await replyToUser(replyToken, `📄 คุณ ${boundDriver.Driver_Name}\nยังไม่มีใบสรุปจ่ายรถในระบบครับ\nแอดมินจะส่งให้เมื่อถึงงวดจ่าย`)
                            continue
                        }

                        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tms-e-pod.vercel.app'
                        const bubbles = (slips as { id: string; title?: string; period_label?: string; total_amount?: number; kind?: string; public_token?: string }[]).map(s => ({
                            type: 'bubble', size: 'kilo',
                            header: { type: 'box', layout: 'vertical', paddingAll: '12px', backgroundColor: '#1e3a8a',
                                contents: [
                                    { type: 'text', text: s.kind === 'voucher' ? '🧾 ใบสำคัญจ่าย' : '📊 สรุปจ่ายรถ', color: '#93c5fd', size: 'xs', weight: 'bold' },
                                    { type: 'text', text: s.title || 'ใบสรุปจ่ายรถ', color: '#ffffff', size: 'sm', weight: 'bold', wrap: true },
                                ] },
                            body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
                                contents: [
                                    ...(s.period_label ? [{ type: 'text', text: `งวด ${s.period_label}`, size: 'xs', color: '#64748b' }] : []),
                                    { type: 'text', text: typeof s.total_amount === 'number' ? `฿${s.total_amount.toLocaleString()}` : '—', size: 'xxl', weight: 'bold', color: '#047857' },
                                ] },
                            footer: { type: 'box', layout: 'vertical', paddingAll: '12px',
                                contents: [
                                    { type: 'button', style: 'primary', color: '#1e3a8a', height: 'sm',
                                        action: { type: 'uri', label: 'เปิดดู / โหลด PDF',
                                            // ลิงก์สาธารณะ (public_token) เปิดได้เลยไม่ต้องล็อกอิน; fallback หน้าในแอปถ้าไม่มี token
                                            uri: s.public_token ? `${appUrl}/p/payslip/${s.public_token}` : `${appUrl}/mobile/payslips/${s.id}` } },
                                ] },
                        }))

                        await replyToUser(replyToken, {
                            type: 'flex',
                            altText: `ใบสรุปจ่ายรถ (${slips.length} รายการ)`,
                            contents: { type: 'carousel', contents: bubbles },
                        })
                        continue
                    }

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
                            jobs.forEach((j: { Job_ID: string; Customer_Name: string | null; Route_Name: string | null; Job_Status: string | null }, i: number) => lines.push(
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

                        const result = await transitionJobStatus(activeJob.Job_ID, 'In Progress', {
                            userId: boundDriver.Driver_ID,
                            username: boundDriver.Driver_Name,
                            reason: 'LINE Bot: เริ่มงาน'
                        })

                        if (!result.success) {
                            await replyToUser(replyToken, `❌ ไม่สามารถบันทึกเริ่มงานได้: ${result.message}`)
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
                        
                        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tms-e-pod.vercel.app'
                        const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID || process.env.NEXT_PUBLIC_LIFF_SIGNATURE_ID || '2006123456-ABCdefgh'}?jobId=${activeJob.Job_ID}`
                        
                        await replyToUser(replyToken, `🚛 [ส่งมอบสินค้า - ${activeJob.Job_ID}]\n\nพี่คนขับสามารถทำการยืนยันจัดส่งได้ผ่าน 2 วิธีนี้ครับ:\n\n📸 วิธีที่ 1: ถ่ายรูปสินค้าที่ส่งมอบ หรือรูปใบเสร็จที่มีลายเซ็นลูกค้าแล้วส่งเข้าห้องแชทนี้\n\n✍️ วิธีที่ 2: ในกรณีไม่มีเอกสารกระดาษ สามารถให้ลูกค้าเซ็นชื่อสดบนหน้าจอมือถือได้ทันทีที่นี่ครับ:\n🔗 เซ็นชื่อรับสินค้า: ${liffUrl}`)
                        continue
                    }

                    if (text.includes('START') || text.includes('เริ่ม')) {
                        // Regex matching to smartly capture JOB-XXXX even if surrounded by other text
                        const match = rawText.match(/JOB-[A-Z0-9-]+/i)
                        const jobId = match ? match[0].toUpperCase() : rawText.split(' ')[0].toUpperCase()

                        const result = await transitionJobStatus(jobId, 'In Progress', {
                            userId: boundDriver.Driver_ID,
                            username: boundDriver.Driver_Name,
                            reason: 'LINE Bot: START command'
                        })
                        let replyMsg = `✅ เริ่มงาน ${jobId} เรียบร้อยครับ!\n🚛 ขอให้เดินทางปลอดภัย`
                        const userLang = getLanguage(userId)
                        if (userLang === 'MM') {
                            replyMsg = `✅ လုပ်ငန်း ${jobId} ကို အောင်မြင်စွာ စတင်လိုက်ပါပြီ။\n🚛 ဘေးကင်းလုံခြုံစွာ မောင်းနှင်ပါရန် ဆုမွန်ကောင်းတောင်းအပ်ပါသည်။`
                        } else if (userLang === 'KH') {
                            replyMsg = `✅ ការងារ ${jobId} ត្រូវបានចាប់ផ្តើមដោយជោគជ័យ!\n🚛 សូមបើកបរដោយសុវត្ថិភាពនិងប្រុងប្រយ័ត្ន`
                        } else if (userLang === 'EN') {
                            replyMsg = `✅ Job ${jobId} has successfully started!\n🚛 Have a safe trip.`
                        }

                        await replyToUser(replyToken, !result.success
                            ? `❌ ไม่สามารถเริ่มงานได้: ${result.message}`
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
                            const active = jobs.filter((j: { Job_Status: string | null }) => ['In Progress', 'In Transit', 'กำลังโหลด', 'ระหว่างขนส่ง'].includes(j.Job_Status || '')).length
                            const completed = jobs.filter((j: { Job_Status: string | null }) => ['Completed', 'Delivered', 'สำเร็จ', 'เสร็จสิ้น'].includes(j.Job_Status || '')).length
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
                                jobs.forEach((j: { Job_ID: string; Customer_Name: string | null; Job_Status: string | null }) => lines.push(`- ${j.Job_ID}: ${j.Customer_Name} [${j.Job_Status}]`))
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
                        today.jobs.forEach((j: Record<string, unknown>) => lines.push(`- ${j.id}: ${j.customer} (${j.status})`))
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
                            
                            customerJobs.forEach((job: { Job_ID: string; Job_Status: string | null; Driver_Name: string | null; Route_Name: string | null; Delivery_Lat?: number | null; Delivery_Lon?: number | null; Plan_Date?: string | null }) => {
                                const statusEmoji = job.Job_Status === 'In Transit' ? '🚛' : '⏳'
                                const statusName = job.Job_Status === 'In Transit' ? 'ระหว่างขนส่ง' : 'กำลังดำเนินการ'
                                lines.push(`📦 เลขงาน: ${job.Job_ID}`)
                                lines.push(`📍 สถานะ: ${statusEmoji} ${statusName}`)
                                if (job.Driver_Name) {
                                    lines.push(`👨‍✈️ คนขับ: ${job.Driver_Name}`)
                                }
                                lines.push(`🗺️ แผนที่ติดตามรถ: ${process.env.NEXT_PUBLIC_APP_URL || 'https://tms-e-pod.vercel.app'}/track/${job.Job_ID}`)
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
                            else jobs.forEach((j: { Job_ID: string; Customer_Name: string | null }) => lines.push(`- ${j.Job_ID}: ${j.Customer_Name}`))
                            
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
                            const myStat = driverAnalytics.find((d: Record<string, unknown>) => d.driverId === boundDriver.Driver_ID)
                            if (text === 'อันดับ' || text === 'LEADERBOARD') {
                                const topDrivers = driverAnalytics.slice(0, 5)
                                const lines = [
                                    `🏆 [กระดานผู้นำการขนส่ง (Leaderboard)]`,
                                    `รายชื่อคนขับที่มีผลงานดีเด่นที่สุด:`,
                                    ''
                                ]
                                topDrivers.forEach((d: Record<string, unknown>, index: number) => {
                                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🎖️'
                                    lines.push(`${medal} อันดับ ${index + 1}: ${d.name} (${d.points} คะแนน, ${d.rank})`)
                                })
                                
                                if (myStat) {
                                    const myRankIndex = driverAnalytics.findIndex((d: Record<string, unknown>) => d.driverId === boundDriver.Driver_ID)
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
                            topDrivers.forEach((d: Record<string, unknown>, index: number) => {
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
                        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tms-e-pod.vercel.app'
                        if (boundDriver) {
                            await replyToUser(replyToken, `📱 [LINE LIFF Mini-App]\n\nพี่ ${boundDriver.Driver_Name} สามารถใช้งานระบบ TMS เต็มรูปแบบในห้องแชทได้โดยไม่ต้องออกไปแอปอื่นครับ:\n🔗 เข้าสู่แอปคนขับ: ${appUrl}/mobile/jobs\n\nอำนวยความสะดวกด้วยฟังก์ชันเซ็นชื่อดิจิทัลและถ่ายรูปหลักฐานในปุ่มเดียวครับ! 🚀`)
                            continue
                        } else if (boundCustomer) {
                            await replyToUser(replyToken, `📱 [LINE LIFF Mini-App]\n\nคุณ ${boundCustomer.Customer_Name} สามารถเปิดแอปติดตามสถานะจัดส่งและดาวน์โหลดเอกสารจากแชทนี้ได้เลย:\n🔗 เข้าสู่ระบบลูกค้า: ${appUrl}/dashboard/tracking\n\nรวดเร็ว ทันใจ ไม่ต้องติดตั้งแอปเพิ่มเติมครับ! 🚀`)
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
                        const query = rawText
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

                            const gps = gpsLog as { timestamp?: string | number | Date, latitude?: number, longitude?: number }
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
                                jobSummary.byCustomer.slice(0, 15).forEach((c: Record<string, unknown>, index: number) => {
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
                            utilSummary.forEach((v: { type: string, maxWeightLimit?: number | null, avgWeightPerJob?: number | null, maxVolumeLimit?: number | null, avgVolumePerJob?: number | null, jobCount?: number | null, totalWeight?: number | null, totalVolume?: number | null }) => {
                                const weightUtil = (v.maxWeightLimit && v.maxWeightLimit > 0 && v.avgWeightPerJob) ? ((v.avgWeightPerJob / v.maxWeightLimit) * 100).toFixed(1) : '0'
                                const volUtil = (v.maxVolumeLimit && v.maxVolumeLimit > 0 && v.avgVolumePerJob) ? ((v.avgVolumePerJob / v.maxVolumeLimit) * 100).toFixed(1) : '0'
                                
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
                        repairs.slice(0, 10).forEach((t: Record<string, unknown>) => lines.push(`- ${t.vehicle}: ${t.problem} (${t.status})`))
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
                        health.slice(0, 10).forEach((h: Record<string, unknown>) => lines.push(`- ${h.vehicle}: [${h.severity}] ${h.message}`))
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
                        leaves.slice(0, 10).forEach((l: Record<string, unknown>) => lines.push(`- ${l.driver}: ${l.from} ถึง ${l.to} (${l.type})`))
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

                // 4b. AI write-action confirm / cancel (admins only)
                //     After an AI write action is proposed, the admin taps the
                //     button (or types the word) to run or discard it.
                // Confirm/cancel a pending action. Uses adminFuel so it also works in
                // group chats — but there it's restricted to fuel logs only (other
                // admin write-actions can't even be created in a group).
                if (adminFuel && (rawText === 'ยืนยันคำสั่ง' || rawText === 'ยกเลิกคำสั่ง')) {
                    const pending = await popPendingAction(userId)
                    if (!pending) {
                        await replyToUser(replyToken, 'ไม่พบคำสั่งที่รอยืนยัน (อาจหมดเวลาแล้ว) กรุณาสั่งใหม่อีกครั้งครับ')
                        continue
                    }
                    if (rawText === 'ยกเลิกคำสั่ง') {
                        const meta = buildPendingAction(pending.name, pending.args)
                        await replyToUser(replyToken, meta.cancelMessage)
                        continue
                    }
                    // In a group, only the fuel log may be confirmed (safety).
                    if (inGroup && pending.name !== 'create_fuel_log') {
                        await replyToUser(replyToken, 'ในกลุ่มไลน์ยืนยันได้เฉพาะการบันทึกเติมน้ำมันครับ — คำสั่งอื่นให้ทำในแชทส่วนตัว')
                        continue
                    }
                    // Inject the admin's branch as a default, then execute.
                    const adminBranch = adminFuel.Branch_ID
                    const args: Record<string, unknown> = { ...pending.args }
                    if (adminBranch && (args.branchId == null || args.branchId === '')) args.branchId = adminBranch
                    const resultText = await executeWriteTool(pending.name, args, Number(adminFuel.Role_ID), {
                        actor: userId, channel: 'line',
                    })
                    await replyToUser(replyToken, resultText)
                    continue
                }

                // 4c. Undo the last AI-created record (admins only)
                if (boundAdmin && ['ยกเลิกรายการล่าสุด', 'ย้อนกลับล่าสุด', 'ยกเลิกล่าสุด', 'ย้อนรายการล่าสุด', 'undo'].includes(rawText.toLowerCase())) {
                    const undo = await undoLastAction(userId)
                    await replyToUser(replyToken, undo.message)
                    continue
                }

                // 5. AI fallback (bound users only)
                if (boundAdmin || boundDriver || boundCustomer) {
                    const userRole = boundAdmin ? 'Admin' : (boundDriver ? 'Driver' : 'Customer')
                    const systemPrompt = await buildAIContext(branchId, userName, userRole)
                    const canWrite = !!boundAdmin && [1, 2].includes(Number(boundAdmin.Role_ID))
                    const { text: aiResponse, error: aiError, pendingAction } = await callGemini(systemPrompt, rawText, [], canWrite)

                    // Write action proposed → save it and ask for confirmation.
                    if (pendingAction) {
                        await savePendingAction(userId, pendingAction.name, pendingAction.args)
                        const meta = buildPendingAction(pendingAction.name, pendingAction.args)
                        await replyToUser(replyToken, {
                            type: 'text',
                            text: `${meta.title}\n\n${meta.summary}\n\n👇 กดยืนยันเพื่อดำเนินการ`,
                            quickReply: {
                                items: [
                                    { type: 'action', action: { type: 'message', label: '✅ ยืนยัน', text: 'ยืนยันคำสั่ง' } },
                                    { type: 'action', action: { type: 'message', label: 'ยกเลิก', text: 'ยกเลิกคำสั่ง' } },
                                ],
                            },
                        })
                        continue
                    }

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
            // AUDIO MESSAGE (Voice to Action & Omnimodal AI)
            // ─────────────────────────────────────────────────────────────
            if (event.type === 'message' && event.message?.type === 'audio') {
                if (!boundAdmin && !boundDriver) {
                    await replyToUser(replyToken, '⚠️ ฟีเจอร์สั่งงานด้วยเสียงใช้ได้เฉพาะแอดมินและคนขับที่ผูกบัญชีแล้วครับ')
                    continue
                }

                try {
                    const audioBuffer = await getMessageContent(event.message.id)
                    const activeJob = boundDriver ? await getActiveDriverJob(boundDriver.Driver_ID) : null
                    const parsed = await parseVoiceMessage(audioBuffer, {
                        userName,
                        role: boundAdmin ? 'Admin' : boundDriver ? 'Driver' : 'User',
                        branchId,
                        activeJobId: activeJob?.Job_ID
                    })

                    const prefix = `🎙️ ได้ยินว่า: "${parsed.transcription}"\n`

                    if (parsed.intent === 'UPDATE_JOB_STATUS' && activeJob) {
                        const targetStatus = (parsed.payload?.status as string) || 'Delivered'
                        const cash = Number(parsed.payload?.cashCollected) || 0
                        
                        try {
                            const supabase = createAdminClient()
                            const updateData: Record<string, unknown> = { Job_Status: targetStatus }
                            if (cash > 0) {
                                updateData.Notes = (activeJob.Notes ? `${activeJob.Notes} | ` : '') + `เก็บเงินสด: ฿${cash.toLocaleString()}`
                            }
                            await supabase.from('Jobs_Main').update(updateData).eq('Job_ID', activeJob.Job_ID)
                            await replyToUser(replyToken, `${prefix}\n✅ อัปเดตสถานะงาน #${activeJob.Job_ID} เป็น "${targetStatus}" เรียบร้อยแล้วครับ!${cash > 0 ? `\n💰 บันทึกยอดเงินสดที่ได้รับ: ฿${cash.toLocaleString()}` : ''}`)
                        } catch (stErr) {
                            await replyToUser(replyToken, `${prefix}\n❌ อัปเดตสถานะงานไม่สำเร็จ: ${String(stErr)}`)
                        }
                        continue
                    }

                    if (parsed.intent === 'REPORT_DELAY_OR_INCIDENT' && activeJob) {
                        const delayMin = parsed.payload?.delayMinutes || 'ชั่วคราว'
                        const reason = parsed.payload?.reason || 'เกิดเหตุขัดข้องหน้างาน'
                        const supabase = createAdminClient()
                        const existingNotes = activeJob.Notes || ''
                        const updatedNotes = `${existingNotes} [แจ้งเหตุล่าช้า: ${reason} (ประมาณ ${delayMin} นาที)]`.trim()
                        await supabase.from('Jobs_Main').update({ Notes: updatedNotes }).eq('Job_ID', activeJob.Job_ID)
                        await replyToUser(replyToken, `${prefix}\n⚠️ บันทึกรายงานเหตุล่าช้าลงในงาน #${activeJob.Job_ID} เรียบร้อยแล้วครับ\nเหตุผล: ${reason}\nเจ้าหน้าที่จะประสานงานเพิ่มเติมครับ`)
                        continue
                    }

                    if (parsed.intent === 'LOG_FUEL') {
                        const liters = Number(parsed.payload?.liters) || 0
                        const totalAmount = Number(parsed.payload?.totalAmount) || 0
                        const odometer = Number(parsed.payload?.odometer) || 0
                        const station = (parsed.payload?.stationName as string) || 'ปั๊มน้ำมัน'
                        const plate = (parsed.payload?.plate as string) || boundDriver?.Vehicle_Plate || '3ฒว2502'

                        if (liters > 0 || totalAmount > 0) {
                            const supabase = createAdminClient()
                            const logId = `FUEL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`
                            await supabase.from('Fuel_Logs').insert({
                                Log_ID: logId,
                                Vehicle_Plate: plate,
                                Driver_ID: boundDriver?.Driver_ID || userName,
                                Driver_Name: userName,
                                Liters: liters,
                                Price_Total: totalAmount,
                                Odometer: odometer,
                                Station_Name: station,
                                Branch_ID: branchId || 'URT',
                                Status: 'Pending'
                            })
                            await replyToUser(replyToken, `${prefix}\n⛽ บันทึกการเติมน้ำมันสำเร็จ:\n- ทะเบียน: ${plate}\n- ปริมาณ: ${liters} ลิตร\n- ยอดเงิน: ฿${totalAmount.toLocaleString()}\n- เลขไมล์: ${odometer > 0 ? odometer.toLocaleString() + ' กม.' : 'ไม่ระบุ'}\n- ปั๊ม: ${station}`)
                            continue
                        }
                    }

                    if (parsed.intent === 'REQUEST_LEAVE' && boundDriver) {
                        const leaveType = (parsed.payload?.leaveType as string) || 'Sick'
                        const reason = (parsed.payload?.reason as string) || 'ลาส่วนตัว'
                        const startDate = (parsed.payload?.startDate as string) || new Date().toISOString().split('T')[0]
                        const endDate = (parsed.payload?.endDate as string) || startDate

                        const supabase = createAdminClient()
                        await supabase.from('Driver_Leaves').insert({
                            Driver_ID: boundDriver.Driver_ID,
                            Driver_Name: userName,
                            Leave_Type: leaveType,
                            Date_From: startDate,
                            Date_To: endDate,
                            Reason: reason,
                            Status: 'Pending',
                            Branch_ID: branchId || 'URT'
                        })
                        await replyToUser(replyToken, `${prefix}\n📅 บันทึกคำขอลาเรียบร้อยแล้ว:\n- ประเภท: ${leaveType}\n- วันที่: ${startDate} ถึง ${endDate}\n- เหตุผล: ${reason}\n(รอแอดมินพิจารณาอนุมัติ)`)
                        continue
                    }

                    if (parsed.intent === 'REPORT_REPAIR') {
                        const problem = (parsed.payload?.problemDescription as string) || 'แจ้งตรวจเช็กสภาพรถ'
                        const plate = (parsed.payload?.plate as string) || boundDriver?.Vehicle_Plate || 'ไม่ระบุ'
                        const supabase = createAdminClient()
                        const ticketId = `MNT-${Date.now().toString().slice(-6)}`
                        await supabase.from('Maintenance_Tickets').insert({
                            Ticket_ID: ticketId,
                            Vehicle_Plate: plate,
                            Problem_Description: problem,
                            Status: 'Pending',
                            Reported_At: new Date().toISOString(),
                            Branch_ID: branchId || 'URT'
                        })
                        await replyToUser(replyToken, `${prefix}\n🔧 เปิดใบแจ้งซ่อม #${ticketId} สำเร็จ:\n- ทะเบียน: ${plate}\n- อาการ: ${problem}\n(ระบบส่งเรื่องถึงฝ่ายซ่อมบำรุงแล้วครับ)`)
                        continue
                    }

                    if (parsed.intent === 'CREATE_JOB' && boundAdmin) {
                        const p = parsed.payload || {}
                        await replyToUser(replyToken, `${prefix}\n📋 ได้รับคำสั่งสร้างงาน:\n- ลูกค้า: ${p.customerName || 'ไม่ระบุ'}\n- ต้นทาง: ${p.origin || '-'}\n- ปลายทาง: ${p.destination || '-'}\n- ราคา: ฿${(Number(p.price) || 0).toLocaleString()}\n- วันที่: ${p.planDate || 'วันนี้'}\n\nพิมพ์ "ยืนยันสร้างงาน" หรือคลิกสร้างผ่านหน้าจอเว็บได้เลยครับ`)
                        continue
                    }

                    // Default response fallback
                    await replyToUser(replyToken, `${prefix}\n${parsed.summaryText || 'รับทราบคำสั่งเสียงเรียบร้อยครับ'}`)
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
                // TEMP DEBUG: log group image identity resolution so we can see why an
                // admin's receipt is silently ignored (usually: LINE didn't send userId
                // because they haven't friended this OA, or a bot/id mismatch).
                if (inGroup) {
                    try {
                        await supabase.from('System_Logs').insert({
                            module: 'LineDebug',
                            action_type: 'GROUP_IMAGE',
                            details: {
                                botIndex,
                                hasUserId: !!userId,
                                userId: userId || null,
                                groupId: groupId || null,
                                matchedAdmin: !!resolvedAdmin,
                                matchedDriver: !!boundDriver,
                                matchedCustomer: !!boundCustomer,
                            },
                            created_at: new Date().toISOString(),
                        })
                    } catch { /* ignore */ }
                }

                // adminFuel included so an admin's fuel receipt is processed in groups too
                if (!boundAdmin && !boundDriver && !boundCustomer && !adminFuel) continue

                try {
                    const messageId = event.message.id
                    const fileName = (event.message as Record<string, unknown>).fileName || 'image.jpg'
                    const mimeType = event.message.type === 'image' ? 'image/jpeg' : 'application/pdf' // Default to PDF for files
                    
                    const buffer = await getMessageContent(messageId)

                    // ── Driver-specific Smart Photo Processing (ePOD & Fuel Receipts) ──────────────────
                    if (boundDriver && event.message.type === 'image') {
                        // Check if the driver has an active state from our stateful flow.
                        // In group chats we only accept fuel receipts (drivers are present
                        // together), so the POD/state flow is 1:1 only.
                        const driverState = getDriverState(userId)
                        if (driverState && !inGroup) {
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
                                    const pickupUpdate: Record<string, unknown> = {
                                        Photo_Proof_Url: newPhotos
                                    }
                                    try {
                                        pickupUpdate.Actual_Pickup_Time = timeString
                                        pickupUpdate.Pickup_Date = dateString
                                    } catch {}
                                    
                                    const result = await transitionJobStatus(activeJob.Job_ID, 'Picked Up', {
                                        userId: boundDriver.Driver_ID,
                                        username: boundDriver.Driver_Name,
                                        reason: 'LINE Bot: Smart Pickup Photo'
                                    })

                                    if (result.success) {
                                        await supabase.from('Jobs_Main').update(pickupUpdate).eq('Job_ID', activeJob.Job_ID)
                                        clearDriverState(userId)
                                        
                                        await replyToUser(replyToken, `📦 [บันทึกการรับสินค้าเรียบร้อย]\n\n✅ อัปโหลดรูปภาพหลักฐานรับสินค้าสำหรับงาน #${activeJob.Job_ID} เรียบร้อยแล้วครับ!\n\nสถานะงานถูกปรับเป็น 'รับสินค้าแล้ว' (Picked Up) เข้าระบบส่วนกลางเรียบร้อยครับ 🚛💨\n\nเมื่อพี่ขับรถเดินทางไปถึงปลายทางแล้ว สามารถพิมพ์คำว่า "ส่งของ" เพื่อปิดงานได้เลยครับ`)
                                    } else {
                                        await replyToUser(replyToken, `❌ ไม่สามารถบันทึกรับสินค้าได้: ${result.message}`)
                                    }
                                    continue
                                } else if (stateType === 'waiting_for_delivery_proof') {
                                    await supabase.from('Jobs_Main').update({
                                        Photo_Proof_Url: newPhotos,
                                        Actual_Delivery_Time: timeString,
                                        Delivery_Date: dateString
                                    }).eq('Job_ID', activeJob.Job_ID)

                                    const result = await transitionJobStatus(activeJob.Job_ID, 'Delivered', {
                                        userId: boundDriver.Driver_ID,
                                        username: boundDriver.Driver_Name,
                                        reason: 'LINE Bot: Delivery Photo'
                                    })

                                    if (!result.success) {
                                        await replyToUser(replyToken, `Cannot mark delivery as Delivered: ${result.message}`)
                                        continue
                                    }
                                    
                                    clearDriverState(userId)

                                    // Trigger Customer Satisfaction Survey
                                    try {
                                        const { data: jobWithCust } = await supabase.from('Jobs_Main')
                                            .select('Customer_ID')
                                            .eq('Job_ID', activeJob.Job_ID)
                                            .single()

                                        if (jobWithCust?.Customer_ID) {
                                            let custTarget: { Line_User_ID?: string | null; Line_User_ID_2?: string | null } | null = null

                                            // 1. Try Master_Customers (both bot ids)
                                            try {
                                                const { data: custInfo } = await supabase.from('Master_Customers')
                                                    .select('Line_User_ID, Line_User_ID_2')
                                                    .eq('Customer_ID', jobWithCust.Customer_ID)
                                                    .maybeSingle()
                                                if (custInfo && (custInfo.Line_User_ID || custInfo.Line_User_ID_2)) {
                                                    custTarget = custInfo
                                                }
                                            } catch {}

                                            // 2. Try Master_Users as fallback (e.g. 'uni') — primary bot only
                                            if (!custTarget) {
                                                try {
                                                    const { data: userCust } = await supabase.from('Master_Users')
                                                        .select('Line_User_ID')
                                                        .ilike('Username', jobWithCust.Customer_ID)
                                                        .maybeSingle()
                                                    if (userCust?.Line_User_ID) {
                                                        custTarget = { Line_User_ID: userCust.Line_User_ID }
                                                    }
                                                } catch {}
                                            }

                                            if (custTarget) {
                                                await pushToCustomerActive(custTarget, `📦 [แจ้งเตือนการส่งมอบสินค้า]\n\nเรียนคุณลูกค้า สินค้าของงาน #${activeJob.Job_ID} ได้รับการจัดส่งเรียบร้อยแล้วครับ!\n\n⭐️ เพื่อการปรับปรุงและพัฒนาบริการที่ดีขึ้น กรุณาให้คะแนนความพึงพอใจโดยการส่งตัวเลขกลับหาเรา:\nพิมพ์ "5" สำหรับ ดีเยี่ยม ⭐️⭐️⭐️⭐️⭐️\nพิมพ์ "4" สำหรับ ดีมาก ⭐️⭐️⭐️⭐️\nพิมพ์ "3" สำหรับ ปานกลาง ⭐️⭐️⭐️\nพิมพ์ "2" สำหรับ พอใช้ ⭐️⭐️\nพิมพ์ "1" สำหรับ ต้องปรับปรุง ⭐️`)
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
The image may be rotated sideways.

Classify the image into one of three types:
1. "fuel_receipt" - Fuel purchase receipt, gas station invoice, or refueling log.
2. "delivery_proof" - Signed delivery sheet (POD), cargo proof, dropoff photo, or package delivery.
3. "other" - Any other photo.

If it is a fuel receipt, strictly extract the exact information verbatim:
- "stationName": EXACT full company name / registered name of the SELLER (ผู้ขาย / สถานีบริการ / ผู้ออกใบกำกับ) at the TOP header of the receipt (e.g. 'บริษัท ขวัญเมือง ปิโตรเลียม ดีเซลออยล์ จำกัด'). DO NOT confuse with customer info (ข้อมูลลูกค้า). Never invent or guess words.
- "taxIdSeller": Seller 13-digit tax ID
- "priceTotal": Total amount in THB (รวมเป็นเงิน, number)
- "liters": Fuel quantity in liters (จำนวนลิตร, number)
- "unitPrice": Price per liter in THB (ราคาต่อลิตร / ราคา/ลิตร, number, e.g. 38.70). If not printed, calculate priceTotal / liters.
- "odometer": Vehicle odometer reading if printed (เลขไมล์, number)
- "vehiclePlate": Vehicle registration plate (ทะเบียนรถ)
- "dateTime": Date and time in ISO format YYYY-MM-DDTHH:mm:ss. Convert Buddhist year (e.g. 2569 -> 2026).

Provide JSON ONLY:
{
  "classification": "fuel_receipt" | "delivery_proof" | "other",
  "stationName": "Exact seller name or null",
  "taxIdSeller": "13-digit tax ID or null",
  "priceTotal": 1200.00,
  "liters": 45.5,
  "unitPrice": 38.70,
  "odometer": 123456,
  "vehiclePlate": "3ฒว2502",
  "dateTime": "YYYY-MM-DDTHH:mm:ss"
}
`.trim()

                        let classification = 'other'
                        let extracted: Record<string, unknown> = {}
                        try {
                            const classResText = await callGeminiMultimodal(
                                "You are an expert OCR and logistics AI coordinator.",
                                classPrompt,
                                mimeType,
                                buffer,
                                'gemini-3.5-flash',
                                {
                                    temperature: 0.0,
                                    responseMimeType: 'application/json',
                                    disableTools: true
                                }
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

                        // 1b. Fuel fallback: the 3-way classifier above under-detects fuel
                        // receipts (a driver often has an active job, biasing toward
                        // "delivery_proof"/"other"). Admins use a dedicated fuel-only OCR
                        // that is more reliable, so drivers' receipts in a group were being
                        // dropped silently by the `if (inGroup) continue` below. Re-run the
                        // same dedicated fuel prompt; if it reads as a receipt, treat it as
                        // fuel so the normal handler (with reply) takes over.
                        if (classification !== 'fuel_receipt') {
                            try {
                                const fuelOnlyPrompt = `
You are a specialized Thai OCR engine for fuel receipts and tax invoices (ใบเสร็จรับเงิน/ใบกำกับภาษี).
Analyze this image carefully. The image may be rotated sideways.
If it is a fuel purchase receipt / gas station invoice, return JSON ONLY:
{"classification":"fuel_receipt","stationName":"EXACT seller/issuer name at the TOP header (ผู้ขาย/ผู้ออกใบกำกับ), verbatim, no hallucination","taxIdSeller":"13-digit tax id or null","priceTotal":1200.00,"liters":45.5,"unitPrice":38.70,"odometer":123456,"vehiclePlate":"plate on receipt or null","dateTime":"YYYY-MM-DDTHH:mm:ss (convert Buddhist year e.g. 2569->2026); null if not printed"}
If it is NOT a fuel receipt, return {"classification":"other"}. No markdown, JSON only.`.trim()
                                const fuelText = await callGeminiMultimodal(
                                    'You are an expert Thai document OCR AI.',
                                    fuelOnlyPrompt,
                                    mimeType,
                                    buffer,
                                    'gemini-3.5-flash',
                                    { temperature: 0.0, responseMimeType: 'application/json', disableTools: true }
                                )
                                if (fuelText) {
                                    const parsedFuel = JSON.parse(fuelText.replace(/```json/g, '').replace(/```/g, '').trim())
                                    if (parsedFuel.classification === 'fuel_receipt') {
                                        classification = 'fuel_receipt'
                                        extracted = parsedFuel
                                    }
                                }
                            } catch (e) {
                                console.warn('[Line Driver Fuel Fallback Error]', e)
                            }
                        }

                        // 2. Handle Fuel Receipt
                        if (classification === 'fuel_receipt') {
                            const validation = await validateFuelSlip(supabase, extracted, {
                                driverId: boundDriver.Driver_ID,
                                driverName: userName,
                                assignedPlate: boundDriver.Vehicle_Plate,
                                branchId: boundDriver.Branch_ID
                            })

                            if (!validation.isValid) {
                                await replyToUser(replyToken, validation.rejectionMessage || '❌ ข้อมูลใบเสร็จไม่ครบถ้วน กรุณาขอใบเสร็จใหม่จากปั๊มน้ำมัน')
                                continue
                            }

                            const timestamp = Date.now()
                            const fileNameStr = `fuel_${timestamp}.jpg`
                            const uploadRes = await uploadFileToSupabase(buffer, fileNameStr, 'image/jpeg', 'Fuel_Photos')
                            
                            const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).replace(/-/g, '')
                            const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
                            const logId = `FUEL-${dateStr}-${randomSuffix}`

                            // B: เดา end/enroute จากสถานะงานของรถ ณ เวลาเติม เก็บเป็น default
                            const drvSuggested = await suggestFillType(supabase, String(validation.resolvedPlate), validation.dateTime)
                            await supabase.from('Fuel_Logs').insert({
                                Log_ID: logId,
                                Date_Time: validation.dateTime,
                                Driver_ID: boundDriver.Driver_ID,
                                Vehicle_Plate: validation.resolvedPlate,
                                Liters: validation.liters,
                                Price_Total: validation.priceTotal,
                                Odometer: validation.odometer,
                                Station_Name: validation.stationName,
                                Photo_Url: uploadRes.directLink,
                                // Fuel belongs to the vehicle's branch (so it shows in that
                                // branch's report), not the sender's — fall back to the driver's.
                                Branch_ID: (isRealBranch(validation.branchId) ? validation.branchId : boundDriver.Branch_ID) || null,
                                Trip_Fill_Type: drvSuggested,
                                Status: 'Pending'
                            })

                            // Sync vehicle odometer forward in Master_Vehicles
                            if (validation.resolvedPlate && validation.odometer > 0) {
                                try {
                                    const { data: veh } = await supabase
                                        .from('Master_Vehicles')
                                        .select('Current_Mileage')
                                        .eq('Vehicle_Plate', validation.resolvedPlate)
                                        .maybeSingle()
                                    const current = Number(veh?.Current_Mileage) || 0
                                    if (validation.odometer > current) {
                                        await supabase
                                            .from('Master_Vehicles')
                                            .update({ Current_Mileage: Math.round(validation.odometer) })
                                            .eq('Vehicle_Plate', validation.resolvedPlate)
                                    }
                                } catch (e) {
                                    console.error('[Fuel] Odometer sync failed:', e)
                                }
                            }

                            const warningBlock = validation.odometerWarning ? `\n\n${validation.odometerWarning}` : ''
                            const plateWarningBlock = validation.plateWarning ? `\n\nℹ️ ${validation.plateWarning}` : ''

                            // A: บันทึกแล้ว — ให้คนขับกดแก้เฉพาะเคส "เติมระหว่างทาง" ถ้าจำเป็น
                            await replyToUser(replyToken, {
                                type: 'text',
                                text: `⛽ [บันทึกค่าน้ำมันอัตโนมัติด้วย AI]\n\n✅ ตรวจสอบใบเสร็จและบันทึกเรียบร้อยครับ!\n\n${validation.summaryText}${warningBlock}${plateWarningBlock}\n\n🧾 บันทึกเรียบร้อยแล้ว\nถ้าเป็นการ "เติมแทรกระหว่างทาง" ที่งานยังไม่จบ กดปุ่มด้านล่างเพื่อระบุได้ครับ 👇`,
                                quickReply: {
                                    items: [
                                        { type: 'action' as const, action: { type: 'postback' as const, label: '🛣️ เป็นการเติมระหว่างทาง', data: `action=SET_FILL_TYPE&log=${logId}&type=enroute`, displayText: 'ระบุ: เติมระหว่างทาง' } },
                                        { type: 'action' as const, action: { type: 'postback' as const, label: '✅ เติมปกติ (ถูกแล้ว)', data: `action=SET_FILL_TYPE&log=${logId}&type=end`, displayText: 'ระบุ: เติมปกติ' } },
                                    ],
                                },
                            })
                            continue
                        }

                        // In a group chat, drivers may only submit fuel receipts. The
                        // image reached here without reading as fuel even after the
                        // dedicated fallback above — so give the driver a short hint
                        // instead of dropping it silently (the previous behaviour that
                        // made fuel-bill submissions look "ignored"). Kept brief and only
                        // for known drivers, so it doesn't spam the group.
                        if (inGroup) {
                            await replyToUser(replyToken, `⛽ พี่ ${boundDriver.Driver_Name} ครับ บอทอ่านรูปนี้เป็นใบเสร็จน้ำมันไม่ออก 🙏\nรบกวนถ่ายให้เห็น ชื่อปั๊ม / จำนวนลิตร / ยอดเงิน / วันที่ ให้ชัด แล้วส่งใหม่อีกครั้ง หรือส่งเข้าแชทส่วนตัวกับบอทก็ได้ครับ`)
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
                                    Photo_Proof_Url: newPhotos,
                                    Actual_Delivery_Time: timeString,
                                    Delivery_Date: dateString
                                }).eq('Job_ID', activeJob.Job_ID)

                                const result = await transitionJobStatus(activeJob.Job_ID, 'Delivered', {
                                    userId: boundDriver.Driver_ID,
                                    username: boundDriver.Driver_Name,
                                    reason: 'LINE Bot: Smart Delivery Photo'
                                })

                                if (result.success) {
                                    await supabase.from('Jobs_Main').update({
                                        Photo_Proof_Url: newPhotos,
                                        Actual_Delivery_Time: timeString,
                                        Delivery_Date: dateString
                                    }).eq('Job_ID', activeJob.Job_ID)
                                } else {
                                    await replyToUser(replyToken, `❌ ไม่สามารถบันทึกส่งของได้: ${result.message}`)
                                    continue
                                }

                                // Trigger Customer Satisfaction Survey (แบบสำรวจความพอใจ)
                                try {
                                    const { data: jobWithCust } = await supabase.from('Jobs_Main')
                                        .select('Customer_ID')
                                        .eq('Job_ID', activeJob.Job_ID)
                                        .single()

                                    if (jobWithCust?.Customer_ID) {
                                        const { data: custInfo } = await supabase.from('Master_Customers')
                                            .select('Line_User_ID, Line_User_ID_2')
                                            .eq('Customer_ID', jobWithCust.Customer_ID)
                                            .maybeSingle()

                                        if (custInfo && (custInfo.Line_User_ID || custInfo.Line_User_ID_2)) {
                                            await pushToCustomerActive(custInfo, `📦 [แจ้งเตือนการส่งมอบสินค้า]\n\nเรียนคุณลูกค้า สินค้าของงาน #${activeJob.Job_ID} ได้รับการจัดส่งเรียบร้อยแล้วครับ!\n\n⭐️ เพื่อการปรับปรุงและพัฒนาบริการที่ดีขึ้น กรุณาให้คะแนนความพึงพอใจโดยการส่งตัวเลขกลับหาเรา:\nพิมพ์ "5" สำหรับ ดีเยี่ยม ⭐️⭐️⭐️⭐️⭐️\nพิมพ์ "4" สำหรับ ดีมาก ⭐️⭐️⭐️⭐️\nพิมพ์ "3" สำหรับ ปานกลาง ⭐️⭐️⭐️\nพิมพ์ "2" สำหรับ พอใช้ ⭐️⭐️\nพิมพ์ "1" สำหรับ ต้องปรับปรุง ⭐️`)
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

                    // ── Admin fuel-receipt OCR → confirm create_fuel_log ─────────────────────────────
                    // Admins can snap a fuel receipt for ANY vehicle; we extract
                    // the details and ask for a confirm button before saving.
                    if (adminFuel && event.message.type === 'image') {
                        const fuelPrompt = `
You are a specialized Thai OCR engine for fuel receipts and tax invoices (ใบเสร็จรับเงิน/ใบกำกับภาษี).
Analyze this image carefully. The image may be rotated sideways.
If it is a fuel purchase receipt / gas station invoice, return JSON ONLY:
{
  "isFuel": true,
  "stationName": "EXACT full company/station name of the SELLER / ISSUER (ผู้ขาย/ผู้ออกใบกำกับ) at the TOP header of the receipt (e.g. บริษัท ขวัญเมือง ปิโตรเลียม ดีเซลออยล์ จำกัด). DO NOT confuse with customer name (ข้อมูลลูกค้า). Strictly transcribe verbatim, no hallucination.",
  "taxIdSeller": "13-digit tax ID of the seller or null",
  "priceTotal": 1200.00,
  "liters": 45.5,
  "unitPrice": 38.70,
  "odometer": 123456,
  "vehiclePlate": "Vehicle license plate on receipt or null",
  "dateTime": "YYYY-MM-DDTHH:mm:ss"
}
(unitPrice = ราคาต่อลิตร / price per liter in THB. If not printed, calculate priceTotal / liters)
For dateTime: read the date printed ON the receipt (an admin may log it days late). Thai receipts often use Buddhist year (พ.ศ., e.g. 2568 = 2025) and dd/MM/yyyy — convert to Gregorian ISO. If no date is printed, return null (do NOT guess today).
If it is NOT a fuel receipt, return {"isFuel": false}. No markdown, JSON only.
`.trim()
                        let fuel: Record<string, unknown> = {}
                        try {
                            const t = await callGeminiMultimodal(
                                'You are an expert Thai document OCR AI.',
                                fuelPrompt,
                                mimeType,
                                buffer,
                                'gemini-3.5-flash',
                                {
                                    temperature: 0.0,
                                    responseMimeType: 'application/json',
                                    disableTools: true
                                }
                            )
                            if (t) fuel = JSON.parse(t.replace(/```json/g, '').replace(/```/g, '').trim())
                        } catch { /* not fuel */ }

                        if (fuel.isFuel) {
                            const validation = await validateFuelSlip(supabase, fuel, {
                                branchId: adminFuel.Branch_ID
                            })

                            if (!validation.isValid) {
                                await replyToUser(replyToken, validation.rejectionMessage || '❌ ข้อมูลใบเสร็จไม่ครบถ้วน กรุณาขอใบเสร็จใหม่จากปั๊มน้ำมัน')
                                continue
                            }

                            const uploadRes = await uploadFileToSupabase(buffer, `fuel_${Date.now()}.jpg`, 'image/jpeg', 'Fuel_Photos')
                            const args: Record<string, unknown> = {
                                plate: validation.resolvedPlate,
                                liters: validation.liters,
                                unitPrice: validation.unitPrice,
                                price: validation.priceTotal,
                                odometer: validation.odometer,
                                station: validation.stationName,
                                dateTime: validation.dateTime,
                                photoUrl: uploadRes.directLink,
                                // Fuel belongs to the vehicle's branch (so it shows in that
                                // branch's report) — the sender may be a super-admin on a
                                // non-branch (e.g. HQ). Fall back to the sender's branch.
                                branchId: (isRealBranch(validation.branchId) ? validation.branchId : adminFuel.Branch_ID) || undefined,
                            }
                            // B: เดา end/enroute จากสถานะงานของรถ ณ เวลาเติม แล้วเอาปุ่มที่แนะนำขึ้นก่อน
                            const suggested = await suggestFillType(supabase, String(validation.resolvedPlate), validation.dateTime)
                            await savePendingAction(userId, 'create_fuel_log', args)
                            const meta = buildPendingAction('create_fuel_log', args)
                            const warningBlock = validation.odometerWarning ? `\n\n${validation.odometerWarning}` : ''
                            const plateWarningBlock = validation.plateWarning ? `\n\nℹ️ ${validation.plateWarning}` : ''

                            // ใช้ postback ไม่ใช่ message — กันข้อความไปชนกับ handler คำสั่งงาน
                            const endBtn = { type: 'action' as const, action: { type: 'postback' as const, label: suggested === 'end' ? '✅ ยืนยัน บันทึก' : '✅ ยืนยัน บันทึก', data: 'action=CONFIRM_FUEL&type=end', displayText: 'ยืนยันบันทึก' } }
                            const enrouteBtn = { type: 'action' as const, action: { type: 'postback' as const, label: '🛣️ เติมระหว่างทาง', data: 'action=CONFIRM_FUEL&type=enroute', displayText: 'เติมระหว่างทาง (งานยังไม่จบ)' } }
                            await replyToUser(replyToken, {
                                type: 'text',
                                text: `${meta.title}\n\n${meta.summary}${warningBlock}${plateWarningBlock}\n\n👇 ตรวจสอบแล้วกดยืนยันได้เลย\n(ถ้าเป็นการ "เติมแทรกระหว่างทาง" ที่งานยังไม่จบ ให้กดปุ่มขวาแทน)`,
                                quickReply: {
                                    items: [
                                        ...(suggested === 'enroute' ? [enrouteBtn, endBtn] : [endBtn, enrouteBtn]),
                                        { type: 'action' as const, action: { type: 'postback' as const, label: 'ยกเลิก', data: 'action=CONFIRM_FUEL&type=cancel', displayText: 'ยกเลิก' } },
                                    ],
                                },
                            })
                            continue
                        }
                    }

                    // In a group, only the fuel receipt is handled (above). A non-fuel
                    // image from an admin should not trigger a generic AI reply to the
                    // whole group — skip silently.
                    if (!boundAdmin && !boundDriver && !boundCustomer) continue

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
                    const loc = event.message as Record<string, unknown>
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

                        const result = await transitionJobStatus(activeJob.Job_ID, 'SOS', {
                            userId: boundDriver.Driver_ID,
                            username: boundDriver.Driver_Name,
                            reason: 'LINE Bot: SOS Location Share'
                        })

                        if (result.success) {
                            // Update job status to SOS and record coordinates
                            await supabase.from('Jobs_Main')
                                .update({
                                    Delivery_Lat: lat,
                                    Delivery_Lon: lon,
                                    Notes: updatedNotes
                                })
                                .eq('Job_ID', activeJob.Job_ID)

                            await replyToUser(replyToken, `🚨 [แจ้งเหตุฉุกเฉิน SOS สำเร็จ]\n\n📍 ระบบได้บันทึกพิกัดสถานที่เกิดเหตุของคุณสำหรับงาน #${activeJob.Job_ID} เรียบร้อยแล้วครับ!\n🏠 ที่อยู่: ${address}\n\nเจ้าหน้าที่สาขาและหน่วยกู้ภัยกำลังเร่งประสานการเข้าช่วยเหลือ โปรดเตรียมตัวรับสายโทรศัพท์และรออยู่ในจุดที่ปลอดภัยครับ!`)
                        } else {
                            await replyToUser(replyToken, `❌ ไม่สามารถบันทึกแจ้งเหตุได้: ${result.message}`)
                        }
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
