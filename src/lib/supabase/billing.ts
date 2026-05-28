'use server'

import { createClient, createAdminClient } from "@/utils/supabase/server"
import { getUserBranchId, isAdmin, isSuperAdmin } from "@/lib/permissions"
import { accountingService } from "@/services/accounting"
import { Job, Driver_Payment } from "@/types/database"
import { logActivity } from "./logs"
import { revalidatePath } from "next/cache"

export interface BillingNote {
  Billing_Note_ID: string
  Customer_Name: string
  Billing_Date: string
  Due_Date: string | null
  Total_Amount: number
  Status: string
  Created_At: string
  Updated_At: string
  Customer_Email?: string
  Customer_Address?: string
  Customer_Tax_ID?: string
  Credit_Days?: number
  Remarks?: string
  VAT_Rate?: number
  VAT_Amount?: number
  Discount_Amount?: number
  Discount_Percent?: number
  WHT_Rate?: number
  WHT_Amount?: number
}

function getErrorMessage(e: any): string {
    if (!e) return "Unknown error"
    if (typeof e === 'string') return e
    if (e.message) return e.message
    if (e.error?.message) return e.error.message
    return JSON.stringify(e)
}

export async function createBillingNote(
    jobIds: string[], 
    customerName: string, 
    date: string,
    dueDate?: string
) {
    try {
        const hasAdminPrivileges = await isAdmin()
        const supabase = hasAdminPrivileges ? await createAdminClient() : await createClient()

        // 1. Calculate Total Amount
        const { data: jobs, error: jobsError } = await supabase
            .from('Jobs_Main')
            .select('Job_ID, Route_Name, Price_Cust_Total, extra_costs_json, Branch_ID')
            .in('Job_ID', jobIds)

        if (jobsError) throw new Error("Failed to fetch jobs for calculation")
        
        const totalAmount = jobs?.reduce((sum: number, job: any) => {
             const basePrice = job.Price_Cust_Total || 0
             let extra = 0
             
             if (job.extra_costs_json) {
                 try {
                     let costs = job.extra_costs_json
                     if (typeof costs === 'string') {
                        try { costs = JSON.parse(costs) } catch {}
                     }
                     // Handle double stringification if necessary
                     if (typeof costs === 'string') {
                        try { costs = JSON.parse(costs) } catch {}
                     }
                     
                     if (Array.isArray(costs)) {
                         extra = costs.reduce((cHigh: number, c: Record<string, unknown>) => cHigh + (Number(c.charge_cust) || 0), 0)
                     }
                 } catch {
                     // Error parsing extra costs
                 }
             }

             return sum + basePrice + extra
        }, 0) || 0

        // 2. Generate Billing Note ID (BN-YYYYMM-XXXX)
        const dateObj = new Date()
        const ym = dateObj.toISOString().slice(0, 7).replace('-', '') // 202402
        const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
        const billingNoteId = `BN-${ym}-${randomSuffix}`

        // 3. Insert Billing Note
        const userBranchId = await getUserBranchId()
        // Use Branch_ID from the first job if available, otherwise fallback to user's branch
        let branchId = jobs?.[0]?.Branch_ID || userBranchId || 'HQ'
        
        // Normalize "All" branch (super admin default)
        if (branchId === 'All') {
            branchId = jobs?.[0]?.Branch_ID || 'HQ'
        }

        // Fetch customer details to persist them in the billing note
        let customerAddress = ""
        let customerTaxId = ""
        let creditDays = 15

        const { data: customer } = await supabase
            .from('Master_Customers')
            .select('Address, Tax_ID, Credit_Term')
            .eq('Customer_Name', customerName.trim())
            .limit(1)
            .maybeSingle()
        
        if (customer) {
            customerAddress = customer.Address || ""
            customerTaxId = customer.Tax_ID || ""
            creditDays = customer.Credit_Term || 15
        }

        const { error: insertError } = await supabase
            .from('Billing_Notes')
            .insert({
                Billing_Note_ID: billingNoteId,
                Customer_Name: customerName,
                Billing_Date: date,
                Due_Date: dueDate || null,
                Total_Amount: totalAmount,
                Status: 'Pending',
                Created_At: new Date().toISOString(),
                Updated_At: new Date().toISOString(),
                Branch_ID: branchId,
                Customer_Address: customerAddress,
                Customer_Tax_ID: customerTaxId,
                Credit_Days: creditDays
            })

        if (insertError) throw insertError

        // 4. Update Jobs with Billing Note ID
        const { error: updateError } = await supabase
            .from('Jobs_Main')
            .update({ Billing_Note_ID: billingNoteId })
            .in('Job_ID', jobIds)

        if (updateError) {
             throw updateError
        }

        // Log Billing Note creation
        await logActivity({
            module: 'Billing',
            action_type: 'CREATE',
            target_id: billingNoteId,
            details: {
                customer: customerName,
                total: totalAmount,
                job_count: jobIds.length
            }
        })

        // 5. Automatic Sync to Accounting
        try {
            const noteData = {
                Billing_Note_ID: billingNoteId,
                Customer_Name: customerName,
                Billing_Date: date,
                Due_Date: dueDate,
                Total_Amount: totalAmount
            };
            
            // Trigger sync in background
            accountingService.syncBillingNoteToInvoice(noteData, (jobs as unknown as Job[]) || []).then(() => {
                // Background sync
            });
        } catch {
            // Error triggering auto-sync
        }

        return { success: true, id: billingNoteId }

    } catch (e: unknown) {
        return { success: false, error: getErrorMessage(e) }
    }
}

