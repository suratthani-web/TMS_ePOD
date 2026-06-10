"use server"

import { createAdminClient } from "@/lib/supabase/admin";
import { calculateJobPrice } from "./pricing-engine";

export interface HealthIssue {
  jobId: string;
  planDate?: string;
  customerName?: string;
  issueType: 'MISSING_POD' | 'MISSING_PRICE' | 'PRICE_MISMATCH' | 'MISSING_MASTER_DATA' | 'BRANCH_MISMATCH';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  description: string;
  details?: unknown;
}

/**
 * OperationsHealthService - Identifies data quality issues and operational anomalies.
 */
export async function getOperationsHealth(branchId?: string, customerId?: string): Promise<HealthIssue[]> {
  const supabase = createAdminClient();
  const issues: HealthIssue[] = [];

  // 1. Fetch recent active/completed jobs
  let query = supabase
    .from('Jobs_Main')
    .select('*, Verification_Status')
    .order('Created_At', { ascending: false })
    .limit(500);

  if (branchId && branchId !== 'All') {
    query = query.eq('Branch_ID', branchId);
  }

  if (customerId && customerId !== 'All') {
    query = query.eq('Customer_ID', customerId);
  }

  const { data: jobs, error } = await query;
  if (error || !jobs) return [];

  for (const job of jobs) {
    // SKIP jobs that are already verified or bypassed
    if (job.Verification_Status === 'Verified') continue;

    const status = job.Job_Status;

    // ISSUE: Missing POD Proof
    if ((status === 'Completed' || status === 'Delivered') && !job.Photo_Proof_Url && !job.Signature_Url) {
      issues.push({
        jobId: job.Job_ID,
        planDate: job.Plan_Date,
        customerName: job.Customer_Name,
        issueType: 'MISSING_POD',
        severity: 'CRITICAL',
        description: "งานสำเร็จแล้วแต่ไม่มีหลักฐาน (รูปถ่ายหรือลายเซ็น)"
      });
    }

    // ISSUE: Missing Price on Billed Jobs
    if (status === 'Billed' && (!job.Price_Cust_Total || Number(job.Price_Cust_Total) <= 0)) {
      issues.push({
        jobId: job.Job_ID,
        planDate: job.Plan_Date,
        customerName: job.Customer_Name,
        issueType: 'MISSING_PRICE',
        severity: 'CRITICAL',
        description: "งานวางบิลแล้วแต่ราคาเป็น 0"
      });
    }

    // ISSUE: Missing Mandatory Master Data
    if (!job.Customer_ID || !job.Branch_ID) {
      issues.push({
        jobId: job.Job_ID,
        planDate: job.Plan_Date,
        customerName: job.Customer_Name,
        issueType: 'MISSING_MASTER_DATA',
        severity: 'WARNING',
        description: `ข้อมูล Master ไม่ครบ: ${!job.Customer_ID ? 'รหัสลูกค้า' : ''} ${!job.Branch_ID ? 'สาขา' : ''}`
      });
    }

    // ISSUE: Price Mismatch (Dynamic Check)
    // Only check if job is relatively recent and has enough data
    if (job.Customer_ID && job.Plan_Date && job.Price_Cust_Total > 0 && ['Completed', 'Verified'].includes(status)) {
        const pricing = await calculateJobPrice(job);
        const storedTotal = Number(job.Price_Cust_Total);
        const diff = Math.abs(storedTotal - pricing.totalPrice);
        
        if (pricing.totalPrice > 0 && diff > 1.0) { // Tolerate small rounding
             issues.push({
                jobId: job.Job_ID,
                planDate: job.Plan_Date,
                customerName: job.Customer_Name,
                issueType: 'PRICE_MISMATCH',
                severity: 'WARNING',
                description: `ราคาในระบบ (${storedTotal}) ไม่ตรงกับราคาคำนวณใหม่ (${pricing.totalPrice})`,
                details: { stored: storedTotal, calculated: pricing.totalPrice, reason: pricing.reason }
             });
        }
    }
  }

  return issues;
}

/**
 * Summary of health across all branches.
 */
export async function getHealthSummary(branchId?: string, customerId?: string) {
    const issues = await getOperationsHealth(branchId, customerId);
    
    const summary = {
        totalIssues: issues.length,
        critical: issues.filter(i => i.severity === 'CRITICAL').length,
        warning: issues.filter(i => i.severity === 'WARNING').length,
        byType: issues.reduce((acc, curr) => {
            acc[curr.issueType] = (acc[curr.issueType] || 0) + 1;
            return acc;
        }, {} as Record<string, number>)
    };
    
    return summary;
}
