"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'

export type Customer = {
  Customer_ID: string
  Customer_Name: string
  Contact_Person: string | null
  Phone: string | null
  Email: string | null
  Address: string | null
  Tax_ID: string | null
  Branch_ID: string | null
  Credit_Term?: number | null
  Is_Active: boolean | null
  Origin_Location?: string | null
  Dest_Location?: string | null
  Default_Origin?: string | null
  Line_User_ID?: string | null
  Price_Per_Unit?: number | null
  Incentive_Sensor_Check?: boolean | null
}

// Get all customers
import { getUserBranchId, isSuperAdmin, getCustomerId, isAdmin } from "@/lib/permissions"

export async function getAllCustomers(page?: number, limit?: number, query?: string, providedBranchId?: string) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    
    let queryBuilder = supabase.from('Master_Customers').select('*', { count: 'exact' })
    
    // Filter by Branch
    const userBranchId = await getUserBranchId()
    const customerId = await getCustomerId()
    
    if (customerId) {
        queryBuilder = queryBuilder.eq('Customer_ID', customerId)
    } else {
        // STRICT ISOLATION
        if (!isSuper) {
            if (userBranchId && userBranchId !== 'All') {
                queryBuilder = queryBuilder.eq('Branch_ID', userBranchId)
            } else {
                return { data: [], count: 0 }
            }
        } else {
            // Only Super Admins can use the provided branch filter
            const targetBranch = providedBranchId || userBranchId
            if (targetBranch && targetBranch !== 'All') {
                queryBuilder = queryBuilder.eq('Branch_ID', targetBranch)
            }
        }

    }

    
    if (query) {
      queryBuilder = queryBuilder.or(`Customer_Name.ilike.%${query}%,Customer_ID.ilike.%${query}%`)
    }
    
    if (page && limit) {
      const from = (page - 1) * limit
      const to = from + limit - 1
      queryBuilder = queryBuilder.range(from, to)
    }
    
    const { data, error, count } = await queryBuilder.order('Customer_ID', { ascending: false })
    
    if (error) {
      return { data: [], count: 0 }
    }
    
    return { data: data || [], count: count || 0 }
  } catch {
    return { data: [], count: 0 }
  }
}

// Create customer
export async function createCustomer(customerData: Partial<Customer>) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    
    // Generate ID if not provided: CUST-YYYYMM-XXXX
    let customerId = customerData.Customer_ID
    if (!customerId) {
        const dateStr = new Date().toISOString().slice(2,7).replace('-','') // YYMM
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
        customerId = `CUST-${dateStr}-${random}`
    }

    // Get User Branch
    const branchId = await getUserBranchId()

    const { data, error } = await supabase
      .from('Master_Customers')
      .insert({
        Customer_ID: customerId,
        Customer_Name: customerData.Customer_Name,
        Contact_Person: customerData.Contact_Person,
        Phone: customerData.Phone,
        // Email: customerData.Email,
        Address: customerData.Address,
        Tax_ID: customerData.Tax_ID,
        Branch_ID: (isSuper && customerData.Branch_ID && customerData.Branch_ID !== 'All') 
                    ? customerData.Branch_ID 
                    : (branchId !== 'All' ? branchId : 'HQ'), 

        Credit_Term: customerData.Credit_Term || 30, // Default to 30 days if not set
        Price_Per_Unit: customerData.Price_Per_Unit || 0,
        Incentive_Sensor_Check: (customerData as { Incentive_Sensor_Check?: boolean }).Incentive_Sensor_Check || false
      })
      .select()
      .single()
    
    if (error) {
      return { success: false, error }
    }
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e }
  }
}

// Update customer
export async function updateCustomer(id: string, customerData: Partial<Customer>) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()

    const { data, error } = await supabase
      .from('Master_Customers')
      .update(customerData)
      .eq('Customer_ID', id)
      .select()
      .single()
    
    if (error) {
      return { success: false, error }
    }
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e }
  }
}

// Delete customer
export async function deleteCustomer(id: string) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()

    const { error } = await supabase
      .from('Master_Customers')
      .delete()
      .eq('Customer_ID', id)
    
    if (error) {
      return { success: false, error }
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e }
  }
}

