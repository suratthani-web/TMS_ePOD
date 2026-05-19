import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { replyToUser, verifyLineSignature, getMessageContent, pushToUser } from '@/lib/integrations/line'
import { aiToolExecutors, geminiToolDefinitions } from '@/lib/ai/tools'

// ─────────────────────────────────────────────────────────────────
// Models (same as /api/chat) - Direct REST, no SDK
// ─────────────────────────────────────────────────────────────────
const GEMINI_MODELS = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.0-flash",
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
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
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

    const modelName = "gemini-1.5-flash"
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

                    if (text.includes('START') || text.includes('เริ่ม')) {
                        // Regex matching to smartly capture JOB-XXXX even if surrounded by other text
                        const match = rawText.match(/JOB-[A-Z0-9-]+/i)
                        const jobId = match ? match[0].toUpperCase() : rawText.split(' ')[0].toUpperCase()

                        const { error } = await supabase.from('Jobs_Main')
                            .update({ Job_Status: 'In Progress' })
                            .eq('Job_ID', jobId)
                            .eq('Driver_ID', boundDriver.Driver_ID)
                        await replyToUser(replyToken, error
                            ? `❌ ไม่สามารถเริ่มงานได้: ${error.message}`
                            : `✅ เริ่มงาน ${jobId} เรียบร้อยครับ!\n🚛 ขอให้เดินทางปลอดภัย`)
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
                    
                    // Flexible Branch Detection (e.g., "งานวันนี้ SKN" or "งานวันนี้ สาขา SKN")
                    let targetBranchId = userBranchId
                    const cmdWords = ['งานวันนี้', 'สรุปงาน', 'TODAY', 'สรุปยอด']
                    let cleanedText = rawText
                    cmdWords.forEach(w => { cleanedText = cleanedText.replace(w, '').trim() })
                    
                    if (cleanedText) {
                        // Remove "สาขา" prefix if exists to get the pure ID
                        targetBranchId = cleanedText.replace('สาขา', '').trim()
                    }

                    const scopeName = boundCustomer ? `ลูกค้า: ${boundCustomer.Customer_Name}` : (targetBranchId ? `สาขา: ${targetBranchId}` : 'ทุกสาขา')

                    // --- 4.1 Today Jobs ---
                    if (text.includes('งานวันนี้') || text.includes('สรุปงาน') || text === 'TODAY' || text === 'สรุปยอด' || text === 'งาน') {
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

                    // --- 4.2 Financial (Admin only) ---
                    if ((text.includes('รายได้') || text.includes('กำไร') || text.includes('เงิน')) && boundAdmin) {
                        const fin = await aiToolExecutors.get_financial_summary({ branchId: targetBranchId })
                        await replyToUser(replyToken, [
                            '💰 สรุปสถานะการเงิน (เดือนปัจจุบัน)',
                            `📍 ขอบเขต: ${scopeName}`,
                            '',
                            `💵 รายได้: ฿${fin.revenue?.toLocaleString() ?? 0}`,
                            `💸 ต้นทุน: ฿${fin.cost?.toLocaleString() ?? 0}`,
                            `📈 กำไรสุทธิ: ฿${fin.netProfit?.toLocaleString() ?? 0}`,
                            `📊 Margin: ${fin.margin?.toFixed(1) ?? 0}%`,
                        ].join('\n'))
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
        }

        return NextResponse.json({ status: 'ok' })
    } catch (err) {
        console.error('[Line Webhook] Critical error:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
