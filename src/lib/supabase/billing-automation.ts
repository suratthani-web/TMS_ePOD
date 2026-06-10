'use server'

import { createAdminClient } from "@/utils/supabase/server"
import { getNextInvoiceId } from "./invoices"
import { BillingNote } from "./billing"
import { sendBillingEmail } from "../actions/email-actions"
import { Job } from "@/types/database"

type BillingAutomationJob = Partial<Job> & {
    Customer_Name?: string
    Job_No?: string
    Billing_Status?: string
    Date?: string
    Master_Customers?: { Credit_Term_Days?: number }
}

/**
 * GENERATION PHASE (31st 23:00)
 * Automatically groups successful jobs by customer and creates billing notes.
 */
export async function generateMonthlyBillingNotes() {
    try {
        const supabase = await createAdminClient()
        
        // 1. Get all jobs that are 'Success' and NOT yet billed
        const { data: jobs, error: jobsError } = await supabase
            .from('Jobs_Main')
            .select('*')
            .eq('Job_Status', 'Success')
            .is('Billing_Note_ID', null)
        
        if (jobsError) throw jobsError
        if (!jobs || jobs.length === 0) return { success: true, count: 0, message: "No jobs to bill" }

        // 2. Group jobs by Customer_Name
        const customerGroups: Record<string, BillingAutomationJob[]> = {}
        jobs.forEach((job: BillingAutomationJob) => {
            const customer = job.Customer_Name || 'Unknown'
            if (!customerGroups[customer]) customerGroups[customer] = []
            customerGroups[customer].push(job)
        })

        const createdNotes: string[] = []
        
        // 3. For each group, create a Billing Note
        for (const [customerName, customerJobs] of Object.entries(customerGroups)) {
            // Calculate total amount (Base Price + Extra Costs)
            const totalAmount = customerJobs.reduce((sum, job) => {
                const base = Number(job.Price_Cust_Total) || 0
                let extra = 0
                if (job.extra_costs_json) {
                    try {
                        const costs = typeof job.extra_costs_json === 'string' 
                            ? JSON.parse(job.extra_costs_json) 
                            : job.extra_costs_json
                        if (Array.isArray(costs)) {
                            extra = costs.reduce((s: number, c: { charge_cust?: string | number }) => s + (Number(c.charge_cust) || 0), 0)
                        }
                    } catch {}
                }
                return sum + base + extra
            }, 0)

            // Generate Structured ID: INV_[Branch]-[YYYYMM]-[Counter] (Consistent with Manual)
            const billingNoteId = await getNextInvoiceId(customerJobs[0].Branch_ID ?? null)

            // Insert Billing Note
            const { error: insertError } = await supabase
                .from('Billing_Notes')
                .insert({
                    Billing_Note_ID: billingNoteId,
                    Customer_Name: customerName,
                    Billing_Date: new Date().toISOString().split('T')[0],
                    Total_Amount: totalAmount,
                    Status: 'Pending',
                    Branch_ID: customerJobs[0].Branch_ID || 'HQ',
                    Created_At: new Date().toISOString(),
                    Updated_At: new Date().toISOString()
                })

            if (!insertError) {
                // Link jobs to this BN
                await supabase
                    .from('Jobs_Main')
                    .update({ Billing_Note_ID: billingNoteId })
                    .in('Job_ID', customerJobs.map(j => j.Job_ID))
                
                createdNotes.push(billingNoteId)
            }
        }

        return { success: true, count: createdNotes.length, notes: createdNotes }
    } catch (err) { const e = err as Error;
        console.error("[Automation Error]", e)
        return { success: false, error: e.message }
    }
}

/**
 * SENDING PHASE (1st 09:00)
 * Automatically sends pending billing notes to customers.
 */
export async function sendScheduledBillingEmails() {
    try {
        const supabase = await createAdminClient()
        
        // 1. Get all 'Pending' billing notes created within the last 24 hours
        // (Adjust logic if needed to be more/less restrictive)
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 2) // Look back 2 days for safety

        const { data: notes, error: notesError } = await supabase
            .from('Billing_Notes')
            .select('*')
            .eq('Status', 'Pending')
            .gte('Created_At', yesterday.toISOString())
        
        if (notesError) throw notesError
        if (!notes || notes.length === 0) return { success: true, count: 0, message: "No notes to send" }

        // Fetch customer emails separately to avoid relationship errors
        const customerNames = Array.from(new Set(notes.map((n: { Customer_Name?: string }) => n.Customer_Name))).filter(Boolean)
        let emailMap = new Map()
        
        if (customerNames.length > 0) {
            const { data: customers } = await supabase
                .from('Master_Customers')
                .select('Customer_Name, Email')
                .in('Customer_Name', customerNames)
            
            if (customers) {
                emailMap = new Map(customers.map((c: { Customer_Name: string, Email: string }) => [c.Customer_Name, c.Email]))
            }
        }

        const sentCount: string[] = []

        for (const note of notes) {
            const customerEmail = emailMap.get(note.Customer_Name) || ""
            if (!customerEmail) continue

            // Parse: "main@email.com, cc1@email.com, cc2@email.com"
            const emailParts = customerEmail.split(',').map((e: string) => e.trim()).filter(Boolean)
            const to = emailParts[0]
            const cc = emailParts.slice(1).join(', ')

            // Template
            const subject = `[AUTO] ใบวางบิล / Billing Note #${note.Billing_Note_ID}`
            const html = `
                <p>เรียนคุณลูกค้า (${note.Customer_Name}),</p>
                <p>ทางบริษัทได้จัดส่งใบวางบิลประจำเดือนเลขที่ <b>${note.Billing_Note_ID}</b> เรียบร้อยแล้ว</p>
                <p><b>ยอดรวม:</b> ${note.Total_Amount.toLocaleString()} บาท</p>
                <p>สามารถดูรายละเอียดและดาวน์โหลดเอกสารได้ที่ลิงก์ด้านล่างนี้:</p>
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/billing/print/${note.Billing_Note_ID}" 
                   style="display: inline-block; padding: 10px 20px; background-color: #003366; color: white; text-decoration: none; border-radius: 5px;">
                   ดูใบบางบิลออนไลน์
                </a>
                <p>ขอแสดงความนับถือ<br/>ฝ่ายบัญชี</p>
            `

            // Send via Resend
            const { success } = await sendBillingEmail({
                to,
                cc,
                subject,
                html
            })

            if (success) {
                // Update status to 'Sent' (Optional: you might have a Sent status)
                // await supabase.from('Billing_Notes').update({ Status: 'Sent' }).eq('Billing_Note_ID', note.Billing_Note_ID)
                sentCount.push(note.Billing_Note_ID)
            }
        }

        return { success: true, count: sentCount.length, notes: sentCount }

    } catch (err) { const e = err as Error;
        console.error("[Dispatch Error]", e)
        return { success: false, error: e.message }
    }
}
