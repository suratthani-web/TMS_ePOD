
"use server"

import { createInvoice as createInvoiceLib } from "@/lib/supabase/invoices"
import { getBillableJobs as getBillableJobsLib } from "@/lib/supabase/jobs"
import { calculateJobPrice } from "@/services/pricing-engine"

// Wrapper for Server Actions
export async function createInvoiceAction(invoice: Record<string, unknown>) {
  return await createInvoiceLib(invoice)
}

export async function getBillableJobsAction(customerId?: string, startDate?: string, endDate?: string) {
  const jobs = await getBillableJobsLib(customerId, startDate, endDate)
  
  // Enrich jobs with Pricing Engine calculations
  const enriched = await Promise.all((jobs || []).map(async (job: any) => {
    const pricing = await calculateJobPrice(job)
    
    // If stored total is 0 or deviates significantly, use calculated total
    const storedTotal = Number(job.Price_Cust_Total || 0)
    let finalTotal = storedTotal
    if (pricing.totalPrice > 0 && (storedTotal === 0 || Math.abs(storedTotal - pricing.totalPrice) > 0.5)) {
      finalTotal = pricing.totalPrice
    }

    return {
      ...job,
      Price_Per_Unit: pricing.unitPrice,
      Price_Cust_Total: finalTotal,
      pricing_reason: pricing.reason
    }
  }))

  return enriched
}
