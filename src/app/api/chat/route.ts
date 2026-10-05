import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createAdminClient } from '@/utils/supabase/server'
import { aiToolExecutors, buildPendingAction, executeWriteTool, writeToolDeclarations } from '@/lib/ai/tools'
import { undoLastAction } from '@/lib/ai/audit-log'
import { getUserBranchId } from '@/lib/permissions'
import {
    REVENUE_STATUSES,
    getThaiNow,
    getThaiMonthBoundaries,
    formatDateSafe,
} from '@/lib/supabase/analytics-helpers'
import { embedGemini } from '@/lib/ai/embeddings'
import { getOpsSummary, getRevenueSummary, getOverdueDeliveries, getLossMakingJobs, getDailyTrend, type PeriodKey } from '@/lib/ai/metrics'
import { TMS_SCHEMA_PROMPT } from '@/lib/ai/schema-context'

// Gemini models to try in order. First the latest, then verified-stable fallbacks
// so the assistant keeps working even if a preview model is renamed/retired.
const GEMINI_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3.1-pro-preview",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
]

// LLM provider is env-switchable. Default 'gemini' so cloud/Vercel is unchanged.
// Set LLM_PROVIDER=ollama (with the app running where it can reach OLLAMA_BASE_URL)
// to keep the answering model — and the data it sees — fully local.
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'gemini').toLowerCase()
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b'

type ChatMsg = { role: 'user' | 'bot' | 'model' | 'assistant', content: string }

// ─────────────────────────────────────────────────────────────────
// Gemini streaming call (SSE). Returns the raw Response so the caller
// can fall through to the next model on an HTTP error BEFORE piping.
// ─────────────────────────────────────────────────────────────────
// Function declaration exposed to Gemini so users can create jobs by chatting.
const CREATE_JOB_DECLARATION = {
    name: 'create_job',
    description: 'สร้างงานขนส่งใหม่ในระบบ ใช้เมื่อผู้ใช้สั่งให้สร้าง/เพิ่ม/เปิดงานใหม่ เช่น "สร้างงานให้ลูกค้า X พรุ่งนี้ไปรังสิต ราคา 2000"',
    parameters: {
        type: 'object',
        properties: {
            customerName: { type: 'string', description: 'ชื่อลูกค้า (จำเป็น)' },
            planDate: { type: 'string', description: 'วันวางแผน รูปแบบ YYYY-MM-DD เว้นว่าง=วันนี้' },
            deliveryDate: { type: 'string', description: 'วันจัดส่ง รูปแบบ YYYY-MM-DD' },
            origin: { type: 'string', description: 'สถานที่ต้นทาง' },
            destination: { type: 'string', description: 'สถานที่ปลายทาง' },
            routeName: { type: 'string', description: 'ชื่อเส้นทาง (ถ้ามี)' },
            price: { type: 'number', description: 'ราคาลูกค้า (บาท)' },
            vehicleType: { type: 'string', description: 'ประเภทรถ เช่น 4-Wheel, 6-Wheel' },
            driverName: { type: 'string', description: 'ชื่อคนขับที่จะมอบหมาย (ถ้ามีจะตั้งสถานะ Assigned และดึงทะเบียนรถของคนขับมาให้)' },
            vehiclePlate: { type: 'string', description: 'ทะเบียนรถ เช่น บบ6522' },
            notes: { type: 'string', description: 'หมายเหตุ' },
        },
        required: ['customerName'],
    },
}

