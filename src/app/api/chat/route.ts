import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/session'
import { createAdminClient } from '@/utils/supabase/server'
import { aiToolExecutors } from '@/lib/ai/tools'
import { getUserBranchId } from '@/lib/permissions'

// Models matching the new API key (Gemini 2.5/3.x generation)
const GEMINI_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.1-pro-preview",
]

// Direct REST call to Gemini - more reliable than SDK in server context
async function callGemini(apiKey: string, model: string, systemPrompt: string, userMessage: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: systemPrompt + '\n\n' + userMessage }
                ]
            }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
        }),
        signal: AbortSignal.timeout(20000) // 20s timeout
    })

    if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
    }

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Empty response from model')
    return text
}

// ─────────────────────────────────────────────────────────────────
// Helper: fetch data with silent error handling
// ─────────────────────────────────────────────────────────────────
const safe = <T,>(result: PromiseSettledResult<T>): T | null =>
    result.status === 'fulfilled' ? result.value : null

// ─────────────────────────────────────────────────────────────────
// Helper: Fetch financials directly from DB (bypass fragile RPC)
// ─────────────────────────────────────────────────────────────────
async function getFinancialDirect(branchId?: string) {
    try {
        const supabase = await createAdminClient()
        const now = new Date()
        const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
            .toISOString().split('T')[0]

        let query = supabase
            .from('Jobs_Main')
            .select('Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, Job_Status')
            .gte('Plan_Date', firstDay)
            .lte('Plan_Date', lastDay)

        if (branchId && branchId !== 'All') {
            query = query.eq('Branch_ID', branchId)
        }

        const { data } = await query
        if (!data) return null

        const REVENUE_STATUSES = ['Completed', 'Delivered', 'Complete']
        const revenueJobs = data.filter((j: { Job_Status?: string | null }) => REVENUE_STATUSES.includes(j.Job_Status || ''))

        const revenue = revenueJobs.reduce((s: number, j: { Price_Cust_Total?: number | null; Price_Cust_Extra?: number | null }) => s + (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0), 0)
        const cost = revenueJobs.reduce((s: number, j: { Cost_Driver_Total?: number | null; Cost_Driver_Extra?: number | null }) => s + (Number(j.Cost_Driver_Total) || 0) + (Number(j.Cost_Driver_Extra) || 0), 0)
        const netProfit = revenue - cost
        const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0

        // Total jobs pipeline this month (for context)
        const pipeline = data.reduce((s: number, j: { Price_Cust_Total?: number | null }) => s + (Number(j.Price_Cust_Total) || 0), 0)

        return { revenue, cost, netProfit, margin, pipeline, jobCount: data.length, revenueJobCount: revenueJobs.length }
    } catch {
        return null
    }
}

// ─────────────────────────────────────────────────────────────────
// Helper: Fetch today's jobs directly
// ─────────────────────────────────────────────────────────────────
async function getTodayDirect(branchId?: string) {
    try {
        const supabase = await createAdminClient()
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

        let query = supabase
            .from('Jobs_Main')
            .select('Job_ID, Job_Status, Customer_Name, Driver_Name, Vehicle_Plate, Route_Name, Origin_Location, Dest_Location, Plan_Date')
            .eq('Plan_Date', today)

        if (branchId && branchId !== 'All') {
            query = query.eq('Branch_ID', branchId)
        }

        const { data } = await query.order('Created_At', { ascending: false }).limit(30)
        if (!data) return null

        const active = data.filter((j: { Job_Status?: string | null }) => ['Picked Up', 'In Transit', 'Assigned', 'Confirmed', 'Arrived'].includes(j.Job_Status || '')).length
        const completed = data.filter((j: { Job_Status?: string | null }) => ['Completed', 'Delivered'].includes(j.Job_Status || '')).length
        const pending = data.filter((j: { Job_Status?: string | null }) => ['New', 'Pending', 'Requested'].includes(j.Job_Status || '')).length
        const sos = data.filter((j: { Job_Status?: string | null }) => j.Job_Status === 'SOS').length

        return {
            total: data.length,
            active,
            completed,
            pending,
            sos,
            jobs: data.slice(0, 10).map((j: { Job_ID: string; Job_Status: string; Customer_Name?: string | null; Driver_Name?: string | null; Vehicle_Plate?: string | null; Route_Name?: string | null; Origin_Location?: string | null; Dest_Location?: string | null }) => ({
                id: j.Job_ID,
                status: j.Job_Status,
                customer: j.Customer_Name,
                driver: j.Driver_Name,
                plate: j.Vehicle_Plate,
                route: j.Route_Name,
                origin: j.Origin_Location,
                dest: j.Dest_Location
            }))
        }
    } catch {
        return null
    }
}