export async function createDriverPayment(
    jobIds: string[], 
    driverName: string, 
    date: string
) {
    try {
        const hasAdminPrivileges = await isAdmin()
        const supabase = hasAdminPrivileges ? await createAdminClient() : await createClient()

        // 1. Calculate Total Amount
        const { data: jobs, error: jobsError } = await supabase
            .from('Jobs_Main')
            .select('Cost_Driver_Total, Branch_ID')
            .in('Job_ID', jobIds)

        if (jobsError) throw new Error("Failed to fetch jobs for calculation")
        
        const totalAmount = jobs?.reduce((sum: number, job: any) => sum + (job.Cost_Driver_Total || 0), 0) || 0

        // 2. Generate Driver Payment ID (DP-YYYYMM-XXXX)
        const dateObj = new Date()
        const ym = dateObj.toISOString().slice(0, 7).replace('-', '') // 202402
        const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
        const paymentId = `DP-${ym}-${randomSuffix}`

        // 3. Insert Driver Payment
        const userBranchId = await getUserBranchId()
        // Use Branch_ID from the first job if available, otherwise fallback to user's branch
        let branchId = jobs?.[0]?.Branch_ID || userBranchId || 'HQ'
        
        // Normalize "All" branch
        if (branchId === 'All') {
            branchId = jobs?.[0]?.Branch_ID || 'HQ'
        }

        const { error: insertError } = await supabase
            .from('Driver_Payments')
            .insert({
                Driver_Payment_ID: paymentId,
                Driver_Name: driverName,
                Payment_Date: date,
                Total_Amount: totalAmount,
                Status: 'Pending',
                Created_At: new Date().toISOString(),
                Updated_At: new Date().toISOString(),
                Branch_ID: branchId
            })

        if (insertError) throw insertError

        // 4. Update Jobs with Driver Payment ID
        const { error: updateError } = await supabase
            .from('Jobs_Main')
            .update({ Driver_Payment_ID: paymentId })
            .in('Job_ID', jobIds)

        if (updateError) {
             throw updateError
        }

        // Log Driver Payment creation
        await logActivity({
            module: 'Billing',
            action_type: 'CREATE',
            target_id: paymentId,
            details: {
                driver: driverName,
                total: totalAmount,
                job_count: jobIds.length
            }
        })

        // 5. Automatic Sync to Accounting
        try {
            const paymentData: Driver_Payment = {
                Driver_Payment_ID: paymentId,
                Driver_Name: driverName,
                Payment_Date: date,
                Total_Amount: totalAmount
            };
            
            // Trigger sync in background
            accountingService.syncDriverPaymentToBill(paymentData, (jobs as unknown as Job[]) || []).then(() => {
                // Background sync
            });
        } catch {
            // Error triggering auto-sync
        }

        return { success: true, id: paymentId }

    } catch (e: unknown) {
        return { success: false, error: getErrorMessage(e) }
    }
}

