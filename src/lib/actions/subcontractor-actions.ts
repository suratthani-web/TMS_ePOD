"use server"

import { createClient, createAdminClient } from "@/utils/supabase/server"
import { requireAdmin } from "@/services/permission-guards"
import { revalidatePath } from "next/cache"
import { Subcontractor } from "@/types/subcontractor"
import { isAdmin } from "@/lib/permissions"

export async function createSubcontractor(data: Partial<Subcontractor>) {
    try {
        if (!data.Sub_ID || !data.Sub_Name) {
            throw new Error("Missing Sub_ID or Sub_Name")
        }

        const adminStatus = await isAdmin()
        if (adminStatus) {
            await requireAdmin()
        }
        const supabase = adminStatus ? createAdminClient() : await createClient()
        const { error } = await supabase
            .from("Master_Subcontractors")
            .insert([{
                Sub_ID: data.Sub_ID,
                Sub_Name: data.Sub_Name,
                Tax_ID: data.Tax_ID,
                Bank_Name: data.Bank_Name,
                Bank_Account_No: data.Bank_Account_No,
                Bank_Account_Name: data.Bank_Account_Name,
                Branch_ID: data.Branch_ID,
                Active_Status: data.Active_Status || 'Active'
            }])

        if (error) throw error
        
        revalidatePath("/settings/subcontractors")
        return { success: true }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message }
    }
}

export async function updateSubcontractor(id: string, data: Partial<Subcontractor>) {
    try {
        const adminStatus = await isAdmin()
        if (adminStatus) {
            await requireAdmin()
        }
        const supabase = adminStatus ? createAdminClient() : await createClient()
        const { error } = await supabase
            .from("Master_Subcontractors")
            .update(data)
            .eq("Sub_ID", id)

        if (error) throw error
        
        revalidatePath("/settings/subcontractors")
        return { success: true }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message }
    }
}

export async function deleteSubcontractor(id: string) {
    try {
        const adminStatus = await isAdmin()
        if (adminStatus) {
            await requireAdmin()
        }
        const supabase = adminStatus ? createAdminClient() : await createClient()
        const { error } = await supabase
            .from("Master_Subcontractors")
            .delete()
            .eq("Sub_ID", id)

        if (error) throw error
        
        revalidatePath("/settings/subcontractors")
        return { success: true }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message }
    }
}

/**
 * Create multiple subcontractors in bulk
 */
export async function createBulkSubcontractors(subcontractors: Partial<Subcontractor>[]) {
    try {
        const adminStatus = await isAdmin()
        if (adminStatus) {
            await requireAdmin()
        }
        const supabase = adminStatus ? createAdminClient() : await createClient()

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

            normalized.Sub_ID = getValue(['Sub_ID', 'id', 'รหัสผู้รับเหมาช่วง', 'รหัสซับ'])
            normalized.Sub_Name = getValue(['Sub_Name', 'name', 'ชื่อผู้รับเหมาช่วง', 'ชื่อซับ'])
            normalized.Tax_ID = getValue(['Tax_ID', 'tax', 'เลขผู้เสียภาษี'])
            normalized.Bank_Name = getValue(['Bank_Name', 'bank', 'ธนาคาร'])
            normalized.Bank_Account_No = getValue(['Bank_Account_No', 'account_no', 'เลขบัญชี'])
            normalized.Bank_Account_Name = getValue(['Bank_Account_Name', 'account_name', 'ชื่อบัญชี'])
            normalized.Branch_ID = getValue(['Branch_ID', 'branch', 'สาขา', 'รหัสสาขา'])
            normalized.Active_Status = getValue(['Active_Status', 'status', 'สถานะ']) || 'Active'

            return normalized
        }

        const cleanData = subcontractors.map(s => {
            const data = normalizeData(s)
            return {
                Sub_ID: data.Sub_ID,
                Sub_Name: data.Sub_Name,
                Tax_ID: data.Tax_ID || null,
                Bank_Name: data.Bank_Name || null,
                Bank_Account_No: data.Bank_Account_No || null,
                Bank_Account_Name: data.Bank_Account_Name || null,
                Branch_ID: data.Branch_ID || null,
                Active_Status: data.Active_Status
            }
        }).filter(s => s.Sub_ID && s.Sub_Name)

        if (cleanData.length === 0) {
            return { success: false, message: 'ไม่พบข้อมูลที่ถูกต้อง (ต้องระบุรหัสและชื่อบริษัท)' }
        }

        const { error } = await supabase
            .from("Master_Subcontractors")
            .upsert(cleanData, { onConflict: 'Sub_ID' })

        if (error) throw error
        
        revalidatePath("/settings/subcontractors")
        return { success: true, message: `นำเข้าข้อมูลซับคอนแทรคเตอร์ ${cleanData.length} รายสำเร็จ` }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message }
    }
}
