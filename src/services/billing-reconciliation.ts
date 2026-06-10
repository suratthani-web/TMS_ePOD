"use server"

import { createAdminClient } from "@/lib/supabase/admin";

export interface ReconcileIssue {
  jobId: string;
  customerName: string;
  planDate: string;
  completedAt: string;
  daysPending: number;
  price: number;
  branchId: string;
}

/**
 * BillingReconciliationService - Finds jobs that are completed but not yet billed.
 */
export async function getUnbilledCompletedJobs(branchId?: string, customerId?: string): Promise<ReconcileIssue[]> {
  const supabase = createAdminClient();
  
  // Find jobs: Completed but no Invoice_ID and no Billing_Note_ID
  let query = supabase
    .from('Jobs_Main')
    .select('Job_ID, Customer_Name, Plan_Date, Delivery_Date, Price_Cust_Total, Branch_ID')
    .eq('Job_Status', 'Completed')
    .is('Invoice_ID', null)
    .is('Billing_Note_ID', null)
    .order('Delivery_Date', { ascending: true });

  if (branchId && branchId !== 'All') {
    query = query.eq('Branch_ID', branchId);
  }

  if (customerId && customerId !== 'All') {
    query = query.eq('Customer_ID', customerId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const now = new Date();
  
  return data.map(job => {
    const deliveryDate = new Date(job.Delivery_Date || job.Plan_Date || now);
    const diffTime = Math.abs(now.getTime() - deliveryDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      jobId: job.Job_ID,
      customerName: job.Customer_Name || 'Unknown',
      planDate: job.Plan_Date || 'N/A',
      completedAt: job.Delivery_Date || job.Plan_Date || 'N/A',
      daysPending: diffDays,
      price: job.Price_Cust_Total || 0,
      branchId: job.Branch_ID || 'HQ'
    };
  });
}

/**
 * Summary for dashboard.
 */
export async function getReconciliationSummary(branchId?: string, customerId?: string) {
    const issues = await getUnbilledCompletedJobs(branchId, customerId);
    
    return {
        count: issues.length,
        totalValue: issues.reduce((sum, i) => sum + i.price, 0),
        oldestDays: issues.length > 0 ? Math.max(...issues.map(i => i.daysPending)) : 0,
        criticalCount: issues.filter(i => i.daysPending > 7).length // More than a week old
    };
}