// ─────────────────────────────────────────────────────────────────
// Helper: Fetch customers directly
// ─────────────────────────────────────────────────────────────────
async function getCustomersDirect(branchId?: string) {
    try {
        const supabase = await createAdminClient()
        let query = supabase
            .from('Master_Customers')
            .select('Customer_ID, Customer_Name, Contact_Person, Phone_No, Branch_ID, Active_Status')

        if (branchId && branchId !== 'All') {
            query = query.eq('Branch_ID', branchId)
        }

        const { data } = await query.limit(50)
        return data || []
    } catch {
        return []
    }
}

// ─────────────────────────────────────────────────────────────────
// Helper: Fetch recent job history for trend analysis
// ─────────────────────────────────────────────────────────────────
async function getRecentJobTrend(branchId?: string) {
    try {
        const supabase = await createAdminClient()
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
        const startDate = sevenDaysAgo.toISOString().split('T')[0]

        let query = supabase
            .from('Jobs_Main')
            .select('Plan_Date, Job_Status, Price_Cust_Total, Customer_Name, Route_Name')
            .gte('Plan_Date', startDate)

        if (branchId && branchId !== 'All') {
            query = query.eq('Branch_ID', branchId)
        }

        const { data } = await query.order('Plan_Date', { ascending: true }).limit(200)
        if (!data) return []

        // Group by date
        const byDate: Record<string, { date: string, total: number, completed: number, revenue: number }> = {}
        for (let i = 0; i < 7; i++) {
            const d = new Date(sevenDaysAgo)
            d.setDate(sevenDaysAgo.getDate() + i)
            const ds = d.toISOString().split('T')[0]
            byDate[ds] = { date: ds, total: 0, completed: 0, revenue: 0 }
        }

        data.forEach((j: { Plan_Date?: string | null, Job_Status?: string | null, Price_Cust_Total?: number | null }) => {
            const ds = String(j.Plan_Date).split('T')[0]
            if (byDate[ds]) {
                byDate[ds].total++
                if (['Completed', 'Delivered'].includes(j.Job_Status || '')) {
                    byDate[ds].completed++
                    byDate[ds].revenue += Number(j.Price_Cust_Total) || 0
                }
            }
        })

        return Object.values(byDate)
    } catch {
        return []
    }
}

