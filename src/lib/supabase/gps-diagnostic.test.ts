import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { describe, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((key: string) => {
      if (key === 'selectedBranch') return { value: 'All' }
      if (key === 'session') return undefined
      return undefined
    })
  })),
  headers: vi.fn(async () => ({
    get: vi.fn(() => null)
  }))
}))

vi.mock('@/lib/permissions', () => ({
  isSuperAdmin: vi.fn(async () => true),
  isAdmin: vi.fn(async () => true),
  getCustomerId: vi.fn(async () => null),
  getUserBranchId: vi.fn(async () => 'All'),
  isCustomer: vi.fn(async () => false)
}))

import { getActiveFleetStatus, getLatestDriverLocations } from './gps'
import { getJobsByStatus } from './jobs'
import { createAdminClient } from '@/utils/supabase/server'

describe('GPS and Jobs Diagnostics', () => {
  it('runs queries and prints logs', async () => {
    console.log("=== DIAGNOSTICS START ===")
    
    // Test Users
    try {
      const supabase = createAdminClient()
      const { data: users, error: errUsers } = await supabase
        .from('Master_Users')
        .select('Username, Role, Branch_ID')
      if (errUsers) {
        console.error("Error fetching Master_Users:", errUsers)
      } else {
        console.log("Master_Users profiles:", users)
      }
    } catch (e) {
      console.error("Exception in users query:", e)
    }

    // Test Drivers/Locations
    try {
      const locations = await getLatestDriverLocations()
      console.log("getLatestDriverLocations count:", locations?.length)
    } catch (e) {
      console.error("Error in getLatestDriverLocations:", e)
    }

    try {
      const fleet = await getActiveFleetStatus()
      console.log("getActiveFleetStatus count:", fleet?.length)
    } catch (e) {
      console.error("Error in getActiveFleetStatus:", e)
    }
    console.log("=== DIAGNOSTICS END ===")
  })
})