export async function getBillingNotes(filters?: { dateFrom?: string, dateTo?: string, status?: string }) {
    try {
        const admin = await isAdmin()
        const supabase = admin ? await createAdminClient() : await createClient()
        
        // Filter by Branch
        const branchId = await getUserBranchId()
        const isSuper = await isSuperAdmin()

        let query = supabase.from('Billing_Notes').select('*')

        // STRICT ISOLATION: Non-SuperAdmins MUST be filtered by their branch
        if (!isSuper) {
            if (branchId && branchId !== 'All') {
                query = query.or(`Branch_ID.eq."${branchId}",Branch_ID.is.null`)
            } else {
                // If they have no branch assigned, they see nothing (safety)
                return []
            }
        } else if (branchId && branchId !== 'All') {
            // SuperAdmin can filter by specific branch
            query = query.eq('Branch_ID', branchId)
        }
        if (filters?.dateFrom) query = query.gte('Billing_Date', filters.dateFrom)
        if (filters?.dateTo) query = query.lte('Billing_Date', filters.dateTo)
        if (filters?.status && filters.status !== 'all') query = query.eq('Status', filters.status)

        const { data, error } = await query
            .order('Created_At', { ascending: false })
        
        if (error) {
            return []
        }
        
        const notes = data as BillingNote[]
        
        // Fetch emails separately to avoid join errors if relationships aren't configured
        const customerNames = Array.from(new Set(notes.map(n => n.Customer_Name))).filter(Boolean)
        if (customerNames.length > 0) {
            const { data: customers } = await supabase
                .from('Master_Customers')
                .select('Customer_Name, Email')
                .in('Customer_Name', customerNames)
            
            if (customers) {
                const emailMap = new Map<string, string>(customers.map((c: any) => [c.Customer_Name, c.Email]))
                notes.forEach(n => {
                    n.Customer_Email = emailMap.get(n.Customer_Name) || ""
                })
            }
        }

        return notes
    } catch {
        return []
    }
}

