import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateJobPrice } from './pricing-engine'

// Mock the dependencies
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          ilike: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: { Price: 100 } }))
            }))
          }))
        }))
      }))
    }))
  }))
}))

vi.mock('@/lib/actions/fuel-actions', () => ({
  getFuelPriceNumber: vi.fn(() => Promise.resolve(35.0)),
  getSuggestedRate: vi.fn(() => Promise.resolve(20.0))
}))

describe('PricingEngine', () => {
  const baseJob = {
    Job_ID: 'TEST-101',
    Customer_ID: 'CUST-001',
    Plan_Date: '2026-06-01',
    Vehicle_Type: '4-Wheel',
    Route_Name: 'BKK-PAT',
    Weight_Kg: 10
  }

  it('calculates special fixed rate for April 21-23, 2026', async () => {
    const jobAtApril21 = { ...baseJob, Plan_Date: '2026-04-21' }
    const result = await calculateJobPrice(jobAtApril21)
    
    expect(result.unitPrice).toBe(17)
    expect(result.reason).toContain('April 2026')
    expect(result.totalPrice).toBe(170) // 10kg * 17
  })

  it('uses dynamic fuel-adjusted rate from matrix if available', async () => {
    const result = await calculateJobPrice(baseJob)
    
    expect(result.unitPrice).toBe(20) // From mocked getSuggestedRate
    expect(result.reason).toContain('Rate Matrix')
  })

  it('handles zero quantity gracefully', async () => {
    const emptyJob = { ...baseJob, Weight_Kg: 0, Volume_Cbm: 0, Loaded_Qty: 0 }
    const result = await calculateJobPrice(emptyJob)
    
    expect(result.qty).toBe(0)
    expect(result.totalPrice).toBe(0)
  })
})
