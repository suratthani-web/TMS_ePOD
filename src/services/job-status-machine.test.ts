import { describe, it, expect, vi } from 'vitest'
import { isTransitionAllowed } from './job-status-machine'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn()
}))

vi.mock('@/lib/supabase/logs', () => ({
  logActivity: vi.fn()
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn()
}))

describe('JobStatusMachine', () => {
  it('allows valid transitions', async () => {
    expect(await isTransitionAllowed('Draft', 'New')).toBe(true)
    expect(await isTransitionAllowed('New', 'Assigned')).toBe(true)
    expect(await isTransitionAllowed('Assigned', 'Picked Up')).toBe(true)
    expect(await isTransitionAllowed('Completed', 'Verified')).toBe(true)
    expect(await isTransitionAllowed('New', 'Accepted')).toBe(true)
    expect(await isTransitionAllowed('Picked Up', 'Arrived Dropoff')).toBe(true)
  })

  it('prevents illegal transitions', async () => {
    expect(await isTransitionAllowed('Draft', 'Completed')).toBe(false)
    expect(await isTransitionAllowed('Billed', 'Assigned')).toBe(false)
    expect(await isTransitionAllowed('Paid', 'Draft')).toBe(false)
  })

  it('allows cancellation from almost any state except final ones', async () => {
    expect(await isTransitionAllowed('Requested', 'Cancelled')).toBe(true)
    expect(await isTransitionAllowed('Picked Up', 'Cancelled')).toBe(true)
  })
})
