'use server'

import { createAdminClient } from "@/utils/supabase/server"
import { getUserBranchId } from "@/lib/permissions"
import { logActivity } from "@/lib/supabase/logs"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/services/permission-guards"

type InvoiceCustomerJoin = {
    Customer_Name?: string | null
}

type InvoiceItemSnapshot = {
    Job_ID?: string | null
    Price_Cust_Total?: number | string | null
    Weight_Kg?: number | string | null
    Volume_Cbm?: number | string | null
    Loaded_Qty?: number | string | null
    Price_Per_Unit?: number | string | null
    Price_Cust_Extra?: number | string | null
    Charge_Labor?: number | string | null
    Charge_Wait?: number | string | null
    Price_Cust_Other?: number | string | null
    extra_costs_json?: unknown
    [key: string]: unknown
}

type InvoiceWithItems = {
    Customer_Name?: string | null
    Due_Date?: string | null
    Grand_Total?: number | null
    Subtotal?: number | null
    Discount_Amount?: number | null
    Discount_Percent?: number | null
    Discount_Rate?: number | null
    VAT_Amount?: number | null
    VAT_Rate?: number | null
    WHT_Amount?: number | null
    WHT_Rate?: number | null
    Items_JSON?: InvoiceItemSnapshot[] | null
    Master_Customers?: InvoiceCustomerJoin | InvoiceCustomerJoin[] | null
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export async function confirmInvoiceAndCreateBillingNote(invoiceId: string) {
    try {
        await requireAdmin()
        const supabase = await createAdminClient()

        // 1. Get Invoice Data with Customer Name join
        const { data: invoice, error: invoiceError } = await supabase
            .from('invoices')
            .select('*, Master_Customers(Customer_Name)')
            .eq('Invoice_ID', invoiceId)
            .single()

        if (invoiceError || !invoice) throw new Error("ไม่พบข้อมูลใบแจ้งหนี้")
        
        const typedInvoice = invoice as InvoiceWithItems
        const joinedCustomer = Array.isArray(typedInvoice.Master_Customers)
            ? typedInvoice.Master_Customers[0]
            : typedInvoice.Master_Customers
        const finalCustomerName = joinedCustomer?.Customer_Name || typedInvoice.Customer_Name || "Unknown"

        // 2. Use the same ID for Billing Note as the Invoice (As requested: "เลขชุดเดียวกัน")
        const billingNoteId = invoiceId
        
        const { data: existingBN } = await supabase
            .from('Billing_Notes')
            .select('Billing_Note_ID')
            .eq('Billing_Note_ID', billingNoteId)
            .maybeSingle()

        // 3. Get Branch ID from Jobs
        const { data: jobs, error: jobsError } = await supabase
            .from('Jobs_Main')
            .select('Job_ID, Branch_ID')
            .eq('Invoice_ID', invoiceId)

        if (jobsError || !jobs || jobs.length === 0) throw new Error("ไม่พบรายการงานที่ผูกกับใบแจ้งหนี้นี้")
        
        const branchId = jobs[0].Branch_ID || (await getUserBranchId()) || 'HQ'

        // 4. Upsert Billing Note (Idempotent)
        const { error: upsertError } = await supabase
            .from('Billing_Notes')
            .upsert({
                Billing_Note_ID: billingNoteId,
                Customer_Name: finalCustomerName,
                Billing_Date: new Date().toISOString(),
                Due_Date: typedInvoice.Due_Date,
                Total_Amount: typedInvoice.Grand_Total || typedInvoice.Subtotal,
                Discount_Amount: typedInvoice.Discount_Amount || 0,
                Discount_Percent: typedInvoice.Discount_Percent || typedInvoice.Discount_Rate || 0,
                VAT_Amount: typedInvoice.VAT_Amount || 0,
                VAT_Rate: typedInvoice.VAT_Rate || 0,
                WHT_Amount: typedInvoice.WHT_Amount || 0,
                WHT_Rate: typedInvoice.WHT_Rate || 0,
                Status: 'Pending',
                Created_At: existingBN ? undefined : new Date().toISOString(),
                Updated_At: new Date().toISOString(),
                Branch_ID: branchId
            })

        if (upsertError) throw upsertError

        // 5. Mark all linked jobs as Billed and attach the Billing Note in ONE
        // bulk update. This previously looped per job through the status machine
        // (~5 DB round-trips + revalidatePath x3 each); for a large invoice —
        // e.g. 158 jobs — that ran for minutes and timed out. The jobs are
        // already validated and priced on the invoice, so a bulk transition is
        // safe here (price sync still happens in the data-healing step below).
        const { error: jobsUpdateError } = await supabase
            .from('Jobs_Main')
            .update({ Job_Status: 'Billed', Billing_Note_ID: billingNoteId })
            .eq('Invoice_ID', invoiceId)

        if (jobsUpdateError) throw jobsUpdateError

        // 5.5 Data Healing: Sync ALL validated prices and JSON back to Jobs_Main for analytical integrity
        if (typedInvoice.Items_JSON && Array.isArray(typedInvoice.Items_JSON)) {
            try {
                const syncPromises = typedInvoice.Items_JSON.map((item) => {
                    if (!item.Job_ID) return null
                    
                    let priceTotal = Number(item.Price_Cust_Total || 0)
                    if (priceTotal === 0) {
                        const qty = Number(item.Weight_Kg || item.Volume_Cbm || item.Loaded_Qty || 1)
                        const unitPrice = Number(item.Price_Per_Unit || 0)
                        if (unitPrice > 0) {
                            priceTotal = Number((qty * unitPrice).toFixed(2))
                        }
                    }

                    return supabase
                        .from('Jobs_Main')
                        .update({ 
                            Price_Cust_Total: priceTotal,
                            Price_Per_Unit: Number(item.Price_Per_Unit || 0),
                            Price_Cust_Extra: Number(item.Price_Cust_Extra || 0),
                            Charge_Labor: Number(item.Charge_Labor || 0),
                            Charge_Wait: Number(item.Charge_Wait || 0),
                            Price_Cust_Other: Number(item.Price_Cust_Other || 0),
                            extra_costs_json: item.extra_costs_json || []
                        })
                        .eq('Job_ID', item.Job_ID)
                }).filter(Boolean)

                if (syncPromises.length > 0) {
                    await Promise.all(syncPromises)
                }
            } catch (syncError) {
                console.error("Data Healing Sync Error (Non-blocking):", syncError)
            }
        }

        // 6. Update Invoice Status
        const { error: updateInvoiceError } = await supabase
            .from('invoices')
            .update({ 
                Status: 'Wait Payment',
                Updated_At: new Date().toISOString()
            })
            .eq('Invoice_ID', invoiceId)

        if (updateInvoiceError) throw updateInvoiceError

        // Log Activity
        await logActivity({
            module: 'Billing',
            action_type: 'UPDATE',
            target_id: invoiceId,
            details: {
                action: 'CONFIRM_VERIFICATION',
                created_bn: billingNoteId,
                job_count: jobs.length
            }
        })

        revalidatePath('/billing/invoices')
        revalidatePath('/billing/customer')

        return { success: true, billingNoteId }

    } catch (error: unknown) {
        console.error("Confirm Invoice Error:", error)
        return { success: false, error: getErrorMessage(error) }
    }
}

export async function voidAndRejectInvoice(invoiceId: string) {
    try {
        const supabase = await createAdminClient()

        // 1. Unlink Jobs AND revert their status so they can be billed again.
        // Previously only the links were cleared while Job_Status stayed 'Billed',
        // leaving the jobs orphaned — invisible to the billable-jobs list and
        // impossible to re-invoice (lost revenue).
        const { error: unlinkError } = await supabase
            .from('Jobs_Main')
            .update({
                Invoice_ID: null,
                Billing_Note_ID: null,
                Job_Status: 'Completed'
            })
            .eq('Invoice_ID', invoiceId)

        if (unlinkError) throw unlinkError

        // 2. Delete the Invoice and related Billing Note (if any)
        // Note: Casade delete might handle this if set up, but we'll do it explicitly
        await supabase.from('Billing_Notes').delete().eq('Billing_Note_ID', invoiceId)
        
        const { error: deleteError } = await supabase
            .from('invoices')
            .delete()
            .eq('Invoice_ID', invoiceId)

        if (deleteError) throw deleteError

        // 3. Log Activity
        await logActivity({
            module: 'Billing',
            action_type: 'DELETE',
            target_id: invoiceId,
            details: {
                action: 'VOID_AND_REJECT',
                reason: 'USER_REJECTION'
            }
        })

        revalidatePath('/billing/invoices')
        revalidatePath('/billing/customer')

        return { success: true }
    } catch (error: unknown) {
        console.error("Void Invoice Error:", error)
        return { success: false, error: getErrorMessage(error) }
    }
}