export async function getBillingNoteByIdWithJobs(id: string) {
    try {
        const admin = await isAdmin()
        const supabase = admin ? await createAdminClient() : await createClient()
        
        let note: any = null
        let jobs: any[] = []

        // 1. Detect Type and Get Data
        if (id.startsWith('INV')) {
            // It's an Invoice ID (e.g. INV- or INV_)
            const { data: inv, error: invError } = await supabase
                .from('invoices')
                .select('*, Master_Customers(*)')
                .eq('Invoice_ID', id)
                .single()
            
            if (invError) throw invError
            
            note = {
                Billing_Note_ID: inv.Invoice_ID,
                Customer_Name: inv.Master_Customers?.Customer_Name || inv.Customer_Name,
                Billing_Date: inv.Issue_Date,
                Due_Date: inv.Due_Date,
                Total_Amount: inv.Grand_Total,
                Status: inv.Status,
                Customer_Address: inv.Master_Customers?.Address,
                Customer_Tax_ID: inv.Master_Customers?.Tax_ID,
                Remarks: inv.Notes,
                VAT_Rate: inv.VAT_Rate,
                VAT_Amount: inv.VAT_Amount,
                Discount_Amount: inv.Discount_Amount,
                Discount_Percent: inv.Discount_Percent || inv.Discount_Rate,
                WHT_Rate: inv.WHT_Rate,
                WHT_Amount: inv.WHT_Amount,
                Credit_Days: inv.Credit_Days || 15
            }

            if (inv.Items_JSON && Array.isArray(inv.Items_JSON)) {
                jobs = inv.Items_JSON
            }
        } else {
            // It's a Billing Note ID (or fallback)
            const { data: bn, error: bnError } = await supabase
                .from('Billing_Notes')
                .select('*')
                .eq('Billing_Note_ID', id)
                .single()
            
            if (bnError) throw bnError
            note = bn
        }

        // 2. Get Jobs if not already loaded from snapshot
        if (jobs.length === 0) {
            const { data: dbJobs, error: jobsError } = await supabase
                .from('Jobs_Main')
                .select('*, extra_costs_json')
                .or(`Billing_Note_ID.eq."${id}",Invoice_ID.eq."${id}"`)
            
            if (jobsError) throw jobsError
            jobs = dbJobs || []

            // Enrich with Unit Prices from Master_Customers
            try {
                const uniqueCustomerIds = Array.from(new Set(jobs.filter(j => j.Customer_ID).map(j => j.Customer_ID)))
                if (uniqueCustomerIds.length > 0) {
                    const { data: customerPrices } = await supabase
                        .from('Master_Customers')
                        .select('Customer_ID, Price_Per_Unit')
                        .in('Customer_ID', uniqueCustomerIds)

                    if (customerPrices) {
                        const priceMap = new Map<string, number>(customerPrices.map((c: any) => [c.Customer_ID, c.Price_Per_Unit]))
                        jobs = jobs.map(job => ({
                            ...job,
                            Price_Per_Unit: job.Price_Per_Unit || priceMap.get(job.Customer_ID) || 0
                        }))
                    }
                }
            } catch (e) {
                console.error("Enriching unit prices failed in getBillingNoteByIdWithJobs:", e)
            }
        }

        // 3. Get Accounting Profile (New priority)
        const { data: acctData } = await supabase
            .from('System_Settings')
            .select('value')
            .eq('key', 'accounting_profile')
            .maybeSingle()

        // 3.1 Get Company Profile (Fallback)
        const { data: profileData } = await supabase
            .from('System_Settings')
            .select('value')
            .eq('key', 'company_profile')
            .maybeSingle()

        let companyProfile = null
        if (acctData?.value) {
            try {
                companyProfile = typeof acctData.value === 'string' ? JSON.parse(acctData.value) : acctData.value
            } catch {}
        }
        
        // If accounting profile is empty, fallback to company profile
        if (!companyProfile && profileData?.value) {
            try {
                companyProfile = typeof profileData.value === 'string' ? JSON.parse(profileData.value) : profileData.value
            } catch {}
        }

        // 4. Get Customer Details
        let customerEmail = ""
        let customerAddress = ""
        let customerTaxId = ""

        if (note && note.Customer_Name) {
            // Try to find Customer_ID from jobs first (more reliable than name matching)
            const customerId = jobs.find(j => j.Customer_ID)?.Customer_ID
            
            let query = supabase.from('Master_Customers').select('Address, Tax_ID, Email')
            
            if (customerId) {
                query = query.eq('Customer_ID', customerId)
            } else {
                // Fallback to name with trimming to handle potential trailing spaces
                query = query.eq('Customer_Name', note.Customer_Name.trim())
            }

            const { data: customer, error: custError } = await query
                .limit(1)
                .maybeSingle()
            
            if (custError) {
                // Error fetching customer
            }

            if (customer) {
                customerAddress = customer.Address || ""
                customerTaxId = customer.Tax_ID || ""
                customerEmail = customer.Email || ""
            }
        }

        const billingNoteWithDetails: BillingNote = {
            ...note as BillingNote,
            Customer_Email: customerEmail || (note as any).Customer_Email,
            Customer_Address: customerAddress || (note as any).Customer_Address,
            Customer_Tax_ID: customerTaxId || (note as any).Customer_Tax_ID
        }

        return { note: billingNoteWithDetails, jobs: jobs || [], company: companyProfile }

    } catch {
        return null
    }
}

export interface DriverPayment {
    Driver_Payment_ID: string
    Driver_Name: string
    Payment_Date: string
    Total_Amount: number
    Status: string
    Created_At: string
    Updated_At: string
}

