'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getUserBranchId, isSuperAdmin, isAdmin } from '@/lib/permissions'

export type DriverFormData = {
  Driver_ID: string
  Driver_Name: string
  Mobile_No: string
  Password?: string
  Vehicle_Plate: string
  Active_Status: string
  Sub_ID?: string
  Branch_ID?: string
  Bank_Name?: string
  Bank_Account_No?: string
  Bank_Account_Name?: string
}

export async function createDriver(data: DriverFormData) {
  const supabase = createAdminClient()
  const userBranchId = await getUserBranchId()
  const isSuper = await isSuperAdmin()
  const finalBranchId = (isSuper && data.Branch_ID && data.Branch_ID !== 'All') ? data.Branch_ID : userBranchId



  const { error } = await supabase
    .from('Master_Drivers')
    .insert({
      Driver_ID: data.Driver_ID,
      Driver_Name: data.Driver_Name,
      Mobile_No: data.Mobile_No,
      Password: data.Password || '123456', // Default password if missing
      Vehicle_Plate: data.Vehicle_Plate || null,
      Vehicle_Type: '4-Wheel', // Default
      Role: 'Driver',
      Active_Status: 'Active',
      Sub_ID: data.Sub_ID || null, // Fix: Convert empty string to null
      Bank_Name: data.Bank_Name || null,
      Bank_Account_No: data.Bank_Account_No || null,
      Bank_Account_Name: data.Bank_Account_Name || null,
      Branch_ID: finalBranchId
    })

  if (error) {
    return { success: false, message: `Failed to create driver: ${error.message} ${error.details || ''}` }
  }

  revalidatePath('/drivers')
  return { success: true, message: 'Driver created successfully' }
}

export async function createBulkDrivers(drivers: any[]) {
  const isAdminUser = await isAdmin()
  if (!isAdminUser) {
    return { success: false, message: 'คุณไม่มีสิทธิ์ในการนำเข้าข้อมูล (Admin access required)' }
  }

  const supabase = await createAdminClient()
  const currentBranchId = await getUserBranchId()
  const isSuper = await isSuperAdmin()

  // Fetch valid subcontractors to prevent FK violations
  const { data: validSubs } = await supabase.from('Master_Subcontractors').select('Sub_ID')
  const validSubSet = new Set(validSubs?.map((s: { Sub_ID: string }) => s.Sub_ID) || [])

  // Helper to normalize keys
  const normalizeData = (row: any) => {
    const normalized: any = {}
    
    const getValue = (keys: string[]) => {
      const rowKeys = Object.keys(row)
      for (const key of keys) {
        const foundKey = rowKeys.find(k => k.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase().replace(/\s+/g, '_'))
        const rowAsRecord = row as unknown as Record<string, unknown>
        if (foundKey && rowAsRecord[foundKey] !== undefined && rowAsRecord[foundKey] !== null) {
          return rowAsRecord[foundKey]
        }
      }
      return undefined
    }

    // Mapping rules
    normalized.Driver_ID = getValue(['Driver_ID', 'id', 'รหัสพนักงาน', 'รหัส']) as string
    normalized.Driver_Name = getValue(['Driver_Name', 'name', 'ชื่อ-นามสกุล', 'ชื่อนามสกุล', 'ชื่อ']) as string
    normalized.Mobile_No = getValue(['Mobile_No', 'phone', 'mobile', 'เบอร์โทร', 'เบอร์โทรศัพท์']) as string
    normalized.Password = getValue(['Password', 'pass', 'รหัสผ่าน']) as string
    normalized.Vehicle_Plate = getValue(['Vehicle_Plate', 'plate', 'ทะเบียนรถ', 'ทะเบียน']) as string
    normalized.Expire_Date = getValue(['Expire_Date', 'License_Expiry', 'License_Expirry', 'license_date', 'วันหมดอายุใบขับขี่']) as string
    normalized.Sub_ID = getValue(['Sub_ID', 'subcontractor_id', 'รหัสผู้รับเหมา', 'รหัสรถร่วม']) as string
    normalized.Branch_ID = getValue(['Branch_ID', 'branch', 'สาขา', 'รหัสสาขา']) as string
    normalized.Bank_Name = getValue(['Bank_Name', 'bank', 'ธนาคาร']) as string
    normalized.Bank_Account_No = getValue(['Bank_Account_No', 'account_no', 'เลขบัญชี']) as string
    normalized.Bank_Account_Name = getValue(['Bank_Account_Name', 'account_name', 'ชื่อบัญชี']) as string
    
    return normalized
  }
  
  // Prepare data with defaults
  const cleanData = drivers.map(d => {
    const data = normalizeData(d)
    
    // Smart Branch ID: 
    // 1. If Super Admin and Branch_ID provided in row, use it.
    // 2. Otherwise, use user's current branch (if not 'All').
    // 3. Fallback to HQ.
    const finalBranchId = (isSuper && data.Branch_ID && data.Branch_ID !== 'All') 
                            ? data.Branch_ID 
                            : (currentBranchId !== 'All' ? currentBranchId : 'HQ')


    return {
      Driver_ID: data.Driver_ID || `DRV-${Math.floor(Math.random()*100000)}`,
      Driver_Name: data.Driver_Name ? String(data.Driver_Name).trim() : null,
      Mobile_No: data.Mobile_No ? String(data.Mobile_No).trim() : null,
      Password: data.Password || '123456',
      Vehicle_Plate: data.Vehicle_Plate || null,
      Vehicle_Type: '4-Wheel',
      Role: 'Driver',
      Active_Status: 'Active',
      Expire_Date: data.Expire_Date || null,
      Sub_ID: (data.Sub_ID && String(data.Sub_ID).trim() !== '' && validSubSet.has(String(data.Sub_ID).trim())) 
                ? String(data.Sub_ID).trim() 
                : null,
      Bank_Name: data.Bank_Name || null,
      Bank_Account_No: data.Bank_Account_No || null,
      Bank_Account_Name: data.Bank_Account_Name || null,
      Branch_ID: finalBranchId
    }
  }).filter(d => d.Driver_Name && d.Mobile_No) // Ensure essential fields exist

  if (cleanData.length === 0) {
     return { success: false, message: 'ไม่พบข้อมูลพนักงานที่ถูกต้อง (กรุณาระบุชื่อและเบอร์โทร)' }
  }

  const { error } = await supabase
    .from('Master_Drivers')
    .upsert(cleanData, { onConflict: 'Driver_ID' })

  if (error) {
    return { success: false, message: `นำเข้าไม่สำเร็จ: ${error.message}` }
  }

  revalidatePath('/drivers')
  return { success: true, message: `นำเข้าข้อมูลสำเร็จ ${cleanData.length} รายการ` }
}