// Bulk create customers
export async function createBulkCustomers(customers: Record<string, unknown>[]) {
    try {
        const isSuper = await isSuperAdmin()
        const isAdminUser = await isAdmin()
        const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
        const branchId = await getUserBranchId()
        
        // Normalize keys
        const normalizeData = (row: Record<string, unknown>) => {
            const normalized: Record<string, unknown> = {}
            const getValue = (keys: string[]) => {
                const rowKeys = Object.keys(row)
                for (const key of keys) {
                    const foundKey = rowKeys.find(k => k.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase().replace(/\s+/g, '_'))
                    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
                        return row[foundKey]
                    }
                }
                return undefined
            }
    
            normalized.Customer_ID = getValue(['customer_id', 'id', 'รหัสลูกค้า', 'รหัส'])
            normalized.Customer_Name = getValue(['customer_name', 'name', 'company', 'company_name', 'ชื่อลูกค้า', 'ชื่อบริษัท'])
            normalized.Contact_Person = getValue(['contact_person', 'contact', 'ผู้ติดต่อ'])
            normalized.Phone = getValue(['phone', 'mobile', 'tel', 'เบอร์โทร', 'โทรศัพท์'])
            normalized.Email = getValue(['email', 'mail', 'อีเมล'])
            normalized.Address = getValue(['address', 'location', 'ที่อยู่'])
            normalized.Tax_ID = getValue(['tax_id', 'tax', 'เลขผู้เสียภาษี'])
            normalized.Branch_ID = getValue(['branch_id', 'branch', 'สาขา', 'รหัสสาขา'])
            normalized.Line_User_ID = getValue(['line_user_id', 'line_id', 'รหัสไลน์'])
            normalized.Credit_Term = getValue(['credit_term', 'term', 'credit', 'เครดิต', 'เครดิตเทอม'])
            normalized.Price_Per_Unit = getValue(['price_per_unit', 'unit_price', 'rate', 'ราคาต่อหน่วย', 'ราคาต่อชิ้น'])
            
            return normalized
        }
    
        const cleanData = customers.map(c => normalizeData(c)).filter(c => c.Customer_Name)
    
        if (cleanData.length === 0) {
            return { success: false, message: "ไม่พบข้อมูลที่ถูกต้อง (ต้องมีชื่อลูกค้า)" }
        }

        // Generate IDs and prepare for insert
        const customersToInsert = cleanData.map(c => {
             let customerId = c.Customer_ID as string
             if (!customerId) {
                const dateStr = new Date().toISOString().slice(2,7).replace('-','') // YYMM
                const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
                customerId = `CUST-${dateStr}-${random}-${Math.random().toString(36).substr(2, 3).toUpperCase()}`
             }
             
             return {
                Customer_ID: customerId,
                Customer_Name: String(c.Customer_Name || ''),
                Contact_Person: c.Contact_Person,
                Phone: c.Phone,
                Address: c.Address,
                Tax_ID: c.Tax_ID,
                Branch_ID: c.Branch_ID || branchId || 'HQ',
                Line_User_ID: c.Line_User_ID,
                Credit_Term: parseInt(c.Credit_Term as string) || 30,
                Price_Per_Unit: parseFloat(c.Price_Per_Unit as string) || 0
             }
        })

        // Check for existing customers to avoid duplicates by Name or ID
        const namesToCheck = customersToInsert.map(c => c.Customer_Name)
        const idsToCheck = customersToInsert.map(c => c.Customer_ID)
        
        const [{ data: existingByNames }, { data: existingByIds }] = await Promise.all([
            supabase.from('Master_Customers').select('Customer_Name').in('Customer_Name', namesToCheck),
            supabase.from('Master_Customers').select('Customer_ID').in('Customer_ID', idsToCheck)
        ])

        const existingNames = new Set(existingByNames?.map((c: { Customer_Name: string }) => c.Customer_Name) || [])
        const existingIds = new Set(existingByIds?.map((c: { Customer_ID: string }) => c.Customer_ID) || [])
        
        const validInserts = customersToInsert.filter(c => !existingNames.has(c.Customer_Name) && !existingIds.has(c.Customer_ID))

        if (validInserts.length === 0) {
            return { success: true, message: "ไม่มีข้อมูลใหม่ (รายชื่อหรือรหัสซ้ำกับที่มีอยู่ทั้งหมด)" }
        }

        const { error } = await supabase
            .from('Master_Customers')
            .insert(validInserts)

        if (error) {
            return { success: false, message: `Failed to import: ${error.message}` }
        }
    
        const skippedCount = customersToInsert.length - validInserts.length
        return { 
            success: true, 
            message: `นำเข้าสำเร็จ ${validInserts.length} รายการ` + (skippedCount > 0 ? ` (ข้ามซ้ำ ${skippedCount} รายการ)` : '')
        }

    } catch (e: unknown) {
        return { success: false, message: (e as Error).message }
    }
}


export async function getCustomer(customerId: string) {
    try {
        const isSuper = await isSuperAdmin()
        const isAdminUser = await isAdmin()
        const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
        
        const { data, error } = await supabase
            .from('Master_Customers')
            .select('*')
            .eq('Customer_ID', customerId)
            .single()
        
        if (error) return null
        return data as Customer
    } catch {
        return null
    }
}

export async function getCustomerName(customerId: string) {
    try {
        const supabase = await createAdminClient()
        const { data, error } = await supabase
            .from('Master_Customers')
            .select('Customer_Name')
            .eq('Customer_ID', customerId)
            .single()
        
        if (error) return null
        return data.Customer_Name
    } catch {
        return null
    }
}
