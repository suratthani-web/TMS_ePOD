'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { createSession, getSession } from '@/lib/session'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function portalLogin(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const accessCode = String(formData.get('access_code') || '').trim()

  if (!email && !accessCode) {
    return { error: 'กรุณาระบุอีเมลหรือรหัสลูกค้า' }
  }

  const supabase = createAdminClient()

  // Look up customer by email OR Customer_ID
  const { data: customer, error } = await supabase
    .from('Master_Customers')
    .select('Customer_ID, Customer_Name, Email, Branch_ID, Portal_Access_Code')
    .or(
      [
        email ? `Email.ilike.${email}` : null,
        accessCode ? `Customer_ID.eq.${accessCode}` : null,
        accessCode ? `Portal_Access_Code.eq.${accessCode}` : null,
      ].filter(Boolean).join(',')
    )
    .maybeSingle()

  if (error || !customer) {
    return { error: 'ไม่พบข้อมูลลูกค้า กรุณาตรวจสอบอีเมลหรือรหัสลูกค้า' }
  }

  // Create a customer session (role 7 = Customer)
  await createSession(
    customer.Customer_ID,
    7,
    customer.Branch_ID || null,
    customer.Customer_Name || customer.Customer_ID,
    customer.Customer_ID
  )

  redirect('/portal/jobs')
}

export async function portalLogout() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
  redirect('/portal/login')
}

export async function getPortalCustomerJobs(page = 1, limit = 20, status?: string, search?: string) {
  const session = await getSession()
  if (!session?.customerId) return { jobs: [], total: 0 }

  const supabase = createAdminClient()
  const offset = (page - 1) * limit

  let query = supabase
    .from('Jobs_Main')
    .select('Job_ID, Job_Status, Plan_Date, Delivery_Date, Origin_Location, Dest_Location, Route_Name, Vehicle_Plate, Driver_Name, Price_Cust_Total, Photo_Proof_Url, Signature_Url, Cargo_Type, Notes, Customer_Name', { count: 'exact' })
    .eq('Customer_ID', session.customerId)
    .order('Plan_Date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') query = query.eq('Job_Status', status)
  if (search) query = query.or(`Job_ID.ilike.%${search}%,Origin_Location.ilike.%${search}%,Dest_Location.ilike.%${search}%`)

  const { data, count, error } = await query
  if (error) return { jobs: [], total: 0 }

  return { jobs: data || [], total: count || 0 }
}
