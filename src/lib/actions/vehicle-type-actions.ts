'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export type VehicleType = {
  type_id: number
  type_name: string
  description: string | null
  active_status: string
  created_at?: string
}

import { isAdmin } from '@/lib/permissions'
import { requireAdmin } from '@/services/permission-guards'

export async function getVehicleTypes() {
  const adminStatus = await isAdmin()
  const supabase = adminStatus ? createAdminClient() : await createClient()
  
  const { data, error } = await supabase
    .from('Master_Vehicle_Types')
    .select('*')
    .order('type_id', { ascending: true })

  if (error) {
    return []
  }

  return data as VehicleType[]
}

export async function createVehicleType(data: { type_name: string; description?: string }) {
  await requireAdmin()
  const supabase = createAdminClient()

  // Removed duplicate name check to allow variants in the description as requested.

  const { error } = await supabase
    .from('Master_Vehicle_Types')
    .insert({
      type_name: data.type_name,
      description: data.description || null,
      active_status: 'Active'
    })

  if (error) {
    return { success: false, message: `Failed to create: ${error.message}` }
  }

  revalidatePath('/settings/vehicle-types')
  revalidatePath('/vehicles') // Update vehicle dialog
  return { success: true, message: 'เพิ่มประเภทรถสำเร็จ' }
}

export async function updateVehicleType(id: number, data: { type_name: string; description?: string; active_status?: string }) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('Master_Vehicle_Types')
    .update({
      type_name: data.type_name,
      description: data.description,
      active_status: data.active_status
    })
    .eq('type_id', id)

  if (error) {
    return { success: false, message: `Failed to update: ${error.message}` }
  }

  revalidatePath('/settings/vehicle-types')
  revalidatePath('/vehicles')
  return { success: true, message: 'บันทึกข้อมูลสำเร็จ' }
}

export async function deleteVehicleType(id: number) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('Master_Vehicle_Types')
    .delete()
    .eq('type_id', id)

  if (error) {
    return { success: false, message: `Failed to delete: ${error.message}` }
  }

  revalidatePath('/settings/vehicle-types')
  revalidatePath('/vehicles')
  return { success: true, message: 'ลบข้อมูลสำเร็จ' }
}

/**
 * Create multiple vehicle types in bulk
 */
export async function createBulkVehicleTypes(types: Partial<VehicleType>[]) {
    try {
        await requireAdmin()
        const supabase = createAdminClient()

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

            normalized.type_name = getValue(['type_name', 'name', 'ประเภทรถ', 'ชื่อประเภทรถ'])
            normalized.description = getValue(['description', 'desc', 'รายละเอียด', 'คำอธิบาย'])
            normalized.active_status = getValue(['active_status', 'status', 'สถานะ']) || 'Active'

            return normalized
        }

        const cleanData = types.map(t => {
            const data = normalizeData(t)
            return {
                type_name: data.type_name,
                description: data.description || null,
                active_status: data.active_status
            }
        }).filter(t => t.type_name)

        if (cleanData.length === 0) {
            return { success: false, message: 'ไม่พบข้อมูลที่ถูกต้อง (ต้องระบุชื่อประเภทรถ)' }
        }

        const { error } = await supabase
            .from("Master_Vehicle_Types")
            .upsert(cleanData, { onConflict: 'type_name' })

        if (error) throw error
        
        revalidatePath("/settings/vehicle-types")
        revalidatePath("/vehicles")
        return { success: true, message: `นำเข้าประเภทรถ ${cleanData.length} รายการสำเร็จ` }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message }
    }
}