const METRIC_QUERY_DECLARATION = {
    name: 'query_metrics',
    description: 'ดึงตัวเลขสรุปเชิงธุรกิจตามช่วงเวลาที่ผู้ใช้ถาม (งาน/รายได้/กำไร/งานค้างส่ง/วินัยคนขับ) เรียกเมื่อคำถามต้องการตัวเลขของช่วงเวลาหรือลูกค้าที่เจาะจง หรือประเมินวินัยคนขับ',
    parameters: {
        type: 'object',
        properties: {
            metric: { type: 'string', enum: ['ops', 'revenue', 'overdue', 'loss', 'trend', 'discipline'], description: 'ops=จำนวนงานตามสถานะ(รวม), revenue=รายได้/กำไร, overdue=งานค้างส่งเลยกำหนด, loss=งานที่ขาดทุน, trend=งานรายวัน(แยกแต่ละวัน ใช้เมื่อถาม "รายวัน/แต่ละวัน/ย้อนหลังกี่วัน"), discipline=วินัยการใช้แอปคนขับ(จัดอันดับ, คะแนนวินัย %, กดงานรวดเดียว, งานค้างส่ง, ePOD)' },
            period: { type: 'string', enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_7_days', 'last_30_days'], description: 'ช่วงเวลา (ไม่ต้องใส่สำหรับ overdue)' },
            from: { type: 'string', description: 'วันเริ่ม YYYY-MM-DD (ถ้าถามช่วงกำหนดเอง)' },
            to: { type: 'string', description: 'วันสิ้นสุด YYYY-MM-DD (ถ้าถามช่วงกำหนดเอง)' },
            groupBy: { type: 'string', enum: ['customer', 'branch'], description: 'แยกรายได้ตามลูกค้า/สาขา (ใช้กับ revenue)' },
        },
        required: ['metric'],
    },
}

async function callGeminiStream(
    apiKey: string,
    model: string,
    systemPrompt: string,
    history: ChatMsg[],
    userMessage: string,
    enableTools = false,
): Promise<Response> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`

    // Map prior turns to Gemini "contents". Gemini roles are 'user' | 'model'.
    const contents = history
        .filter(m => m && typeof m.content === 'string' && m.content.trim())
        .slice(-8) // keep last 8 turns for context without blowing the token budget
        .map(m => ({
            role: (m.role === 'user') ? 'user' : 'model',
            parts: [{ text: m.content }],
        }))

    contents.push({ role: 'user', parts: [{ text: userMessage }] })

    const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    }
    if (enableTools) {
        body.tools = [{ functionDeclarations: [CREATE_JOB_DECLARATION, ...writeToolDeclarations] }]
    }

    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    })
}

type SSEEvent =
    | { type: 'text'; text: string }
    | { type: 'call'; name: string; args: Record<string, unknown> }

// Parse Gemini SSE body into a stream of events (text chunks or function
// calls) — shared by the streaming and non-streaming response paths.
async function* parseGeminiSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            try {
                const json = JSON.parse(payload)
                const parts = json?.candidates?.[0]?.content?.parts
                if (!Array.isArray(parts)) continue
                for (const part of parts) {
                    if (part?.functionCall?.name) {
                        yield { type: 'call', name: part.functionCall.name, args: part.functionCall.args || {} }
                    } else if (part?.text) {
                        yield { type: 'text', text: part.text }
                    }
                }
            } catch { /* partial JSON, ignore */ }
        }
    }
}

// ─────────────────────────────────────────────────────────────────
// Helper: fetch data with silent error handling
// ─────────────────────────────────────────────────────────────────
const safe = <T,>(result: PromiseSettledResult<T>): T | null =>
    result.status === 'fulfilled' ? result.value : null

const isRevenueStatus = (s?: string | null) => REVENUE_STATUSES.includes(String(s ?? '').trim())

// ─────────────────────────────────────────────────────────────────
// Helper: Fetch financials directly from DB (bypass fragile RPC)
// Uses shared REVENUE_STATUSES (includes Verified/Billed/Paid) + Thai month.
// ─────────────────────────────────────────────────────────────────
async function getFinancialDirect(branchId?: string) {
    try {
        const supabase = await createAdminClient()
        const { start, end } = getThaiMonthBoundaries()
        const firstDay = formatDateSafe(start)!
        const lastDay = formatDateSafe(end)!

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

        const revenueJobs = data.filter((j: { Job_Status?: string | null }) => isRevenueStatus(j.Job_Status))

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
// Helper: Fetch today's jobs directly (Thai timezone)
// ─────────────────────────────────────────────────────────────────
async function getTodayDirect(branchId?: string) {
    try {
        const supabase = await createAdminClient()
        const today = formatDateSafe(getThaiNow())!

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
        const completed = data.filter((j: { Job_Status?: string | null }) => isRevenueStatus(j.Job_Status)).length
        const pending = data.filter((j: { Job_Status?: string | null }) => ['New', 'Pending', 'Requested', 'Draft'].includes(j.Job_Status || '')).length
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
// Helper: Fetch billing/invoice summary
// ─────────────────────────────────────────────────────────────────
async function getBillingSummary() {
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

// ─────────────────────────────────────────────────────────────────
// Knowledge base with a short in-memory cache (per branch, 45s TTL)
// so we don't hammer the DB with ~14 queries on every single message.
// ─────────────────────────────────────────────────────────────────
type KnowledgeBase = Awaited<ReturnType<typeof buildKnowledgeBase>>
const kbCache = new Map<string, { at: number, data: KnowledgeBase }>()
const KB_TTL_MS = 45_000

async function buildKnowledgeBase(branchId?: string) {
    const [
        todayData, financialData, allDrivers, allVehicles, maintenanceStats,
        pendingRepairs, fuelAnalytics, fleetHealth, damageReports, driverLeaves,
        customers, billing, workforceAnalytics,
        opsWeek, opsMonth, revMonth, revLastMonth, overdue,
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
        getBillingSummary(),
        aiToolExecutors.get_workforce_analytics(),
        // Deterministic metrics layer (authoritative numbers + provenance)
        getOpsSummary('this_week', branchId),
        getOpsSummary('this_month', branchId),
        getRevenueSummary('this_month', branchId, 'customer'),
        getRevenueSummary('last_month', branchId),
        getOverdueDeliveries(branchId),
    ])

    return {
        today: safe(todayData),
        fin: safe(financialData),
        drivers: safe(allDrivers) as { id?: string; name?: string; status?: string }[] | null,
        vehicles: safe(allVehicles) as { plate?: string; type?: string; status?: string }[] | null,
        maintStats: safe(maintenanceStats),
        repairs: safe(pendingRepairs) as { vehicle?: string; problem?: string; status?: string }[] | null,
        fuel: safe(fuelAnalytics) as { totalFuelCost?: number; totalLiters?: number; avgPerTrip?: number } | null,
        health: safe(fleetHealth) as { severity?: string; vehicle?: string; alert?: string }[] | null,
        damage: safe(damageReports) as { driver?: string; description?: string; amount?: number; status?: string }[] | null,
        leaves: safe(driverLeaves) as { driver?: string; type?: string; from?: string; to?: string; status?: string }[] | null,
        custList: safe(customers) as { id?: string; Customer_ID?: string; name?: string; Customer_Name?: string }[] | null,
        bill: safe(billing),
        workforce: safe(workforceAnalytics),
        metrics: {
            opsWeek: safe(opsWeek),
            opsMonth: safe(opsMonth),
            revMonth: safe(revMonth),
            revLastMonth: safe(revLastMonth),
            overdue: safe(overdue),
        },
    }
}

async function getKnowledgeBase(branchId?: string): Promise<KnowledgeBase> {
    const key = branchId || 'All'
    const cached = kbCache.get(key)
    if (cached && Date.now() - cached.at < KB_TTL_MS) return cached.data
    const data = await buildKnowledgeBase(branchId)
    kbCache.set(key, { at: Date.now(), data })
    return data
}

// ─────────────────────────────────────────────────────────────────
// RAG: embed the user's question (Gemini) and pull semantically-similar
// customers/locations. Degrades silently if the table/RPC isn't set up
// yet or nothing is indexed.
// ─────────────────────────────────────────────────────────────────
async function getRagContext(message: string, branchId?: string): Promise<string> {
    try {
        const queryEmbedding = await embedGemini(message)
        const supabase = await createAdminClient()
        const { data, error } = await supabase.rpc('match_ai_embeddings_gemini', {
            query_embedding: queryEmbedding,
            match_count: 6,
            filter_branch: branchId ?? null,
            filter_type: null,
        })
        if (error || !Array.isArray(data) || data.length === 0) return ''
        const lines = (data as { content: string; similarity: number }[])
            .filter(r => r.similarity > 0.5)
            .map(r => `  • ${r.content}`)
        if (lines.length === 0) return ''
        return `\n\n═══ 🔎 ข้อมูลที่เกี่ยวข้องกับคำถาม (semantic search) ═══\n${lines.join('\n')}`
    } catch {
        return ''
    }
}

// ─────────────────────────────────────────────────────────────────
// Metric planner: a fast, tool-only Gemini pass that decides whether the
// question needs a specific metric/period and, if so, runs the deterministic
// metrics-layer function and returns a ready-to-cite Thai block. Degrades to
// '' on any error, so the pre-computed snapshot still covers common asks.
// ─────────────────────────────────────────────────────────────────
const METRIC_INTENT = /(รายได้|กำไร|ยอด|ต้นทุน|งาน|ค้างส่ง|เลยกำหนด|สรุป|กี่|จำนวน|เท่าไหร่|สัปดาห์|เดือน|วันนี้|เมื่อวาน|รายวัน|แต่ละวัน|ย้อนหลัง|ลูกค้า|revenue|profit|จ่าย|ออเดอร์|วินัย|วินัยการใช้แอป|กดงานรวดเดียว|ปิดงานข้ามคืน|ePOD|discipline)/i
const _money = (v: unknown) => `฿${(Number(v) || 0).toLocaleString()}`

// A visual the chat UI renders below the text answer. Data is deterministic
// (straight from the metrics layer), so the chart never lies.
export type VizSpec =
    | { kind: 'bar'; title: string; items: { label: string; value: number }[]; unit?: string }
    | { kind: 'table'; title: string; columns: string[]; rows: (string | number)[][] }

// Run one metric the planner asked for → citable Thai line + optional visual.
async function runOneMetric(a: Record<string, unknown>, branchId?: string): Promise<{ text: string; viz?: VizSpec }> {
    const period = (a.from && a.to) ? { from: String(a.from), to: String(a.to) } : ((a.period as PeriodKey) || 'this_month')
    if (a.metric === 'discipline') {
        const supabase = await createAdminClient()
        let query = supabase.from('Master_Drivers').select('Driver_ID, Driver_Name').eq('Active_Status', 'Active')
        if (branchId && branchId !== 'All') {
            query = query.eq('Branch_ID', branchId)
        }
        const { data: drivers } = await query.limit(20)
        const { calculateDriverAppDiscipline } = await import('@/services/app-discipline')
        const results = []
        for (const d of drivers || []) {
            const disc = await calculateDriverAppDiscipline(d.Driver_ID, 30)
            if (disc.totalEvaluatedJobs > 0) {
                results.push({
                    name: d.Driver_Name || d.Driver_ID,
                    ...disc
                })
            }
        }
        results.sort((a, b) => b.score - a.score)
        const topText = results.slice(0, 5).map((r, idx) => 
            `${idx + 1}. **${r.name}**: วินัย ${r.score}% (เกรด ${r.grade}) | กดตามจุดจริง ${r.realtimeFlowRate}% | ปิดงานวันต่อวัน ${r.zeroHangingRate}% | ePOD ครบ ${r.proofCompletenessRate}%`
        ).join('\n')
        return {
            text: `📱 วินัยการใช้งานแอปของคนขับ (ประเมิน 30 วันล่าสุด, ${branchId || 'ทุกสาขา'}):\n${topText || 'ยังไม่มีข้อมูลงานในรอบประเมิน'}`,
            viz: results.length ? {
                kind: 'table',
                title: `อันดับวินัยการใช้แอป & ePOD (30 วันล่าสุด)`,
                columns: ['อันดับ', 'ชื่อคนขับ', 'คะแนนวินัย', 'เกรด', 'กดตามจุดจริง', 'งานค้างข้ามคืน', 'ePOD ครบ'],
                rows: results.map((r, idx) => [
                    idx + 1,
                    r.name,
                    `${r.score}%`,
                    r.grade,
                    `${r.realtimeFlowRate}%`,
                    `${r.hangingJobsCount} งาน`,
                    `${r.proofCompletenessRate}%`
                ])
            } : undefined
        }
    }
    if (a.metric === 'ops') {
        const r = await getOpsSummary(period, branchId)
        return {
            text: `📦 งาน (${r._provenance.period.label}, ${r._provenance.branch}): ทั้งหมด ${r.total} | วิ่งอยู่ ${r.active} | เสร็จ ${r.completed} | รอ ${r.pending} | ยกเลิก ${r.cancelled}`,
            viz: { kind: 'bar', title: `งานตามสถานะ (${r._provenance.period.label})`, unit: 'งาน', items: [
                { label: 'วิ่งอยู่', value: r.active }, { label: 'เสร็จ', value: r.completed },
                { label: 'รอ', value: r.pending }, { label: 'ยกเลิก', value: r.cancelled },
            ] },
        }
    }
    if (a.metric === 'revenue') {
        const r = await getRevenueSummary(period, branchId, a.groupBy as 'customer' | 'branch' | undefined)
        const hasBreak = 'breakdown' in r && r.breakdown?.length
        const extra = hasBreak ? '\n  แยกตาม' + (r.topBy === 'branch' ? 'สาขา' : 'ลูกค้า') + ': ' +
            r.breakdown!.slice(0, 8).map(b => `${b.key} ${_money(b.revenue)} (${b.jobs})`).join(' · ') : ''
        const viz: VizSpec = hasBreak
            ? { kind: 'bar', title: `รายได้ตาม${r.topBy === 'branch' ? 'สาขา' : 'ลูกค้า'} (${r._provenance.period.label})`, unit: '฿', items: r.breakdown!.slice(0, 8).map(b => ({ label: b.key, value: b.revenue })) }
            : { kind: 'table', title: `การเงิน (${r._provenance.period.label})`, columns: ['รายการ', 'จำนวน'], rows: [['รายได้', _money(r.revenue)], ['ต้นทุน', _money(r.cost)], ['กำไร', _money(r.netProfit)], ['อัตรากำไร', `${r.margin.toFixed(1)}%`], ['จำนวนงาน', r.jobCount]] }
        return { text: `💰 การเงิน (${r._provenance.period.label}, ${r._provenance.branch}): รายได้ ${_money(r.revenue)} | ต้นทุน ${_money(r.cost)} | กำไร ${_money(r.netProfit)} (${r.margin.toFixed(1)}%) | นับ ${r.jobCount} งาน${extra}`, viz }
    }
    if (a.metric === 'overdue') {
        const r = await getOverdueDeliveries(branchId)
        const sample = (r.sample || []).slice(0, 8).map(s => `${s.jobId}(${s.customer}, กำหนด ${s.dueDate})`).join(', ')
        return {
            text: `⏰ งานค้างส่งเลยกำหนด (${r._provenance.branch}): ${r.count} รายการ${sample ? ' — ' + sample : ''}`,
            viz: r.count ? { kind: 'table', title: `งานค้างส่งเลยกำหนด (${r.count} รายการ)`, columns: ['รหัสงาน', 'ลูกค้า', 'กำหนดส่ง', 'สถานะ'], rows: (r.sample || []).map(s => [s.jobId || '-', s.customer || '-', s.dueDate || '-', s.status || '-']) } : undefined,
        }
    }
    if (a.metric === 'trend') {
        const r = await getDailyTrend(period, branchId)
        const days = r.days.slice(-45) // bound context/chart size for very long ranges
        // Full per-day detail so the assistant can list every day in the range
        // (not just the fixed 7-day snapshot).
        const daily = days.map(d => `  ${d.date}: ${d.total} งาน (เสร็จ ${d.completed}, ${_money(d.revenue)})`).join('\n')
        return {
            text: `📈 งานรายวัน (${r._provenance.period.label}, ${r._provenance.branch}): ${r.days.length} วัน รวม ${r.totalJobs} งาน\n${daily}`,
            viz: r.days.length ? { kind: 'bar', title: `งานรายวัน (${r._provenance.period.label})`, unit: 'งาน', items: days.map(d => ({ label: d.date.slice(5), value: d.total })) } : undefined,
        }
    }
    if (a.metric === 'loss') {
        const r = await getLossMakingJobs(period, branchId)
        const sample = (r.sample || []).slice(0, 8).map(s => `${s.jobId}(${s.customer}, ขาดทุน ${_money(s.loss)}: ราคา ${_money(s.price)} < ต้นทุน ${_money(s.cost)})`).join(', ')
        return {
            text: `📉 งานขาดทุน (${r._provenance.period.label}, ${r._provenance.branch}): ${r.count} งาน รวมขาดทุน ${_money(r.totalLoss)}${sample ? ' — ' + sample : ''}`,
            viz: r.count ? { kind: 'table', title: `งานขาดทุน (${r._provenance.period.label}) — รวม ${_money(r.totalLoss)}`, columns: ['รหัสงาน', 'ลูกค้า', 'ราคา', 'ต้นทุน', 'ขาดทุน'], rows: (r.sample || []).map(s => [s.jobId || '-', s.customer || '-', _money(s.price), _money(s.cost), _money(s.loss)]) } : undefined,
        }
    }
    return { text: '' }
}

async function runMetricPlanner(apiKey: string, message: string, branchId?: string): Promise<{ text: string; viz: VizSpec[] }> {
    const empty = { text: '', viz: [] as VizSpec[] }
    if (!apiKey || !METRIC_INTENT.test(message)) return empty
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: `วันนี้คือ ${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })} (โซนเวลาไทย). ถ้าคำถามต้องใช้ตัวเลขสรุป (งาน/รายได้/กำไร/งานค้างส่ง) ให้เรียก query_metrics โดยเลือก metric และช่วงเวลาที่ตรงคำถาม. ถ้าช่วงเวลาไม่ตรงกับ period ที่กำหนด (เช่น "15 วันที่ผ่านมา", "ตั้งแต่วันที่ 1", "3 เดือนก่อน") ให้คำนวณและส่ง from/to เป็น YYYY-MM-DD แทน period. ถ้าคำถามพูดถึงหลายอย่าง เช่น "รายได้และจำนวนงาน" ให้เรียกหลายครั้ง. ถ้าไม่ต้องใช้ตัวเลขไม่ต้องเรียกเครื่องมือ` }] },
                contents: [{ role: 'user', parts: [{ text: message }] }],
                tools: [{ functionDeclarations: [METRIC_QUERY_DECLARATION] }],
                // Force a tool call: the METRIC_INTENT regex already gated this to
                // number-ish questions, so AUTO sometimes skipping the call just
                // loses data. ANY guarantees the metric is fetched.
                toolConfig: { functionCallingConfig: { mode: 'ANY' } },
                generationConfig: { temperature: 0 },
            }),
            signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) return empty
        const data = await res.json()
        const parts = data?.candidates?.[0]?.content?.parts || []
        const calls = parts
            .map((p: { functionCall?: { name?: string; args?: Record<string, unknown> } }) => p.functionCall)
            .filter((c: { name?: string } | undefined): c is { name: string; args?: Record<string, unknown> } => c?.name === 'query_metrics')
        if (calls.length === 0) return empty

        // De-dupe identical calls, cap at 4 to bound latency.
        const seen = new Set<string>()
        const lines: string[] = []
        const viz: VizSpec[] = []
        for (const c of calls.slice(0, 4)) {
            const key = JSON.stringify(c.args || {})
            if (seen.has(key)) continue
            seen.add(key)
            const r = await runOneMetric(c.args || {}, branchId)
            if (r.text) lines.push(r.text)
            if (r.viz) viz.push(r.viz)
        }
        if (lines.length === 0) return empty
        return { text: `\n\n═══ 🔎 ตัวเลขที่ดึงตามคำถามนี้ (ใช้ตามนี้ ห้ามคำนวณเอง) ═══\n${lines.join('\n')}`, viz }
    } catch {
        return empty
    }
}

function buildSystemPrompt(kb: KnowledgeBase, username: string, branchId?: string, ragContext = ''): string {
    const { today, fin, drivers, vehicles, maintStats, repairs, fuel, health, damage, leaves, custList, bill, workforce, metrics } = kb
    const m = metrics as KnowledgeBase['metrics'] | undefined
    const money = (v: unknown) => `฿${(Number(v) || 0).toLocaleString()}`
    const ow = m?.opsWeek, om = m?.opsMonth, rm = m?.revMonth, rl = m?.revLastMonth, od = m?.overdue
    const topCust = (rm && 'breakdown' in rm ? rm.breakdown : [])?.slice(0, 5)
        .map((b: { key: string; revenue: number; jobs: number }) => `${b.key} ${money(b.revenue)} (${b.jobs} งาน)`).join(' · ') || '—'
    const now = getThaiNow().toLocaleDateString('th-TH', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    })

    return `
