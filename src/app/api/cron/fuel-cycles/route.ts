import { NextResponse } from 'next/server'
import { syncFuelCycles } from '@/lib/fuel/fuel-cycles'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Daily resync of Fuel_Cycles (bill-to-bill fuel use) + admin alerts for new abnormal cycles. */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await syncFuelCycles({ notify: true })
    return NextResponse.json({ status: result.success ? 'ok' : 'error', timestamp: new Date().toISOString(), ...result }, { status: result.success ? 200 : 500 })
  } catch (error: unknown) {
    console.error('[CRON fuel-cycles Error]', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