export async function getDriverPayments(filters?: { dateFrom?: string, dateTo?: string, status?: string }) {
    try {
        const admin = await isAdmin()
        const supabase = admin ? await createAdminClient() : await createClient()

        // Filter by Branch
        const branchId = await getUserBranchId()
        const isSuper = await isSuperAdmin()

        let query = supabase.from('Driver_Payments').select('*')

        // STRICT ISOLATION
        if (!isSuper) {
            if (branchId && branchId !== 'All') {
                query = query.or(`Branch_ID.eq."${branchId}",Branch_ID.is.null`)
            } else {
                return []
            }
        } else if (branchId && branchId !== 'All') {
            query = query.eq('Branch_ID', branchId)
        }

        if (filters?.dateFrom) query = query.gte('Payment_Date', filters.dateFrom)
        if (filters?.dateTo) query = query.lte('Payment_Date', filters.dateTo)
        if (filters?.status && filters.status !== 'all') query = query.eq('Status', filters.status)

        const { data, error } = await query
            .order('Created_At', { ascending: false })
        
        if (error) {
            return []
        }
        return data as DriverPayment[]
    } catch {
        return []
    }
}

export async function getDriverPaymentByIdWithJobs(id: string) {
    try {
        const admin = await isAdmin()
        const supabase = admin ? await createAdminClient() : await createClient()
        
        // 1. Get Driver Payment
        const { data: payment, error: paymentError } = await supabase
            .from('Driver_Payments')
            .select('*')
            .eq('Driver_Payment_ID', id)
            .single()
        
        if (paymentError) throw paymentError

        // 2. Get Associated Jobs
        const { data: jobs, error: jobsError } = await supabase
            .from('Jobs_Main')
            .select('*, extra_costs_json')
            .eq('Driver_Payment_ID', id)
        
        if (jobsError) throw jobsError

        // 3. Get Accounting Profile (New priority)
        const { data: acctData } = await supabase
            .from('System_Settings')
            .select('value')
            .eq('key', 'accounting_profile')
            .maybeSingle()

        // 3.1 Get Company Profile (Fallback)
        const { data: profileData } = await supabase
            .from('System_Settings')
            .select('value')
            .eq('key', 'company_profile')
            .maybeSingle()

        let companyProfile = null
        if (acctData?.value) {
            try {
                companyProfile = typeof acctData.value === 'string' ? JSON.parse(acctData.value) : acctData.value
            } catch {}
        }
        
        // If accounting profile is empty, fallback to company profile
        if (!companyProfile && profileData?.value) {
            try {
                companyProfile = typeof profileData.value === 'string' ? JSON.parse(profileData.value) : profileData.value
            } catch {}
        }

        // 4. Get Payee Details (Bank Info)
        let bankInfo = {
            Bank_Name: "",
            Bank_Account_No: "",
            Bank_Account_Name: ""
        }

        // Try as Individual Driver first
        const { data: driver } = await supabase
            .from('Master_Drivers')
            .select('Bank_Name, Bank_Account_No, Bank_Account_Name')
            .eq('Driver_Name', payment.Driver_Name)
            .maybeSingle()
        
        if (driver?.Bank_Account_No) {
            bankInfo = driver
        } else {
            // Try as Subcontractor
            const { data: sub } = await supabase
                .from('Subcontractors')
                .select('Bank_Name, Bank_Account_No, Bank_Account_Name')
                .eq('Sub_Name', payment.Driver_Name)
                .maybeSingle()
            if (sub) bankInfo = sub
        }

        return { 
            payment: payment as DriverPayment, 
            jobs: jobs || [], 
            company: companyProfile,
            bankInfo
        }

    } catch {
        return null
    }
}

export async function updateBillingNoteStatus(id: string, status: string) {
    try {
        const admin = await isAdmin()
        const supabase = admin ? await createAdminClient() : await createClient()

        const { error } = await supabase
            .from('Billing_Notes')
            .update({ 
                Status: status,
                Updated_At: new Date().toISOString()
            })
            .eq('Billing_Note_ID', id)

        if (error) throw error

        // Log status update
        await logActivity({
            module: 'Billing',
            action_type: 'UPDATE',
            target_id: id,
            details: {
                new_status: status,
                entity: 'Billing Note'
            }
        })

        revalidatePath('/billing/customer/history')
        return { success: true }
    } catch (e: unknown) {
        return { success: false, error: getErrorMessage(e) }
    }
}

