'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getUserBranchId, isSuperAdmin } from '@/lib/permissions'
import { Vehicle } from "@/lib/supabase/vehicles"

export type VehicleFormData = {
  Vehicle_Plate: string
  Vehicle_Type: string
  Brand: string
  Model: string
  Active_Status: string
  Current_Mileage?: number
  Next_Service_Mileage?: number
  Tax_Expiry?: string
  Insurance_Expiry?: string
  Act_Expiry?: string
  Branch_ID?: string
  Sub_ID?: string
  Max_Weight_kg?: number
  Max_Volume_cbm?: number
  is_chassis?: boolean
}

export async function createVehicle(data: VehicleFormData) {
  const supabase = createAdminClient()
  const userBranchId = await getUserBranchId()
  const isAdmin = await isSuperAdmin()

  const finalBranchId = (isAdmin && data.Branch_ID) ? data.Branch_ID : userBranchId
  
  // Helper to convert empty strings to null for optional fields
  const emptyToNull = (val: string | undefined | null) => (val === '' || val === undefined) ? null : val;
  const numOrNull = (val: number | undefined | null) => (val === undefined || isNaN(Number(val))) ? null : Number(val);

  const { error } = await supabase
    .from('Master_Vehicles')
    .upsert({
      Vehicle_Plate: data.Vehicle_Plate,
      Vehicle_Type: data.Vehicle_Type,
      Brand: data.Brand,
      Model: data.Model,
      Active_Status: 'Active',
      Current_Mileage: data.Current_Mileage || 0,
      Next_Service_Mileage: data.Next_Service_Mileage || 0,
      Tax_Expiry: emptyToNull(data.Tax_Expiry),
      Insurance_Expiry: emptyToNull(data.Insurance_Expiry),
      Act_Expiry: emptyToNull(data.Act_Expiry),
      Sub_ID: data.Sub_ID || null,
      Max_Weight_kg: numOrNull(data.Max_Weight_kg),
      Max_Volume_cbm: numOrNull(data.Max_Volume_cbm),
      is_chassis: data.is_chassis || false,
      Branch_ID: finalBranchId
    }, { onConflict: 'Vehicle_Plate' })

  if (error) {
    return { success: false, message: 'Failed to create vehicle: ' + error.message }
  }

  revalidatePath('/vehicles')
  return { success: true, message: 'Vehicle created successfully' }
}