คุณคือ "DRouteMind AI" ผู้ช่วยอัจฉริยะของระบบบริหารการขนส่ง สามารถตอบคำถามได้อย่างยืดหยุ่น ไม่จำเป็นต้องพิมพ์คำถามเป๊ะๆ
วันที่และเวลาปัจจุบัน: ${now}
ผู้ใช้งาน: ${username || 'Admin'} | สาขา: ${branchId || 'ทุกสาขา'}

═══ 📊 ตัวเลขสรุป (คำนวณจากฐานข้อมูลแล้ว — ใช้ค่าตามนี้เท่านั้น ห้ามคำนวณเอง) ═══
[สัปดาห์นี้] งาน ${ow?.total ?? '—'} | วิ่งอยู่ ${ow?.active ?? 0} | เสร็จ ${ow?.completed ?? 0} | รอ ${ow?.pending ?? 0} | ยกเลิก ${ow?.cancelled ?? 0}
[เดือนนี้] งาน ${om?.total ?? '—'} | เสร็จ ${om?.completed ?? 0} | รายได้ ${money(rm?.revenue)} | ต้นทุน ${money(rm?.cost)} | กำไร ${money(rm?.netProfit)} (${(rm?.margin ?? 0).toFixed(1)}%)
[เดือนที่แล้ว] รายได้ ${money(rl?.revenue)} | กำไร ${money(rl?.netProfit)} (${(rl?.margin ?? 0).toFixed(1)}%)
[Top ลูกค้าเดือนนี้] ${topCust}
[งานค้างส่ง (เลยกำหนด)] ${od?.count ?? 0} รายการ${od?.count ? ' — เช่น ' + (od.sample || []).slice(0, 3).map((s: { jobId?: string; customer?: string; dueDate?: string }) => `${s.jobId}(${s.customer}, กำหนด ${s.dueDate})`).join(', ') : ''}
※ ทุกตัวเลขคิดตามวันนัดงาน (Plan_Date) โซนเวลาไทย; รายได้นับเฉพาะงานสถานะ Completed/Delivered/Verified/Billed/Paid