export async function updateDriverPaymentStatus(id: string, status: string) {
    try {
        const admin = await isAdmin()
        const supabase = admin ? await createAdminClient() : await createClient()

        const { error } = await supabase
            .from('Driver_Payments')
            .update({ 
                Status: status,
                Updated_At: new Date().toISOString()
            })
            .eq('Driver_Payment_ID', id)

        if (error) throw error

        // Log status update
        await logActivity({
            module: 'Billing',
            action_type: 'UPDATE',
            target_id: id,
            details: {
                new_status: status,
                entity: 'Driver Payment'
            }
        })

        revalidatePath('/billing/driver/history')
        return { success: true }
    } catch (e: unknown) {
        return { success: false, error: getErrorMessage(e) }
    }
}

export async function recallBillingNote(id: string) {
    try {
        const admin = await isSuperAdmin()
        if (!admin) throw new Error("Only SuperAdmins can recall billing notes")

        const supabase = await createAdminClient()

        // 1. Unlink jobs
        const { error: unlinkError } = await supabase
            .from('Jobs_Main')
            .update({ Billing_Note_ID: null })
            .eq('Billing_Note_ID', id)

        if (unlinkError) throw unlinkError

        // 2. Delete billing note
        const { error: deleteError } = await supabase
            .from('Billing_Notes')
            .delete()
            .eq('Billing_Note_ID', id)

        if (deleteError) throw deleteError

        // Log recall
        await logActivity({
            module: 'Billing',
            action_type: 'DELETE',
            target_id: id,
            details: {
                description: `Recalled/Deleted billing note ${id}`
            }
        })

        revalidatePath('/billing/customer/history')
        return { success: true }
    } catch (e: unknown) {
        return { success: false, error: getErrorMessage(e) }
    }
}

export async function recallDriverPayment(id: string) {
    try {
        const admin = await isSuperAdmin()
        if (!admin) throw new Error("Only SuperAdmins can recall payments")

        const supabase = await createAdminClient()

        // 1. Unlink jobs
        const { error: unlinkError } = await supabase
            .from('Jobs_Main')
            .update({ Driver_Payment_ID: null })
            .eq('Driver_Payment_ID', id)

        if (unlinkError) throw unlinkError

        // 2. Delete payment
        const { error: deleteError } = await supabase
            .from('Driver_Payments')
            .delete()
            .eq('Driver_Payment_ID', id)

        if (deleteError) throw deleteError

        // Log recall
        await logActivity({
            module: 'Billing',
            action_type: 'DELETE',
            target_id: id,
            details: {
                description: `Recalled/Deleted driver payment ${id}`
            }
        })

        revalidatePath('/billing/driver/history')
        return { success: true }
    } catch (e: unknown) {
        return { success: false, error: getErrorMessage(e) }
    }
}

