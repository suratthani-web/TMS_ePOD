import { NextResponse } from 'next/server'
import { syncDailyFuelPricesInternal } from '@/lib/actions/fuel-actions'

export async function GET(req: Request) {
    try {
        // Simple security check (matches morning-brief cron structure)
        const authHeader = req.headers.get('authorization')
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        console.log('[CRON Sync Fuel] Triggering fuel price synchronization...')
        const result = await syncDailyFuelPricesInternal()
        
        if (result.success) {
            return NextResponse.json({ 
                status: 'ok', 
                message: result.message || 'Fuel price synchronized successfully',
                price: result.price,
                priceTomorrow: result.priceTomorrow
            })
        } else {
            console.error('[CRON Sync Fuel] Sync failed:', result.error)
            return NextResponse.json({ error: result.error || 'Sync failed' }, { status: 500 })
        }
    } catch (err) {
        console.error('[CRON Sync Fuel] Exception:', err)
        return NextResponse.json({ error: 'Internal Server Error', details: (err as Error).message }, { status: 500 })
    }
}