// ─────────────────────────────────────────────────────────────────
// Helper: Fetch billing/invoice summary
// ─────────────────────────────────────────────────────────────────
async function getBillingSummary(branchId?: string) {
    try {
        const supabase = await createAdminClient()
        const { data } = await supabase
            .from('Billing_Notes')
            .select('Status, Total_Amount, Created_At')
            .limit(100)
            .order('Created_At', { ascending: false })

        if (!data) return null

        const pending = data.filter((b: { Status?: string | null }) => ['Draft', 'Pending', 'Sent'].includes(b.Status || ''))
        const paid = data.filter((b: { Status?: string | null }) => b.Status === 'Paid')

        return {
            total: data.length,
            pending: pending.length,
            paid: paid.length,
            pendingAmount: pending.reduce((s: number, b: { Total_Amount?: number | null }) => s + (Number(b.Total_Amount) || 0), 0),
            paidAmount: paid.reduce((s: number, b: { Total_Amount?: number | null }) => s + (Number(b.Total_Amount) || 0), 0),
        }
    } catch {
        return null
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession()
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json().catch(() => ({}))
        const { message } = body
        if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

        const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
        if (!apiKey) {
            return NextResponse.json({ response: "AI System: ไม่พบ API Key ในการตั้งค่าระบบ" })
        }

        const userBranchId = await getUserBranchId()
        const branchId = (userBranchId && userBranchId !== 'All') ? userBranchId : undefined

        // ─────────────────────────────────────────────────────────────────
        // 1. BUILD COMPREHENSIVE KNOWLEDGE BASE (Direct DB calls - more reliable)
        // ─────────────────────────────────────────────────────────────────
        const [
            todayData,
            financialData,
            allDrivers,
            allVehicles,
            maintenanceStats,
            pendingRepairs,
            fuelAnalytics,
            fleetHealth,
            damageReports,
            driverLeaves,
            customers,
            jobTrend,
            billing,
            workforceAnalytics,
        ] = await Promise.allSettled([
            getTodayDirect(branchId),
            getFinancialDirect(branchId),
            aiToolExecutors.get_all_drivers(),
            aiToolExecutors.get_all_vehicles(),
            aiToolExecutors.get_maintenance_stats(),
            aiToolExecutors.get_pending_repairs(),
            aiToolExecutors.get_fuel_analytics(),
            aiToolExecutors.get_fleet_health(),
            aiToolExecutors.get_damage_reports(),
            aiToolExecutors.get_driver_leaves({}),
            getCustomersDirect(branchId),
            getRecentJobTrend(branchId),
            getBillingSummary(branchId),
            aiToolExecutors.get_workforce_analytics(),
        ])

        const today = safe(todayData)
        const fin = safe(financialData)
        const drivers = safe(allDrivers) as { id?: string; name?: string; status?: string }[] | null
        const vehicles = safe(allVehicles) as { plate?: string; type?: string; status?: string }[] | null
        const maintStats = safe(maintenanceStats)
        const repairs = safe(pendingRepairs) as { vehicle?: string; problem?: string; status?: string }[] | null
        const fuel = safe(fuelAnalytics) as { totalFuelCost?: number; totalLiters?: number; avgPerTrip?: number } | null
        const health = safe(fleetHealth) as { severity?: string; vehicle?: string; alert?: string }[] | null
        const damage = safe(damageReports) as { driver?: string; description?: string; amount?: number; status?: string }[] | null
        const leaves = safe(driverLeaves) as { driver?: string; type?: string; from?: string; to?: string; status?: string }[] | null
        const custList = safe(customers) as { id?: string; Customer_ID?: string; name?: string; Customer_Name?: string }[] | null
        const trend = safe(jobTrend) as { date: string; total: number; completed: number; revenue: number }[] | null
        const bill = safe(billing)
        const workforce = safe(workforceAnalytics)

        // ─────────────────────────────────────────────────────────────────
        // 2. CONSTRUCT RICH SYSTEM PROMPT
        // ─────────────────────────────────────────────────────────────────
        const now = new Date().toLocaleDateString('th-TH', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        })

        const systemPrompt = `
คุณคือ "LogisPro AI" ผู้ช่วยอัจฉริยะของระบบบริหารการขนส่ง สามารถตอบคำถามได้อย่างยืดหยุ่น ไม่จำเป็นต้องพิมพ์คำถามเป๊ะๆ
วันที่และเวลาปัจจุบัน: ${now}
ผู้ใช้งาน: ${session.username || 'Admin'} | สาขา: ${branchId || 'ทุกสาขา'}

═══ 📦 งานวันนี้ ═══
- จำนวนงานทั้งหมดวันนี้: ${today?.total ?? 'ไม่มีข้อมูล'} รายการ
- กำลังดำเนินการ / วิ่งอยู่: ${today?.active ?? 0} คัน
- เสร็จสิ้นแล้ว: ${today?.completed ?? 0} รายการ
- รอดำเนินการ: ${today?.pending ?? 0} รายการ
- SOS/ฉุกเฉิน: ${today?.sos ?? 0} คัน
- รายการงานวันนี้: ${JSON.stringify(today?.jobs ?? [])}

═══ 📈 แนวโน้ม 7 วันที่ผ่านมา ═══
${(trend || []).map((t: { date: string; total: number; completed: number; revenue: number }) => `  ${t.date}: งาน ${t.total} รายการ, เสร็จ ${t.completed}, รายได้ ฿${t.revenue?.toLocaleString()}`).join('\n') || 'ไม่มีข้อมูล'}

═══ 💰 การเงินเดือนนี้ (คำนวณจากงานที่ส่งแล้ว) ═══
- รายได้จากงานที่ส่งแล้ว: ฿${fin?.revenue?.toLocaleString() ?? 'ไม่มีข้อมูล'}
- ยอดรวมทุกงาน (Pipeline): ฿${fin?.pipeline?.toLocaleString() ?? 'ไม่มีข้อมูล'}
- ต้นทุนคนขับรวม: ฿${fin?.cost?.toLocaleString() ?? 'ไม่มีข้อมูล'}
- กำไรสุทธิ: ฿${fin?.netProfit?.toLocaleString() ?? 'ไม่มีข้อมูล'}
- อัตรากำไร: ${fin?.margin?.toFixed(1) ?? 'ไม่มีข้อมูล'}%
- จำนวนงานที่นับรายได้แล้ว: ${fin?.revenueJobCount ?? 0} / ${fin?.jobCount ?? 0} รายการ

═══ 📋 Billing/ใบวางบิล ═══
- ใบวางบิลทั้งหมด: ${bill?.total ?? 0} ใบ
- รอชำระ: ${bill?.pending ?? 0} ใบ (฿${bill?.pendingAmount?.toLocaleString() ?? 0})
- ชำระแล้ว: ${bill?.paid ?? 0} ใบ (฿${bill?.paidAmount?.toLocaleString() ?? 0})

═══ 👥 ลูกค้า ═══
- จำนวนลูกค้าในระบบ: ${custList?.length ?? 0} ราย
- รายชื่อลูกค้า (สูงสุด 15 ราย): ${custList?.slice(0, 15).map((c: { name?: string; Customer_Name?: string; id?: string; Customer_ID?: string }) => `${c.name || c.Customer_Name} (${c.id || c.Customer_ID})`).join(', ') ?? 'ไม่มีข้อมูล'}

═══ 👨‍✈️ คนขับ ═══
- จำนวนคนขับทั้งหมด: ${drivers?.length ?? 0} คน
- Active: ${drivers?.filter((d: { status?: string }) => d.status === 'Active').length ?? 0} คน
- รายชื่อ (10 คนแรก): ${drivers?.slice(0, 10).map((d: { name?: string; id?: string; status?: string; driver?: string; description?: string; amount?: number }) => `${d.name} (${d.id}) - ${d.status}`).join(', ') ?? 'ไม่มีข้อมูล'}

═══ 🚛 ยานพาหนะ ═══
- จำนวนรถทั้งหมด: ${vehicles?.length ?? 0} คัน
- Active: ${vehicles?.filter((v: { status?: string }) => v.status === 'Active').length ?? 0} คัน
- ทะเบียน (10 คันแรก): ${vehicles?.slice(0, 10).map((v: { plate?: string; type?: string }) => `${v.plate} (${v.type || '-'})`).join(', ') ?? 'ไม่มีข้อมูล'}

═══ 🔧 ซ่อมบำรุง ═══
- สรุปภาพรวม: ${JSON.stringify(maintStats ?? {})}
- รอซ่อม: ${repairs?.length ?? 0} รายการ
- รายการซ่อม: ${repairs?.slice(0, 5).map((r: { vehicle?: string; problem?: string; status?: string }) => `${r.vehicle}: ${r.problem} (${r.status})`).join(' | ') ?? 'ไม่มีรายการซ่อม'}

═══ ⛽ น้ำมัน ═══
- ค่าน้ำมันรวม: ฿${fuel?.totalFuelCost?.toLocaleString() ?? 'ไม่มีข้อมูล'}
- ปริมาณน้ำมัน: ${fuel?.totalLiters?.toLocaleString() ?? 0} ลิตร
- เฉลี่ยต่อเที่ยว: ${fuel?.avgPerTrip?.toFixed(1) ?? 0} ลิตร

═══ 🚨 Fleet Health ═══
- แจ้งเตือน: ${health?.length ?? 0} รายการ
- รายละเอียด: ${health?.slice(0, 3).map((h: { severity?: string; vehicle?: string; alert?: string }) => `[${h.severity}] ${h.vehicle}: ${h.alert}`).join(' | ') ?? 'ไม่มีการแจ้งเตือน'}

═══ 💥 สินค้าเสียหาย ═══
- รายการทั้งหมด: ${damage?.length ?? 0} รายการ
- รอตรวจสอบ: ${damage?.filter((d: { status?: string }) => d.status === 'Pending').length ?? 0} รายการ
- รายละเอียด: ${damage?.slice(0, 3).map((d: { name?: string; id?: string; status?: string; driver?: string; description?: string; amount?: number }) => `${d.driver}: ${d.description} (฿${d.amount})`).join(' | ') ?? 'ไม่มี'}

═══ 📅 การลา ═══
- การลาเดือนนี้: ${leaves?.length ?? 0} รายการ
- รออนุมัติ: ${leaves?.filter((l: { status?: string }) => l.status === 'Pending').length ?? 0} รายการ
- รายละเอียด: ${leaves?.slice(0, 5).map((l: { driver?: string; type?: string; from?: string; to?: string }) => `${l.driver}: ${l.type} (${l.from} - ${l.to})`).join(' | ') ?? 'ไม่มี'}

═══ 📊 Workforce ═══
${JSON.stringify(workforce ?? {})}

═══ 📌 แนวทางตอบคำถาม ═══
- ตอบเป็นภาษาไทยอย่างเป็นธรรมชาติ กระชับ และมืออาชีพ
- เข้าใจคำถามที่หลากหลาย เช่น "วันนี้เป็นยังไงบ้าง", "มีปัญหาอะไรมั้ย", "กำไรเดือนนี้เท่าไหร่", "รถคันไหนส่งแล้ว"
- สามารถวิเคราะห์แนวโน้ม เปรียบเทียบ หรือเสนอคำแนะนำได้
- ถ้าข้อมูลบางส่วนเป็น 0 หรือน้อยมาก ให้บอกผู้ใช้ว่าอาจยังไม่มีงานในช่วงนั้น หรือข้อมูลยังไม่ถูก update
- ถ้าถามเรื่องที่ไม่มีในฐานข้อมูล ให้บอกตรงๆ ว่าไม่มีข้อมูล
        `.trim()

        // ─────────────────────────────────────────────────────────────────
        // 3. CALL GEMINI (Direct REST - no SDK wrapper)
        // ─────────────────────────────────────────────────────────────────
        const allErrors: string[] = []

        for (const modelName of GEMINI_MODELS) {
            try {
                console.log(`[AI Chat] Trying model: ${modelName}`)
                const responseText = await callGemini(apiKey, modelName, systemPrompt, `คำถาม: ${message}`)
                console.log(`[AI Chat] Success with: ${modelName}`)
                return NextResponse.json({ response: responseText })
            } catch (err: unknown) {
                const errMsg = (err as Error).message || String(err)
                allErrors.push(`[${modelName}] ${errMsg}`)
                console.warn(`[AI Chat] ${modelName} failed: ${errMsg}`)
                continue
            }
        }

        const lastError = allErrors.join(' | ')
        console.error(`[AI Chat] All models failed: ${lastError}`)

        // ─────────────────────────────────────────────────────────────────
        // 4. SMART SAFEMODE (ไม่พึ่ง keyword เป๊ะๆ)
        // ─────────────────────────────────────────────────────────────────
        const lower = message.toLowerCase()
        const has = (...words: string[]) => words.some(w => lower.includes(w))

        // Show debug error if Gemini completely failed
        const debugNote = lastError ? `\n\n⚠️ [Debug] AI Error: ${lastError.slice(0, 120)}` : ''

        let safeResponse = `🤖 ระบบ AI หลักขัดข้องชั่วคราว แต่ยังมีข้อมูลพื้นฐานให้ครับ${debugNote}`

        if (has('งาน', 'job', 'วันนี้', 'ส่งของ', 'ขนส่ง', 'เที่ยว', 'trip', 'delivery')) {
            safeResponse = `📦 งานวันนี้รวม ${today?.total ?? 0} รายการ | กำลังวิ่ง ${today?.active ?? 0} คัน | เสร็จแล้ว ${today?.completed ?? 0} รายการ | รอ ${today?.pending ?? 0} รายการ`
        } else if (has('รายได้', 'กำไร', 'เงิน', 'revenue', 'profit', 'การเงิน', 'ยอด', 'ราคา')) {
            safeResponse = `💰 รายได้เดือนนี้: ฿${fin?.revenue?.toLocaleString() ?? 0} | กำไร: ฿${fin?.netProfit?.toLocaleString() ?? 0} | Margin: ${fin?.margin?.toFixed(1) ?? 0}%`
        } else if (has('คนขับ', 'driver', 'พนักงาน', 'คน', 'ขับ')) {
            safeResponse = `👨‍✈️ คนขับ ${drivers?.length ?? 0} คน | Active: ${drivers?.filter((d: { status?: string }) => d.status === 'Active').length ?? 0} คน`
        } else if (has('รถ', 'vehicle', 'ยานพาหนะ', 'ทะเบียน', 'fleet')) {
            safeResponse = `🚛 รถทั้งหมด ${vehicles?.length ?? 0} คัน | Active: ${vehicles?.filter((v: { status?: string }) => v.status === 'Active').length ?? 0} คัน`
        } else if (has('ซ่อม', 'maintenance', 'บำรุง', 'repair')) {
            safeResponse = `🔧 รอซ่อม ${repairs?.length ?? 0} รายการ`
        } else if (has('น้ำมัน', 'fuel', 'เติม')) {
            safeResponse = `⛽ ค่าน้ำมันรวม: ฿${fuel?.totalFuelCost?.toLocaleString() ?? 0} | ${fuel?.totalLiters?.toLocaleString() ?? 0} ลิตร`
        } else if (has('ลา', 'leave', 'หยุด', 'วันหยุด')) {
            safeResponse = `📅 การลา ${leaves?.length ?? 0} รายการ | รออนุมัติ ${leaves?.filter((l: { status?: string }) => l.status === 'Pending').length ?? 0} รายการ`
        } else if (has('เสียหาย', 'damage', 'แตก', 'หัก', 'สินค้า')) {
            safeResponse = `💥 รายงานเสียหาย ${damage?.length ?? 0} รายการ | รอตรวจสอบ ${damage?.filter((d: { status?: string }) => d.status === 'Pending').length ?? 0} รายการ`
        } else if (has('ลูกค้า', 'customer', 'บริษัท', 'ลูกค้า')) {
            safeResponse = `👥 ลูกค้าในระบบ ${custList?.length ?? 0} ราย`
        } else if (has('billing', 'บิล', 'ใบวางบิล', 'invoice', 'ชำระ')) {
            safeResponse = `📋 ใบวางบิล ${bill?.total ?? 0} ใบ | รอชำระ ${bill?.pending ?? 0} ใบ (฿${bill?.pendingAmount?.toLocaleString() ?? 0}) | ชำระแล้ว ${bill?.paid ?? 0} ใบ`
        } else if (has('สรุป', 'ภาพรวม', 'summary', 'report', 'ทั้งหมด', 'overview')) {
            safeResponse = `📊 สรุปวันนี้: งาน ${today?.total ?? 0} รายการ | รายได้ ฿${fin?.revenue?.toLocaleString() ?? 0} | รถ ${vehicles?.length ?? 0} คัน | คนขับ ${drivers?.length ?? 0} คน | รอซ่อม ${repairs?.length ?? 0} คัน`
        }

        return NextResponse.json({ response: `[SafeMode] ${safeResponse}` })

    } catch (error: unknown) {
        console.error('[AI Chat] Critical Error:', error)
        return NextResponse.json({
            response: `ระบบ AI ขัดข้อง: [${error instanceof Error ? error.message : String(error)}]`
        })
    }
}