═══ 📦 งานวันนี้ ═══
- จำนวนงานทั้งหมดวันนี้: ${today?.total ?? 'ไม่มีข้อมูล'} รายการ
- กำลังดำเนินการ / วิ่งอยู่: ${today?.active ?? 0} คัน
- เสร็จสิ้นแล้ว: ${today?.completed ?? 0} รายการ
- รอดำเนินการ: ${today?.pending ?? 0} รายการ
- SOS/ฉุกเฉิน: ${today?.sos ?? 0} คัน
- รายการงานวันนี้: ${JSON.stringify(today?.jobs ?? [])}

═══ 💰 การเงินเดือนนี้ (นับงานสถานะ Completed/Delivered/Verified/Billed/Paid) ═══
- รายได้จากงานที่ส่ง/ยืนยันแล้ว: ฿${fin?.revenue?.toLocaleString() ?? 'ไม่มีข้อมูล'}
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
- รายชื่อลูกค้า (สูงสุด 15 ราย): ${custList?.slice(0, 15).map((c) => `${c.name || c.Customer_Name} (${c.id || c.Customer_ID})`).join(', ') ?? 'ไม่มีข้อมูล'}

═══ 👨‍✈️ คนขับ ═══
- จำนวนคนขับทั้งหมด: ${drivers?.length ?? 0} คน
- Active: ${drivers?.filter((d) => d.status === 'Active').length ?? 0} คน
- รายชื่อ (10 คนแรก): ${drivers?.slice(0, 10).map((d) => `${d.name} (${d.id}) - ${d.status}`).join(', ') ?? 'ไม่มีข้อมูล'}