export async function getPublicBillingNoteById(id: string) {
    try {
        // Use admin client to bypass RLS for public invoice view
        const supabase = await createAdminClient()
        
        let note: any = null
        let jobs: any[] = []

        // 1. Detect Type and Get Data
        if (id.startsWith('INV')) {
            // It's an Invoice ID (e.g. INV- or INV_)
            const { data: inv, error: invError } = await supabase
                .from('invoices')
                .select('*, Master_Customers(*)')
                .eq('Invoice_ID', id)
                .single()
            
            if (invError) throw invError
            
            note = {
                Billing_Note_ID: inv.Invoice_ID,
                Customer_Name: inv.Master_Customers?.Customer_Name || inv.Customer_Name,
                Billing_Date: inv.Issue_Date,
                Due_Date: inv.Due_Date,
                Total_Amount: inv.Grand_Total,
                Status: inv.Status,
                Customer_Address: inv.Master_Customers?.Address,
                Customer_Tax_ID: inv.Master_Customers?.Tax_ID,
                Remarks: inv.Notes,
                VAT_Rate: inv.VAT_Rate,
                VAT_Amount: inv.VAT_Amount,
                Discount_Amount: inv.Discount_Amount,
                WHT_Rate: inv.WHT_Rate,
                WHT_Amount: inv.WHT_Amount,
                Credit_Days: inv.Credit_Days || 15
            }

            if (inv.Items_JSON && Array.isArray(inv.Items_JSON)) {
                jobs = inv.Items_JSON
            }
        } else {
            // It's a Billing Note ID
            const { data: bn, error: bnError } = await supabase
                .from('Billing_Notes')
                .select('*')
                .eq('Billing_Note_ID', id)
                .single()
            
            if (bnError) throw bnError
            note = bn
        }

        // 2. Get Associated Jobs if not already loaded
        if (jobs.length === 0) {
            const { data: dbJobs, error: jobsError } = await supabase
                .from('Jobs_Main')
                .select('*, extra_costs_json')
                .or(`Billing_Note_ID.eq."${id}",Invoice_ID.eq."${id}"`)
            
            if (jobsError) throw jobsError
            jobs = dbJobs || []
        }

        // Enrich with Unit Prices from Master_Customers
        try {
            const uniqueCustomerIds = Array.from(new Set(jobs.filter(j => j.Customer_ID).map(j => j.Customer_ID)))
            if (uniqueCustomerIds.length > 0) {
                const { data: customerPrices } = await supabase
                    .from('Master_Customers')
                    .select('Customer_ID, Price_Per_Unit')
                    .in('Customer_ID', uniqueCustomerIds)

                if (customerPrices) {
                    const priceMap = new Map<string, number>(customerPrices.map((c: any) => [c.Customer_ID, c.Price_Per_Unit]))
                    jobs = jobs.map(job => ({
                        ...job,
                        Price_Per_Unit: job.Price_Per_Unit || priceMap.get(job.Customer_ID) || 0
                    }))
                }
            }
        } catch (e) {
            console.error("Enriching unit prices failed in getPublicBillingNoteById:", e)
        }

        // 3. Get Accounting Profile (Priority)
        const { data: acctData } = await supabase
            .from('System_Settings')
            .select('value')
            .eq('key', 'accounting_profile')
            .maybeSingle()

        // 3.1 Get Company Profile (Fallback)
        const { data: profileData } = await supabase
            .from('System_Settings')
            .select('value')
            .eq('key', 'company_profile')
            .maybeSingle()

        let companyProfile = null
        if (acctData?.value) {
            try {
                companyProfile = typeof acctData.value === 'string' ? JSON.parse(acctData.value) : acctData.value
            } catch {}
        }
        
        if (!companyProfile && profileData?.value) {
            try {
                companyProfile = typeof profileData.value === 'string' ? JSON.parse(profileData.value) : profileData.value
            } catch {}
        }

        // 4. Get Customer Details
        let customerEmail = ""
        let customerAddress = ""
        let customerTaxId = ""

        if (note && note.Customer_Name) {
            // Try to find Customer_ID from jobs first (more reliable)
            const customerId = jobs.find(j => j.Customer_ID)?.Customer_ID
            
            let query = supabase.from('Master_Customers').select('Address, Tax_ID, Email')
            
            if (customerId) {
                query = query.eq('Customer_ID', customerId)
            } else {
                query = query.eq('Customer_Name', note.Customer_Name.trim())
            }

            const { data: customer } = await query
                .limit(1)
                .maybeSingle()
            
            if (customer) {
                customerAddress = customer.Address || ""
                customerTaxId = customer.Tax_ID || ""
                customerEmail = customer.Email || ""
            }
        }

        const billingNoteWithDetails: BillingNote = {
            ...note as BillingNote,
            Customer_Email: customerEmail || (note as any).Customer_Email,
            Customer_Address: customerAddress || (note as any).Customer_Address,
            Customer_Tax_ID: customerTaxId || (note as any).Customer_Tax_ID
        }

        return { note: billingNoteWithDetails, jobs: jobs || [], company: companyProfile }

    } catch (error) {
        console.error("Error fetching public billing note:", error)
        return null
    }
}
