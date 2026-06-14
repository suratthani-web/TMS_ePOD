'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isAdmin } from "@/lib/permissions"
import { logActivity } from './logs'

export type Invoice = {
  Invoice_ID: string
  Tax_Invoice_ID: string | null
  Customer_ID: string
  Issue_Date: string
  Due_Date: string | null
  Subtotal: number
  VAT_Rate: number
  VAT_Amount: number
  Grand_Total: number
  Discount_Amount: number
  WHT_Rate: number
  WHT_Amount: number
  Net_Total: number
  Status: 'Draft' | 'Sent' | 'Paid' | 'Void' | 'Overdue'
  Notes: string | null
  Items_JSON: unknown
  Created_At: string
  Updated_At: string
  Created_By: string | null
  Branch_ID: string | null
  
  // Joins
  Customer_Name?: string
}

type UnifiedInvoiceRow = {
  Invoice_ID: string
  Customer_Name: string
  Issue_Date?: string | null
  Due_Date?: string | null
  Grand_Total?: number
  Status?: string
  Created_At: string
  Type: 'Invoice' | 'BillingNote'
}

export async function getInvoices(page = 1, limit = 20, query = '') {
  try {
    const branchId = await getUserBranchId()
    const isAdminUser = await isAdmin()
    const supabase = isAdminUser ? createAdminClient() : await createClient()

    // 1. Fetch Invoices
    let invQuery = supabase
      .from('invoices')
      .select('*, Master_Customers(Customer_Name)')
    
    if (branchId && branchId !== 'All') {
        invQuery = invQuery.or(`Branch_ID.eq.${branchId},Branch_ID.is.null`)
    } else if (!isAdminUser && !branchId) {
        invQuery = invQuery.eq('id', 'non-existent') // Effectively empty
    }

    if (query) {
        invQuery = invQuery.ilike('Invoice_ID', `%${query}%`)
    }

    // 2. Fetch Billing Notes (to unify)
    let bnQuery = supabase
      .from('Billing_Notes')
      .select('*')
    
    if (branchId && branchId !== 'All' && !isAdminUser) {
        bnQuery = bnQuery.or(`Branch_ID.eq.${branchId},Branch_ID.is.null`)
    } else if (isAdminUser && branchId && branchId !== 'All') {
        bnQuery = bnQuery.or(`Branch_ID.eq.${branchId},Branch_ID.is.null`)
    } else if (!isAdminUser && !branchId) {
        bnQuery = bnQuery.eq('id', 'non-existent')
    }

    if (query) {
        bnQuery = bnQuery.ilike('Billing_Note_ID', `%${query}%`)
    }

    // Execute concurrently
    const [invRes, bnRes] = await Promise.all([
        invQuery.order('Created_At', { ascending: false }),
        bnQuery.order('Created_At', { ascending: false })
    ])

    // 3. Merge and Map
    const mappedInvoices: UnifiedInvoiceRow[] = (invRes.data || []).map((inv: Partial<{ Invoice_ID: string, Issue_Date: string, Due_Date: string | null, Created_At: string, Grand_Total: number, Status: string, Master_Customers?: { Customer_Name?: string } }>) => ({
        ...inv,
        Invoice_ID: inv.Invoice_ID || '',
        Customer_Name: inv.Master_Customers?.Customer_Name || 'Unknown Customer',
        Created_At: inv.Created_At || '',
        Type: 'Invoice'
    }))

    const mappedBN: UnifiedInvoiceRow[] = (bnRes.data || []).map((bn: Partial<{ Billing_No: string, Billing_Note_ID?: string, Document_Date: string, Billing_Date?: string, Due_Date?: string, Created_At?: string, Customer_Name: string, Total_Amount: number, Status: string }>) => ({
        Invoice_ID: bn.Billing_Note_ID || '',
        Customer_Name: bn.Customer_Name || 'Unknown Customer',
        Issue_Date: bn.Billing_Date,
        Due_Date: bn.Due_Date,
        Grand_Total: bn.Total_Amount,
        Status: bn.Status,
        Created_At: bn.Created_At || '',
        Type: 'BillingNote'
    }))

    // 4. Deduplicate by Invoice_ID (Prefer Invoice over BillingNote if IDs match)
    const seenIds = new Set(mappedInvoices.map((i) => i.Invoice_ID))
    const uniqueBN = mappedBN.filter((bn) => !seenIds.has(bn.Invoice_ID))

    const todayNum = new Date().setHours(0,0,0,0)

    const combined = [...mappedInvoices, ...uniqueBN].map(doc => {
        // Dynamic Overdue check
        if (doc.Status !== 'Paid' && doc.Due_Date) {
            const dueDate = new Date(doc.Due_Date).setHours(0,0,0,0)
            if (dueDate < todayNum) {
                return { ...doc, Status: 'Overdue' }
            }
        }
        return doc
    }).sort((a, b) => 
        new Date(b.Created_At).getTime() - new Date(a.Created_At).getTime()
    )

    // Manual Pagination for the combined array
    const start = (page - 1) * limit
    const paginated = combined.slice(start, start + limit)

    return { 
        data: paginated, 
        count: combined.length 
    }
  } catch (err) {
    console.error('Error fetching unified invoices:', err)
    return { data: [], count: 0 }
  }
}