═══ 🚛 ยานพาหนะ ═══
- จำนวนรถทั้งหมด: ${vehicles?.length ?? 0} คัน
- Active: ${vehicles?.filter((v) => v.status === 'Active').length ?? 0} คัน
- ทะเบียน (10 คันแรก): ${vehicles?.slice(0, 10).map((v) => `${v.plate} (${v.type || '-'})`).join(', ') ?? 'ไม่มีข้อมูล'}

═══ 🔧 ซ่อมบำรุง ═══
- สรุปภาพรวม: ${JSON.stringify(maintStats ?? {})}
- รอซ่อม: ${repairs?.length ?? 0} รายการ
- รายการซ่อม: ${repairs?.slice(0, 5).map((r) => `${r.vehicle}: ${r.problem} (${r.status})`).join(' | ') ?? 'ไม่มีรายการซ่อม'}

═══ ⛽ น้ำมัน ═══
- ค่าน้ำมันรวม: ฿${fuel?.totalFuelCost?.toLocaleString() ?? 'ไม่มีข้อมูล'}
- ปริมาณน้ำมัน: ${fuel?.totalLiters?.toLocaleString() ?? 0} ลิตร
- เฉลี่ยต่อเที่ยว: ${fuel?.avgPerTrip?.toFixed(1) ?? 0} ลิตร

