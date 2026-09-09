import { NextResponse } from 'next/server'
import { backfillMasterSheet } from '@/lib/actions/master-sheet-sync'

export const dynamic = 'force-dynamic'

// Nightly safety net: re-sync any Verified job that never made it into the MASTER
// sheet (a verify path that skipped the write, or a transient Sheets error).
// backfillMasterSheet is idempotent — the per-tab ledger check skips rows that are
// already present, so only the missing ones get appended. Window = last N days so
// the sweep stays cheap; ?days= overrides.
function bkkDate(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000)
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) // YYYY-MM-DD
}

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 7, 1), 60)
    const startDate = bkkDate(-days)
    const endDate = bkkDate(0)

    const result = await backfillMasterSheet(startDate, endDate)

    return NextResponse.json({
      status: result.success ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      window: { startDate, endDate, days },
      appended: result.count ?? 0,
      jobIdsFilled: result.jobIdsFilled ?? 0,
      error: result.error,
    }, { status: result.success ? 200 : 500 })
  } catch (error: unknown) {
    console.error('[CRON master-sheet-backfill]', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
