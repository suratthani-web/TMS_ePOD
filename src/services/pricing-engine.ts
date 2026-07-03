"use server"

import { createAdminClient } from "@/lib/supabase/admin";
import { getSuggestedRate } from "@/lib/actions/fuel-actions";

export interface PricingResult {
  unitPrice: number;
  totalPrice: number;
  qty: number;
  reason: string;
}

/**
 * PricingEngine - Centralized service to calculate job prices.
 * Handles base rates, fuel surcharges, and special temporal rules.
 */
export async function calculateJobPrice(
  jobData: {
    Job_ID: string;
    Customer_ID?: string | null;
    Plan_Date?: string | null;
    Vehicle_Type?: string | null;
    Route_Name?: string | null;
    Weight_Kg?: number | string | null;
    Volume_Cbm?: number | string | null;
    Loaded_Qty?: number | string | null;
  } & Record<string, unknown>
): Promise<PricingResult> {
  const { 
    Customer_ID, 
    Plan_Date, 
    Vehicle_Type = '4-Wheel', 
    Route_Name,
    Weight_Kg,
    Volume_Cbm,
    Loaded_Qty 
  } = jobData;

  const qty = Number(Weight_Kg || Volume_Cbm || Loaded_Qty || 0);
  let unitPrice = 0;
  let reason = "Default Price (0)";

  // 1. SPECIAL RULE: Force 17 for April 21-23, 2026
  if (Plan_Date) {
    const jobDate = new Date(Plan_Date);
    const isApril21_23 = jobDate.getFullYear() === 2026 && 
                         jobDate.getMonth() === 3 && 
                         [21, 22, 23].includes(jobDate.getDate());
    
    if (isApril21_23) {
      unitPrice = 17;
      reason = "Special Rule: April 2026 Fixed Rate (17)";
    }
  }

  // 2. DYNAMIC LOOKUP: Rate Matrix (Fuel-Adjusted) for Per-Piece pricing
  if (unitPrice === 0 && Customer_ID) {
    const suggested = await getSuggestedRate(
      Customer_ID,
      'SYSTEM_PER_PIECE', // MUST use this exact key for the global fuel matrix
      undefined, 
      Vehicle_Type || '4-Wheel',
      Plan_Date || undefined
    );

    if (suggested && suggested > 0) {
      unitPrice = suggested;
      reason = "Rate Matrix (Fuel-Adjusted)";
    }
  }

  // 3. FALLBACK: Look up static price in Master_Customers
  if (unitPrice === 0 && Customer_ID) {
    const supabase = createAdminClient();
    const { data: cust } = await supabase
      .from('Master_Customers')
      .select('Price_Per_Unit')
      .eq('Customer_ID', Customer_ID)
      .maybeSingle();

    if (cust?.Price_Per_Unit) {
      unitPrice = Number(cust.Price_Per_Unit);
      reason = "Customer Base Rate (Master Data)";
    }
  }

  const totalPrice = Number((qty * unitPrice).toFixed(2));

  return {
    unitPrice,
    totalPrice,
    qty,
    reason
  };
}

/**
 * Recalculates and updates the price for a specific job in the database.
 */
export async function syncJobPrice(jobId: string): Promise<{ success: boolean; result?: PricingResult }> {
  const supabase = createAdminClient();
  
  const { data: job, error } = await supabase
    .from('Jobs_Main')
    .select('*')
    .eq('Job_ID', jobId)
    .single();

  if (error || !job) return { success: false };

  const result = await calculateJobPrice(job);

  // No usable rate found — writing 0 back would report "success" while the
  // job stays broken (the health issue immediately reappears). Return the
  // engine's reason instead so the admin knows to fix the rate master data.
  if (!result.totalPrice || result.totalPrice <= 0) {
    return { success: false, result };
  }

  const { error: updateError } = await supabase
    .from('Jobs_Main')
    .update({
      Price_Per_Unit: result.unitPrice,
      Price_Cust_Total: result.totalPrice
    })
    .eq('Job_ID', jobId);

  if (updateError) return { success: false };

  return { success: true, result };
}