═══ 🚨 Fleet Health ═══
- แจ้งเตือน: ${health?.length ?? 0} รายการ
- รายละเอียด: ${health?.slice(0, 3).map((h) => `[${h.severity}] ${h.vehicle}: ${h.alert}`).join(' | ') ?? 'ไม่มีการแจ้งเตือน'}

═══ 💥 สินค้าเสียหาย ═══
- รายการทั้งหมด: ${damage?.length ?? 0} รายการ
- รอตรวจสอบ: ${damage?.filter((d) => d.status === 'Pending').length ?? 0} รายการ
- รายละเอียด: ${damage?.slice(0, 3).map((d) => `${d.driver}: ${d.description} (฿${d.amount})`).join(' | ') ?? 'ไม่มี'}

═══ 📅 การลา ═══
- การลาเดือนนี้: ${leaves?.length ?? 0} รายการ
- รออนุมัติ: ${leaves?.filter((l) => l.status === 'Pending').length ?? 0} รายการ
- รายละเอียด: ${leaves?.slice(0, 5).map((l) => `${l.driver}: ${l.type} (${l.from} - ${l.to})`).join(' | ') ?? 'ไม่มี'}

═══ 📊 Workforce ═══
${JSON.stringify(workforce ?? {})}
${ragContext}

═══ 📌 แนวทางตอบคำถาม ═══
- ตอบเป็นภาษาไทยอย่างเป็นธรรมชาติ กระชับ และมืออาชีพ
- เข้าใจคำถามที่หลากหลาย เช่น "วันนี้เป็นยังไงบ้าง", "มีปัญหาอะไรมั้ย", "กำไรเดือนนี้เท่าไหร่", "รถคันไหนส่งแล้ว"
- 🔢 ตัวเลขสรุป/ยอดรวม/กำไร/จำนวนงาน ให้ยึด "ตัวเลขสรุป" ที่คำนวณมาให้ด้านบน **ห้ามบวกลบหรือประมาณเอง** ถ้าไม่มีช่วงเวลาที่ถามในบล็อกนั้น ให้บอกว่ายังไม่มีข้อมูลช่วงนั้น (อย่าเดา)
- 🧾 เมื่อรายงานตัวเลข ให้ระบุช่วงเวลาที่อ้างอิงเสมอ (เช่น "เดือนนี้", "สัปดาห์นี้") เพื่อให้ผู้ใช้ตรวจสอบได้
- สามารถวิเคราะห์แนวโน้ม เปรียบเทียบ หรือเสนอคำแนะนำได้ และอ้างอิงบทสนทนาก่อนหน้าได้
- ถ้าข้อมูลบางส่วนเป็น 0 หรือน้อยมาก ให้บอกผู้ใช้ว่าอาจยังไม่มีงานในช่วงนั้น หรือข้อมูลยังไม่ถูก update
- ถ้าถามเรื่องที่ไม่มีในฐานข้อมูล ให้บอกตรงๆ ว่าไม่มีข้อมูล

