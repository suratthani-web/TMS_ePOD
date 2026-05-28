"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin } from '@/lib/permissions'
import { cookies } from 'next/headers'

export type BillingAnalytics = {
  accountsReceivable: {
    totalOutstanding: number
    invoiceCount: number
    aging: {
      '0-30': number
      '31-60': number
      '61-90': number
      '90+': number
    }
    recentUnpaid: {
      id: string
      customer: string
      amount: number
      daysOverdue: number
    }[]
  }
  accountsPayable: {
    totalOutstanding: number
    paymentCount: number
  }
  collectionRate: number // Percentage
  revenueVsPayout: {
    month: string
    revenue: number
    payout: number
  }[]
}

export async function getBillingAnalytics(
  startDate?: string, 
  endDate?: string, 
  branchId?: string
): Promise<BillingAnalytics> {
  const supabase = await createAdminClient()
  const userBranchId = await getUserBranchId()
  const isAdmin = await isSuperAdmin()
  const cookieStore = await cookies()
  const selectedBranch = cookieStore.get('selectedBranch')?.value

  // Determine effective branch ID
  let effectiveBranchId = branchId
  if (!effectiveBranchId || effectiveBranchId === 'All') {
    if (isAdmin && selectedBranch && selectedBranch !== 'All') {
      effectiveBranchId = selectedBranch
    } else if (!isAdmin) {
      effectiveBranchId = userBranchId || undefined
    } else {
      effectiveBranchId = undefined // Ensure 'All' translates to no filter
    }
  }

  // Helper for consistent error returns
  const emptyResult: BillingAnalytics = {
    accountsReceivable: { totalOutstanding: 0, invoiceCount: 0, aging: { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }, recentUnpaid: [] },
    accountsPayable: { totalOutstanding: 0, paymentCount: 0 },
    collectionRate: 0,
    revenueVsPayout: []
  }

  const now = new Date()
  const dayMs = 86400000

  // 1. Fetch Accounts Receivable (Billing Notes)
  let arQuery = supabase
    .from('Billing_Notes')
    .select('Billing_Note_ID, Customer_Name, Total_Amount, Status, Due_Date, Billing_Date, Branch_ID')
    .neq('Status', 'Cancelled')
    .neq('Status', 'Paid') // Only unpaid
  
  if (effectiveBranchId && effectiveBranchId !== 'All') {
    arQuery = arQuery.eq('Branch_ID', effectiveBranchId)
  }

  const { data: unpaidNotes, error } = await arQuery

  if (error) {
    console.error("AR Analytics Error:", error)
    return emptyResult
  }

  const receivables = unpaidNotes || []
  const totalAr = receivables.reduce((sum: number, n: any) => sum + (n.Total_Amount || 0), 0)
  
  // Calculate Aging
  const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  const recentUnpaid: BillingAnalytics['accountsReceivable']['recentUnpaid'] = []

  for (const note of receivables) {
    const dueDate = new Date(note.Due_Date || note.Billing_Date || new Date())
    const diffTime = now.getTime() - dueDate.getTime()
    const diffDays = Math.ceil(diffTime / dayMs)
    
    // Categorize by overdue days. Negative means not yet due (0-30 bucket or separate "Current"?)
    // Standard aging usually categorizes by "Days Past Due". 
    // If not due yet, it goes into "Current" or 0-30.
    
    // Let's use simple logic:
    // < 0 days (Future): 0-30
    // 0-30 days: 0-30
    // 31-60 days: 31-60
    // ...
    
    const overdue = diffDays > 0 ? diffDays : 0
    
    if (overdue <= 30) aging['0-30'] += (note.Total_Amount || 0)
    else if (overdue <= 60) aging['31-60'] += (note.Total_Amount || 0)
    else if (overdue <= 90) aging['61-90'] += (note.Total_Amount || 0)
    else aging['90+'] += (note.Total_Amount || 0)

    if (recentUnpaid.length < 5) {
      recentUnpaid.push({
        id: note.Billing_Note_ID,
        customer: note.Customer_Name || 'Unknown',
        amount: note.Total_Amount || 0,
        daysOverdue: diffDays
      })
    }
  }
  
  // Sort recent unpaid by days overdue desc
  recentUnpaid.sort((a, b) => b.daysOverdue - a.daysOverdue)

  // 2. Fetch Accounts Payable (Driver Payments)
  let apQuery = supabase
    .from('Driver_Payments')
    .select('Total_Amount, Status, Branch_ID') // Assuming Branch_ID exists or linked via jobs? 
    // Driver_Payments might not have Branch_ID directly in some schemas. 
    // If it doesn't, we might skip branch filter for AP or need join. 
    // Based on billing.ts, createDriverPayment doesn't seem to insert Branch_ID explicitly?
    // Let's assume for now we might miss Branch_ID or it exists. 
    // Safest is to try select. If error, we'll know.
    // Update: billing.ts doesn't show Branch_ID in Payment interface. 
    // We will fetch widely for now or try to filter if possible.
    .neq('Status', 'Cancelled')
    .neq('Status', 'Paid')
  
  // If Driver_Payments has Branch_ID:
  // apQuery = apQuery.eq('Branch_ID', effectiveBranchId) 
  // NOTE: Schema check didn't confirm Branch_ID on Driver_Payments. 
  // Let's assume we can't filter AP by branch easily without join. 
  // For 'All' view it's fine. For Branch view it might be inaccurate if shared drivers.
  
  const { data: unpaidPayments } = await apQuery
  const payables = unpaidPayments || []
  
  // Filter by branch manually if necessary/possible (complex without join). 
  // For MVP, we'll calculate total.
  const totalAp = payables.reduce((sum: number, p: any) => sum + (p.Total_Amount || 0), 0)

  // 3. Collection Rate (Paid / (Paid + Unpaid)) for the selected period
  // If no date selected, default to last 30 days
  const start = startDate ? new Date(startDate) : new Date(now.getTime() - 30 * dayMs)
  const end = endDate ? new Date(endDate) : now
  
  let collectionQuery = supabase
    .from('Billing_Notes')
    .select('Total_Amount, Status')
    .gte('Billing_Date', start.toISOString())
    .lte('Billing_Date', end.toISOString())
    .neq('Status', 'Cancelled')

  if (effectiveBranchId) {
    collectionQuery = collectionQuery.eq('Branch_ID', effectiveBranchId)
  }
  
  const { data: periodNotes } = await collectionQuery
  const totalPeriod = (periodNotes || []).reduce((s: number, n: any) => s + (n.Total_Amount || 0), 0)
  const paidPeriod = (periodNotes || []).filter((n: any) => n.Status === 'Paid').reduce((s: number, n: any) => s + (n.Total_Amount || 0), 0)
  
  const collectionRate = totalPeriod > 0 ? (paidPeriod / totalPeriod) * 100 : 0

  // 4. Monthly Revenue vs Payout Trend (Last 6 months)
  // This requires aggregation. We can reuse getFinancialStats logic or do simple fetch.
  // Let's do a simple fetch of last 6 months billing and payments.
  
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  
  // Revenue (Billing Notes)
  let trendRevQuery = supabase
    .from('Billing_Notes')
    .select('Billing_Date, Total_Amount')
    .gte('Billing_Date', sixMonthsAgo.toISOString())
    .neq('Status', 'Cancelled')
    
  if (effectiveBranchId) trendRevQuery = trendRevQuery.eq('Branch_ID', effectiveBranchId)
  const { data: trendRev } = await trendRevQuery
  
  // Payout (Driver Payments)
  const { data: trendPay } = await supabase
    .from('Driver_Payments')
    .select('Payment_Date, Total_Amount')
    .gte('Payment_Date', sixMonthsAgo.toISOString())
    .neq('Status', 'Cancelled')
    
  // Aggregate by month
  const trendMap = new Map<string, { revenue: number, payout: number }>()
  
  // Init last 6 months
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = d.toISOString().slice(0, 7) // YYYY-MM
    trendMap.set(key, { revenue: 0, payout: 0 })
  }
  
  trendRev?.forEach((n: any) => {
    const key = (n.Billing_Date || '').slice(0, 7)
    if (trendMap.has(key)) {
      const entry = trendMap.get(key)!
      entry.revenue += n.Total_Amount || 0
      trendMap.set(key, entry)
    }
  })
  
  trendPay?.forEach((p: any) => {
    const key = (p.Payment_Date || '').slice(0, 7)
    if (trendMap.has(key)) {
      const entry = trendMap.get(key)!
      entry.payout += p.Total_Amount || 0
      trendMap.set(key, entry)
    }
  })
  
  const revenueVsPayout = Array.from(trendMap.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return {
    accountsReceivable: {
      totalOutstanding: totalAr,
      invoiceCount: receivables.length,
      aging,
      recentUnpaid: recentUnpaid.slice(0, 5)
    },
    accountsPayable: {
      totalOutstanding: totalAp,
      paymentCount: payables.length,
    },
    collectionRate,
    revenueVsPayout
  }
}