export async function getNextInvoiceId(branchId: string | null) {
    const supabase = createAdminClient()
    
    // 1. Resolve Branch Code (Extract from parentheses in Branch_Name)
    let branchCode = 'HQ'
    if (branchId && branchId !== 'All') {
        const { data: branch } = await supabase
            .from('Master_Branches')
            .select('Branch_Name')
            .eq('Branch_ID', branchId)
            .maybeSingle()
        
        if (branch?.Branch_Name) {
            const match = branch.Branch_Name.match(/\(([^)]+)\)/)
            branchCode = match ? match[1].toUpperCase() : branch.Branch_Name.slice(0, 3).toUpperCase()
        }
    }

    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const prefix = `INV_${branchCode}-${yyyy}${mm}-`
    const yearlyPrefix = `INV_${branchCode}-${yyyy}`

    // Search for the last sequence in the current year for this branch
    const { data: lastInvoice } = await supabase
        .from('invoices')
        .select('Invoice_ID')
        .like('Invoice_ID', `${yearlyPrefix}%`)
        .order('Invoice_ID', { ascending: false })
        .limit(1)
        .maybeSingle()

    let nextNum = 1
    if (lastInvoice) {
        const parts = lastInvoice.Invoice_ID.split('-')
        const lastSeq = parseInt(parts[parts.length - 1], 10)
        if (!isNaN(lastSeq)) {
            nextNum = lastSeq + 1
        }
    }

    return `${prefix}${String(nextNum).padStart(3, '0')}`
}

export async function getInvoiceById(id: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('invoices')
      .select('*, Master_Customers(*)')
      .eq('Invoice_ID', id)
      .single()
    
    if (error) throw error
    
    // We might need to fetch items if Items_JSON is not enough or if we want latest data?
    // Items_JSON is a snapshot. We should use it for the invoice.
    if (data && data.Master_Customers) {
        data.customers = data.Master_Customers;
    }
    
    return { success: true, data }
  } catch (error) {
    return { success: false, error }
  }
}

export async function createInvoice(invoice: Partial<Invoice>) {
  try {
    const isAdminUser = await isAdmin()
    const supabase = isAdminUser ? createAdminClient() : await createClient()
    
    // 1. Auto-assign Branch_ID if missing
    if (!invoice.Branch_ID) {
        invoice.Branch_ID = await getUserBranchId()
    }

    // 2. Generate Structured ID: INV_[Branch]-[YYYYMM]-[Counter]
    if (!invoice.Invoice_ID) {
        invoice.Invoice_ID = await getNextInvoiceId(invoice.Branch_ID ?? null)
    }

    const { data, error } = await supabase
      .from('invoices')
      .insert(invoice)
      .select()
      .single()

    if (error) {
        // If it still fails, it might be other columns missing (VAT_Rate, etc.)
        // But Discount_Amount is the confirmed offender.
        throw error
    }

    // Log invoice creation
    await logActivity({
      module: 'Billing',
      action_type: 'CREATE',
      target_id: data.Invoice_ID,
      details: {
        customer: data.Customer_Name,
        total: data.Grand_Total,
        tax_id: data.Tax_Invoice_ID
      }
    })

    // Link Jobs to this Invoice
    if (invoice.Items_JSON && Array.isArray(invoice.Items_JSON)) {
        const jobIds = invoice.Items_JSON.map((j: { Job_ID: string }) => j.Job_ID)
        if (jobIds.length > 0) {
            const { error: updateError } = await supabase
                .from('Jobs_Main')
                .update({ Invoice_ID: data.Invoice_ID })
                .in('Job_ID', jobIds)
            
            if (updateError) {
                // Should we rollback? For now, just log.
            }
        }
    }

    return { success: true, data }
  } catch (error) {
    return { success: false, error }
  }
}

export async function updateInvoice(id: string, updates: Partial<Invoice>) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('Invoice_ID', id)
      .select()
      .single()

    if (error) throw error

    // Log update
    await logActivity({
      module: 'Billing',
      action_type: 'UPDATE',
      target_id: id,
      details: {
        updated_status: updates.Status,
        grand_total: updates.Grand_Total
      }
    })

    return { success: true, data }
  } catch (error) {
    return { success: false, error }
  }
}

export async function deleteInvoice(id: string) {
    try {
      const supabase = await createClient()
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('Invoice_ID', id)
  
      if (error) throw error

      // Log deletion
      await logActivity({
        module: 'Billing',
        action_type: 'DELETE',
        target_id: id,
        details: {
          description: `Deleted invoice ${id}`
        }
      })

      return { success: true }
    } catch (error) {
      return { success: false, error }
    }
  }


export async function confirmInvoicePayment(id: string, type: 'Invoice' | 'BillingNote') {
    try {
        // Use the admin client: the app uses a custom session (not Supabase
        // Auth), so the regular client is anon and RLS blocks the update — the
        // row update silently affects 0 rows and .single() then errors, which is
        // why the button appeared to "do nothing". Matches the other billing
        // write actions (confirmInvoiceAndCreateBillingNote, voidAndReject...).
        const supabase = createAdminClient()
        const table = type === 'Invoice' ? 'invoices' : 'Billing_Notes'
        const idField = type === 'Invoice' ? 'Invoice_ID' : 'Billing_Note_ID'

        const { data, error } = await supabase
            .from(table)
            .update({ Status: 'Paid' })
            .eq(idField, id)
            .select()
            .single()

        if (error) throw error

        await logActivity({
            module: 'Billing',
            action_type: 'UPDATE',
            target_id: id,
            details: {
                action: 'CONFIRM_PAYMENT',
                type: type,
                new_status: 'Paid'
            }
        })

        return { success: true, data }
    } catch (error) {
        console.error(`Error confirming payment for ${type} ${id}:`, error)
        return { success: false, error }
    }
}