${TMS_SCHEMA_PROMPT}
    `.trim()
}

// ─────────────────────────────────────────────────────────────────
// SafeMode fallback (no keyword-perfect matching required)
// ─────────────────────────────────────────────────────────────────
function buildSafeResponse(message: string, kb: KnowledgeBase, debugNote: string): string {
    const { today, fin, drivers, vehicles, repairs, fuel, leaves, damage, custList, bill } = kb
    const lower = String(message).toLowerCase()
    const has = (...words: string[]) => words.some(w => lower.includes(w))

    let r = `🤖 ระบบ AI หลักขัดข้องชั่วคราว แต่ยังมีข้อมูลพื้นฐานให้ครับ${debugNote}`

    if (has('งาน', 'job', 'วันนี้', 'ส่งของ', 'ขนส่ง', 'เที่ยว', 'trip', 'delivery')) {
        r = `📦 งานวันนี้รวม ${today?.total ?? 0} รายการ | กำลังวิ่ง ${today?.active ?? 0} คัน | เสร็จแล้ว ${today?.completed ?? 0} รายการ | รอ ${today?.pending ?? 0} รายการ`
    } else if (has('รายได้', 'กำไร', 'เงิน', 'revenue', 'profit', 'การเงิน', 'ยอด', 'ราคา')) {
        r = `💰 รายได้เดือนนี้: ฿${fin?.revenue?.toLocaleString() ?? 0} | กำไร: ฿${fin?.netProfit?.toLocaleString() ?? 0} | Margin: ${fin?.margin?.toFixed(1) ?? 0}%`
    } else if (has('คนขับ', 'driver', 'พนักงาน', 'ขับ')) {
        r = `👨‍✈️ คนขับ ${drivers?.length ?? 0} คน | Active: ${drivers?.filter((d) => d.status === 'Active').length ?? 0} คน`
    } else if (has('รถ', 'vehicle', 'ยานพาหนะ', 'ทะเบียน', 'fleet')) {
        r = `🚛 รถทั้งหมด ${vehicles?.length ?? 0} คัน | Active: ${vehicles?.filter((v) => v.status === 'Active').length ?? 0} คัน`
    } else if (has('ซ่อม', 'maintenance', 'บำรุง', 'repair')) {
        r = `🔧 รอซ่อม ${repairs?.length ?? 0} รายการ`
    } else if (has('น้ำมัน', 'fuel', 'เติม')) {
        r = `⛽ ค่าน้ำมันรวม: ฿${fuel?.totalFuelCost?.toLocaleString() ?? 0} | ${fuel?.totalLiters?.toLocaleString() ?? 0} ลิตร`
    } else if (has('ลา', 'leave', 'หยุด', 'วันหยุด')) {
        r = `📅 การลา ${leaves?.length ?? 0} รายการ | รออนุมัติ ${leaves?.filter((l) => l.status === 'Pending').length ?? 0} รายการ`
    } else if (has('เสียหาย', 'damage', 'แตก', 'หัก', 'สินค้า')) {
        r = `💥 รายงานเสียหาย ${damage?.length ?? 0} รายการ | รอตรวจสอบ ${damage?.filter((d) => d.status === 'Pending').length ?? 0} รายการ`
    } else if (has('ลูกค้า', 'customer', 'บริษัท')) {
        r = `👥 ลูกค้าในระบบ ${custList?.length ?? 0} ราย`
    } else if (has('billing', 'บิล', 'ใบวางบิล', 'invoice', 'ชำระ')) {
        r = `📋 ใบวางบิล ${bill?.total ?? 0} ใบ | รอชำระ ${bill?.pending ?? 0} ใบ (฿${bill?.pendingAmount?.toLocaleString() ?? 0}) | ชำระแล้ว ${bill?.paid ?? 0} ใบ`
    } else if (has('สรุป', 'ภาพรวม', 'summary', 'report', 'ทั้งหมด', 'overview')) {
        r = `📊 สรุปวันนี้: งาน ${today?.total ?? 0} รายการ | รายได้ ฿${fin?.revenue?.toLocaleString() ?? 0} | รถ ${vehicles?.length ?? 0} คัน | คนขับ ${drivers?.length ?? 0} คน | รอซ่อม ${repairs?.length ?? 0} คัน`
    }
    return `[SafeMode] ${r}`
}

// Prefix marking a pending action payload inside the plain-text stream, so the
// chat UI can render a confirm card instead of a normal reply.
const ACTION_SENTINEL = '@@ACTION@@'
// Marks a deterministic visual payload (charts/tables) appended after the text.
const VIZ_SENTINEL = '@@VIZ@@'

// ─────────────────────────────────────────────────────────────────
// Local LLM (Ollama) answer path. Streams a plain-text reply from a local
// model and appends the same @@VIZ@@ visuals. No function-calling here, so
// create_job via chat stays on the Gemini path. Falls back to SafeMode text
// if Ollama is unreachable.
// ─────────────────────────────────────────────────────────────────
async function answerWithOllama(
    systemPrompt: string, history: ChatMsg[], userTurn: string,
    wantStream: boolean, metricViz: VizSpec[], kb: KnowledgeBase, message: string,
): Promise<Response> {
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.filter(m => m?.content?.trim()).slice(-8).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
        })),
        { role: 'user', content: userTurn },
    ]
    let res: Response
    try {
        res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: wantStream }),
            signal: AbortSignal.timeout(120000),
        })
    } catch (e) {
        return NextResponse.json({ response: buildSafeResponse(message, kb, `\n\n⚠️ ต่อ Ollama ไม่ได้ (${OLLAMA_BASE_URL}): ${(e as Error).message}`) })
    }
    if (!res.ok || !res.body) {
        return NextResponse.json({ response: buildSafeResponse(message, kb, `\n\n⚠️ Ollama HTTP ${res.status}`) })
    }

    // Non-streaming (LINE webhook etc.): accumulate the NDJSON content.
    if (!wantStream) {
        const raw = await res.text()
        let full = ''
        for (const line of raw.split('\n')) {
            const t = line.trim(); if (!t) continue
            try { full += JSON.parse(t)?.message?.content || '' } catch { /* skip */ }
        }
        return NextResponse.json({ response: full || buildSafeResponse(message, kb, '') })
    }

    // Streaming: Ollama emits NDJSON {message:{content}} lines → plain text.
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const reader = res.body!.getReader()
            const decoder = new TextDecoder()
            let buf = '', emitted = false
            try {
                for (;;) {
                    const { done, value } = await reader.read()
                    if (done) break
                    buf += decoder.decode(value, { stream: true })
                    let nl: number
                    while ((nl = buf.indexOf('\n')) >= 0) {
                        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
                        if (!line) continue
                        try {
                            const t = JSON.parse(line)?.message?.content
                            if (t) { controller.enqueue(encoder.encode(t)); emitted = true }
                        } catch { /* partial line */ }
                    }
                }
                if (!emitted) controller.enqueue(encoder.encode(buildSafeResponse(message, kb, '')))
                if (metricViz.length > 0) controller.enqueue(encoder.encode(VIZ_SENTINEL + JSON.stringify(metricViz)))
            } catch {
                if (!emitted) controller.enqueue(encoder.encode(buildSafeResponse(message, kb, '')))
            } finally {
                controller.close()
            }
        },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } })
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession()
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await req.json().catch(() => ({}))
        const { message } = body
        const history: ChatMsg[] = Array.isArray(body.history) ? body.history : []
        // Streaming is opt-in: chat UIs pass stream:true; server-to-server
        // callers (LINE webhook, etc.) get plain JSON { response }.
        const wantStream = body.stream === true
        if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

        const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
        // Gemini key is required only for the cloud provider. In local (ollama)
        // mode the assistant runs without it (the planner just degrades to the
        // pre-computed metric snapshot).
        if (LLM_PROVIDER !== 'ollama' && !apiKey) {
            return NextResponse.json({ response: "AI System: ไม่พบ API Key ในการตั้งค่าระบบ" })
        }

        const userBranchId = await getUserBranchId()
        const branchId = (userBranchId && userBranchId !== 'All') ? userBranchId : undefined

        // Only admin/staff (roleId <= 5) may execute write actions.
        const canWrite = typeof session.roleId === 'number' && session.roleId <= 5

        // ── Undo the last AI-created record ───────────────────────────
        const undoWords = ['ยกเลิกรายการล่าสุด', 'ย้อนกลับล่าสุด', 'ยกเลิกล่าสุด', 'ย้อนรายการล่าสุด']
        const trimmedMsg = typeof message === 'string' ? message.trim() : ''
        if (canWrite && (undoWords.includes(trimmedMsg) || trimmedMsg.toLowerCase() === 'undo')) {
            const undo = await undoLastAction(session.username)
            return NextResponse.json({ response: undo.message })
        }

        // ── Confirmed action execution ────────────────────────────────
        // The UI calls back with { confirm: { name, args } } after the user
        // approves the pending action from a previous turn.
        const confirm = body.confirm
        if (confirm && typeof confirm.name === 'string') {
            if (!canWrite) {
                return NextResponse.json({ response: '⛔ บัญชีนี้ไม่มีสิทธิ์สร้าง/แก้ไขข้อมูลครับ' })
            }
            // Inject the admin's branch as a default when the tool didn't set one.
            const args: Record<string, unknown> = { ...(confirm.args || {}) }
            if (branchId && (args.branchId == null || args.branchId === '')) args.branchId = branchId
            const response = await executeWriteTool(confirm.name, args, session.roleId as number, {
                actor: session.username, channel: 'chat',
            })
            return NextResponse.json({ response })
        }

        // 1. Knowledge base (cached per branch for 45s) + RAG + on-demand metric
        //    query for the specific period/customer the question asks about.
        const [kb, ragContext, metricContext] = await Promise.all([
            getKnowledgeBase(branchId),
            getRagContext(message, branchId),
            runMetricPlanner(apiKey, message, branchId),
        ])
        const systemPrompt = buildSystemPrompt(kb, session.username, branchId, ragContext) + (metricContext.text || '')
        const metricViz = metricContext.viz
        const userTurn = `คำถาม: ${message}`

        // 1b. Local LLM path (keeps data on-prem) — bypasses the Gemini loop.
        if (LLM_PROVIDER === 'ollama') {
            return await answerWithOllama(systemPrompt, history, userTurn, wantStream, metricViz, kb, message)
        }

        // 2. Stream from Gemini, falling through models on HTTP errors
        const allErrors: string[] = []
        for (const modelName of GEMINI_MODELS) {
            try {
                const res = await callGeminiStream(apiKey, modelName, systemPrompt, history, userTurn, canWrite)
                if (!res.ok || !res.body) {
                    const errBody = await res.text().catch(() => '')
                    allErrors.push(`[${modelName}] HTTP ${res.status}: ${errBody.slice(0, 120)}`)
                    continue
                }

                // Build a pending-action payload from a Gemini function call
                const pendingActionText = (name: string, args: Record<string, unknown>) =>
                    ACTION_SENTINEL + JSON.stringify(buildPendingAction(name, args))

                // Non-streaming callers: accumulate full text (or action) -> JSON
                if (!wantStream) {
                    let full = ''
                    let action: { name: string; args: Record<string, unknown> } | null = null
                    try {
                        for await (const ev of parseGeminiSSE(res.body)) {
                            if (ev.type === 'call') { action = { name: ev.name, args: ev.args }; break }
                            full += ev.text
                        }
                    } catch { /* ignore */ }
                    if (action) {
                        return NextResponse.json({ pendingAction: buildPendingAction(action.name, action.args) })
                    }
                    if (!full) full = buildSafeResponse(message, kb, '')
                    return NextResponse.json({ response: full })
                }

                // Streaming callers: transform Gemini SSE -> plain text stream
                // (or emit an action sentinel the UI turns into a confirm card).
                const encoder = new TextEncoder()
                const stream = new ReadableStream<Uint8Array>({
                    async start(controller) {
                        let emitted = false
                        let actionEmitted = false
                        try {
                            for await (const ev of parseGeminiSSE(res.body!)) {
                                if (ev.type === 'call') {
                                    controller.enqueue(encoder.encode(pendingActionText(ev.name, ev.args)))
                                    emitted = true
                                    actionEmitted = true
                                    break
                                }
                                emitted = true
                                controller.enqueue(encoder.encode(ev.text))
                            }
                            if (!emitted) controller.enqueue(encoder.encode(buildSafeResponse(message, kb, '')))
                            // Append deterministic visuals (charts/tables) after the
                            // text answer, unless this turn was a confirm-action.
                            if (!actionEmitted && metricViz.length > 0) {
                                controller.enqueue(encoder.encode(VIZ_SENTINEL + JSON.stringify(metricViz)))
                            }
                        } catch {
                            if (!emitted) controller.enqueue(encoder.encode(buildSafeResponse(message, kb, '')))
                        } finally {
                            controller.close()
                        }
                    }
                })

                return new Response(stream, {
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Cache-Control': 'no-cache, no-transform',
                        'X-Accel-Buffering': 'no',
                    },
                })
            } catch (err: unknown) {
                allErrors.push(`[${modelName}] ${(err as Error).message || String(err)}`)
                continue
            }
        }

        // 3. All models failed -> SafeMode (non-streamed JSON)
        const lastError = allErrors.join(' | ')
        console.error(`[AI Chat] All models failed: ${lastError}`)
        const debugNote = lastError ? `\n\n⚠️ [Debug] AI Error: ${lastError.slice(0, 120)}` : ''
        return NextResponse.json({ response: buildSafeResponse(message, kb, debugNote) })

    } catch (error: unknown) {
        console.error('[AI Chat] Critical Error:', error)
        return NextResponse.json({
            response: `ระบบ AI ขัดข้อง: [${error instanceof Error ? error.message : String(error)}]`
        })
    }
}