export async function createBulkVehicles(vehicles: Record<string, unknown>[]) {
  const supabase = createAdminClient()
  const branchId = await getUserBranchId()

  // Helper to normalize keys
  const normalizeData = (row: Record<string, unknown>) => {
    const normalized: Partial<Vehicle> = {}
    
    // Helper to find value by possible keys (case-insensitive)
    const getValue = (keys: string[]) => {
      const rowKeys = Object.keys(row)
      for (const key of keys) {
        const foundKey = rowKeys.find(k => k.toLowerCase().replace(/\s+/g, '') === key.toLowerCase().replace(/\s+/g, ''))
        const rowAsRecord = row as unknown as Record<string, unknown>
        if (foundKey && rowAsRecord[foundKey] !== undefined && rowAsRecord[foundKey] !== null) {
          return rowAsRecord[foundKey]
        }
      }
      return undefined
    }

    // Mapping rules
    normalized.Vehicle_Plate = getValue(['vehicle_plate', 'plate', 'ทะเบียน', 'ทะเบียนรถ', 'license_plate', 'licenseplate', 'Vehicle_Plate']) as string
    normalized.Vehicle_Type = (getValue(['vehicle_type', 'type', 'ประเภท', 'ประเภทรถ', 'vehicletype', 'Vehicle_Type']) as string) || '4-Wheel'
    normalized.Brand = getValue(['brand', 'make', 'ยี่ห้อ', 'Brand']) as string
    normalized.Model = getValue(['model', 'รุ่น', 'Model']) as string
    normalized.Active_Status = (getValue(['active_status', 'status', 'สถานะ', 'Active_Status']) as string) || 'Active'
    normalized.Current_Mileage = (getValue(['current_mileage', 'mileage', 'เลขไมล์', 'currentmileage', 'Current_Mileage']) as number) || 0
    normalized.Next_Service_Mileage = (getValue(['next_service_mileage', 'next_service', 'เช็คระยะถัดไป', 'nextservicemileage', 'nextservice', 'Next_Service_Mileage']) as number) || 0
    
    // Compliance Dates
    normalized.Tax_Expiry = getValue(['tax_expiry', 'tax_date', 'ภาษี', 'วันหมดอายุภาษี', 'Tax_Expiry']) as string
    normalized.Insurance_Expiry = getValue(['insurance_expiry', 'insurance_date', 'ประกันภัย', 'วันหมดอายุประกัน', 'Insurance_Expiry']) as string
    normalized.Act_Expiry = getValue(['act_expiry', 'act_date', 'พรบ', 'วันหมดอายุพรบ', 'Act_Expiry']) as string
    
    // Specs
    normalized.Max_Weight_kg = getValue(['max_weight_kg', 'max_weight', 'น้ำหนักบรรทุก', 'capacity_kg', 'Max_Weight_kg']) as number
    normalized.Max_Volume_cbm = getValue(['max_volume_cbm', 'max_volume', 'ปริมาตรบรรทุก', 'capacity_cbm', 'Max_Volume_cbm']) as number
    
    // Entity
    normalized.Sub_ID = getValue(['sub_id', 'subcontractor_id', 'รหัสผู้รับเหมา', 'รหัสรถร่วม', 'Sub_ID']) as string
    
    // Chassis Flag
    normalized.is_chassis = getValue(['is_chassis', 'chassis', 'หางลาก', 'เป็นหางลาก']) as any
    
    // Keep internal fields
    const rowAsRecord = row as unknown as Record<string, unknown>
    if (rowAsRecord.Branch_ID) normalized.Branch_ID = rowAsRecord.Branch_ID as string

    return normalized
  }

  // Prepare data
  const cleanData = vehicles.map(v => {
    const data = normalizeData(v)
    return {
      Vehicle_Plate: data.Vehicle_Plate ? String(data.Vehicle_Plate).trim() : null,
      Vehicle_Type: data.Vehicle_Type,
      Brand: data.Brand,
      Model: data.Model,
      Active_Status: data.Active_Status,
      Current_Mileage: Number(data.Current_Mileage) || 0,
      Next_Service_Mileage: Number(data.Next_Service_Mileage) || 0,
      Tax_Expiry: data.Tax_Expiry || null,
      Insurance_Expiry: data.Insurance_Expiry || null,
      Act_Expiry: data.Act_Expiry || null,
      Max_Weight_kg: Number(data.Max_Weight_kg) || null,
      Max_Volume_cbm: Number(data.Max_Volume_cbm) || null,
      Sub_ID: data.Sub_ID || null,
      is_chassis: data.is_chassis === true || (data.is_chassis as any) === 'true' || (data.is_chassis as any) === 'Yes',
      Branch_ID: branchId
    }
  }).filter(v => v.Vehicle_Plate) // Filter out rows without active_status or vehicle_plate

  // Deduplicate input data by vehicle_plate
  const uniqueData = Array.from(new Map(cleanData.map(item => [item.Vehicle_Plate, item])).values())


  if (uniqueData.length === 0) {
     return { success: false, message: 'ไม่พบข้อมูลที่ถูกต้อง (กรุณาตรวจสอบชื่อคอลัมน์ เช่น ทะเบียนรถ, ยี่ห้อ, รุ่น)' }
  }

  // Use upsert to handle duplicates (update existing or insert new)
  const { error } = await supabase
    .from('Master_Vehicles')
    .upsert(uniqueData, { 
      onConflict: 'Vehicle_Plate',
      ignoreDuplicates: false // Update if exists
    })
    .select()

  if (error) {
    return { success: false, message: `นำเข้าไม่สำเร็จ: ${error.message}` }
  }

  revalidatePath('/vehicles')
  return { success: true, message: `นำเข้าข้อมูลสำเร็จ ${uniqueData.length} รายการ` }
}

export async function updateVehicle(plate: string, data: Partial<VehicleFormData>) {
  const supabase = createAdminClient()
  const branchId = await getUserBranchId()
  const isAdmin = await isSuperAdmin()

    const updatePayload: Partial<Vehicle> = {
        Vehicle_Type: data.Vehicle_Type,
        Brand: data.Brand,
        Model: data.Model,
        Active_Status: data.Active_Status,
        Current_Mileage: data.Current_Mileage,
        Next_Service_Mileage: data.Next_Service_Mileage,
        Tax_Expiry: data.Tax_Expiry || null,
        Insurance_Expiry: data.Insurance_Expiry || null,
        Act_Expiry: data.Act_Expiry || null,
        Sub_ID: data.Sub_ID || null,
        Max_Weight_kg: data.Max_Weight_kg,
        Max_Volume_cbm: data.Max_Volume_cbm,
        is_chassis: data.is_chassis
    }

    if (isAdmin && data.Branch_ID) {
        updatePayload.Branch_ID = data.Branch_ID
    }

    let query = supabase
      .from('Master_Vehicles')
      .update(updatePayload)
  
  query = query.eq('Vehicle_Plate', plate)

  if (branchId && !isAdmin) {
      query = query.eq('Branch_ID', branchId)
  }

  const { error } = await query

  if (error) {
    return { success: false, message: 'Failed to update vehicle' }
  }

  revalidatePath('/vehicles')
  return { success: true, message: 'Vehicle updated successfully' }
}

export async function deleteVehicle(plate: string) {
  const supabase = createAdminClient()
  const branchId = await getUserBranchId()
  const isAdmin = await isSuperAdmin()

  let query = supabase
    .from('Master_Vehicles')
    .delete()
    .eq('Vehicle_Plate', plate)

  if (branchId && !isAdmin) {
      query = query.eq('Branch_ID', branchId)
  }

  const { error } = await query

  if (error) {
    return { success: false, message: 'Failed to delete vehicle' }
  }

  revalidatePath('/vehicles')
  return { success: true, message: 'Vehicle deleted successfully' }
}