export async function updateDriver(driverId: string, data: Partial<DriverFormData>) {
  const supabase = createAdminClient()
  const branchId = await getUserBranchId()
  const isAdmin = await isSuperAdmin()

  const updateData: Record<string, unknown> = {
    Driver_Name: data.Driver_Name,
    Mobile_No: data.Mobile_No,
    Vehicle_Plate: data.Vehicle_Plate,
    Active_Status: data.Active_Status,
    Sub_ID: data.Sub_ID || null, // Fix: Convert empty string to null
    Bank_Name: data.Bank_Name || null,
    Bank_Account_No: data.Bank_Account_No || null,
    Bank_Account_Name: data.Bank_Account_Name || null,
  }

  if (isAdmin && data.Branch_ID) {
    updateData.Branch_ID = data.Branch_ID
  }



  // Allow updating the Driver_ID (Primary Key)
  // This will work if ON UPDATE CASCADE is set on foreign keys in Supabase
  if (data.Driver_ID && data.Driver_ID !== driverId) {
    updateData.Driver_ID = data.Driver_ID
  }

  // Only update password if provided
  if (data.Password && data.Password.trim() !== '') {
    updateData.Password = data.Password
  }

  try {
    let query = supabase
      .from('Master_Drivers')
      .update(updateData)
      .eq('Driver_ID', driverId)

    if (branchId && !isAdmin) {
        query = query.eq('Branch_ID', branchId)
    }



    const { error } = await query

    if (error) {
      return { success: false, message: `Failed to update driver: ${error.message} ${error.details || ''}` }
    }
  } catch (error: unknown) {
    return { success: false, message: error instanceof Error ? error.message : 'Database error' }
  }

  revalidatePath('/drivers')
  return { success: true, message: 'Driver updated successfully' }
}

export async function deleteDriver(driverId: string) {
  const supabase = createAdminClient()
  const branchId = await getUserBranchId()
  const isAdmin = await isSuperAdmin()

  let query = supabase
    .from('Master_Drivers')
    .delete()
    .eq('Driver_ID', driverId)

  if (branchId && !isAdmin) {
      query = query.eq('Branch_ID', branchId)
  }



  const { error } = await query

  if (error) {
    return { success: false, message: `Failed to delete driver: ${error.message} ${error.details || ''}` }
  }

  revalidatePath('/drivers')
  return { success: true, message: 'Driver deleted successfully' }
}
