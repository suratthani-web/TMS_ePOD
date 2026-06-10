"use server"

import { createAdminClient } from "@/utils/supabase/server"
import { logActivity } from "@/lib/supabase/logs"
import { requireAdmin, requireCustomerAccess } from "@/services/permission-guards"

export type DailyFuelPrice = {
    Date: string
    Fuel_Type: string
    Price: number
    Price_Tomorrow?: number
    Updated_At?: string
}

const log = (msg: string) => console.log(`[FUEL_SERVICE] ${msg}`)

/**
 * Sync daily fuel prices from Kapook Gas Price website
 */
async function fetchFromBangchak() {
    const url = "https://www.bangchak.co.th/api/oilprice"
    log(`Attempting Bangchak API: ${url}`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
        const response = await fetch(url, {
            headers: { 
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': 'https://www.bangchak.co.th/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest'
            },
            signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        const contentType = response.headers.get('content-type')
        if (!response.ok || !contentType?.includes('application/json')) {
            throw new Error(`Invalid response/blocked (Status: ${response.status})`)
        }

        const data = await response.json()
        const oilList = data.data?.items || []
        
        type BangchakOil = { OilName: string; PriceToday: string; PriceTomorrow: string }
        const standardDiesel = oilList.find((oil: BangchakOil) => oil.OilName === 'ไฮดีเซล S') 
            || oilList.find((oil: BangchakOil) => oil.OilName.includes('ดีเซล') && !oil.OilName.includes('พรีเมียม') && !oil.OilName.includes('B20'))

        if (!standardDiesel) throw new Error("Diesel not found in JSON")

        return {
            today: parseFloat(standardDiesel.PriceToday),
            tomorrow: parseFloat(standardDiesel.PriceTomorrow)
        }
    } catch (err: unknown) {
        log(`Bangchak Attempt Failed: ${(err as Error).message}`)
        return null
    }
}

async function fetchFromKapook() {
    const url = "https://gasprice.kapook.com/gasprice.php"
    log(`Attempting Kapook Scraper: ${url}`)

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        })
        const html = await response.text()
        
        // 1. Brand Isolation: Target "Bangchak" (บางจาก) block
        // We look for common identifiers used in their HTML/anchors
        let targetArea = html
        const bcpMarkers = ['บางจาก', 'bcp', 'bangchak']
        for (const marker of bcpMarkers) {
            const index = html.toLowerCase().indexOf(marker)
            if (index !== -1) {
                targetArea = html.substring(index, index + 5000) // Larger window for multi-fuel lists
                break
            }
        }

        // 2. Exact Label Extraction
        // Kapook uses <span>ดีเซล</span> for the standard one.
        // We use ">ดีเซล</span>" to ensure it's NOT "ดีเซลพรีเมียม" or "ดีเซล B7"
        const regexes = [
            />ดีเซล<\/span>.*?([\d.]{4,6})/, // Strict tag match
            /ดีเซล.*?(\d{2}\.\d{2})/         // Fallback decimal match
        ]

        let price = null
        for (const regex of regexes) {
            const match = targetArea.match(regex)
            if (match) {
                const p = parseFloat(match[1])
                // Sanity check: Today's Diesel (Apr 2026) should be 30-55 range.
                // Anything higher is likely "Premium" (6x)
                if (p > 25 && p < 55) {
                    price = p
                    break
                }
            }
        }

        // 3. Final Page-Wide Fallback (If brand section failed)
        if (!price) {
            log('Brand-specific match failed, searching page-wide for strict Diesel label...')
            const pageMatch = html.match(/>ดีเซล<\/span>.*?(\d{2}\.\d{2})/)
            if (pageMatch) price = parseFloat(pageMatch[1])
        }

        if (!price) throw new Error("Could not parse valid Diesel price from Kapook")

        return {
            today: price,
            tomorrow: null
        }
    } catch (err: unknown) {
        log(`Kapook Attempt Failed: ${(err as Error).message}`)
        return null
    }
}

// Add a simple in-memory sync lock and cache
let lastSyncTimestamp = 0
const SYNC_COOLDOWN = 60 * 60 * 1000 // 1 hour
const fuelCache = new Map<string, { price: number; priceTomorrow: number | null; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes cache for DB results

/**
 * Sync daily fuel prices from multiple sources
 */
export async function syncDailyFuelPrices() {
    await requireAdmin()
    const now = Date.now()
    if (now - lastSyncTimestamp < SYNC_COOLDOWN) {
        // Only log if it's been at least 10 seconds since last "skipped" log to prevent spam
        if (now - lastSyncTimestamp > 10000) {
            log('Sync skipped: Cooldown active (1 hour)')
        }
        return { success: true, message: 'Already synced recently' }
    }
    
    // Set timestamp immediately to act as a lock for concurrent calls
    lastSyncTimestamp = now
    log('Starting multi-source fuel synchronization...')
    
    try {
        const syncDate = new Date().toISOString().split('T')[0]
        
        // TRY SOURCE 1: BANGCHAK
        let result: { today: number; tomorrow: number | null } | null = await fetchFromBangchak()
        let source = 'Bangchak'

        // TRY SOURCE 2: KAPOOK (Fallback)
        if (!result) {
            log('S1 Failed. Switching to Source 2: Kapook...')
            result = await fetchFromKapook()
            source = 'Kapook'
        }

        if (!result || !result.today) {
            // Reset lock on failure so it can retry sooner if needed (or keep it if we want to avoid hammering failing APIs)
            // lastSyncTimestamp = 0 
            throw new Error("All fuel sources failed or returned empty data")
        }

        const dieselPrice = result.today
        const dieselPriceTomorrow = result.tomorrow
        
        log(`Successfully fetched from ${source}: Today=${dieselPrice}, Tomorrow=${dieselPriceTomorrow}`)

        const supabase = createAdminClient()
        
        const { error: upsertError } = await supabase
            .from('daily_fuel_prices')
            .upsert({
                Date: syncDate,
                Fuel_Type: 'Diesel B7',
                Price: dieselPrice,
                Price_Tomorrow: dieselPriceTomorrow,
                Updated_At: new Date().toISOString()
            }, { onConflict: 'Date' })

        if (upsertError) {
            console.error('[FUEL_SYNC] DB Error:', upsertError)
            if (upsertError.message.includes('Price_Tomorrow')) {
                await supabase
                    .from('daily_fuel_prices')
                    .upsert({
                        Date: syncDate,
                        Fuel_Type: 'Diesel B7',
                        Price: dieselPrice,
                        Updated_At: new Date().toISOString()
                    }, { onConflict: 'Date' })
            } else {
                throw upsertError
            }
        }

        // Update cache
        fuelCache.set(syncDate, { 
            price: dieselPrice, 
            priceTomorrow: dieselPriceTomorrow, 
            timestamp: Date.now() 
        })

        await logActivity({
            module: 'Fuel',
            action_type: 'UPDATE',
            target_id: syncDate,
            details: { type: 'Fuel Price', price: dieselPrice, priceTomorrow: dieselPriceTomorrow, source }
        })

        return { success: true, price: dieselPrice, priceTomorrow: dieselPriceTomorrow }

    } catch (error: unknown) {
        log(`Sync failed: ${(error as Error).message}`)
        return { success: false, error: (error as Error).message }
    }
}

/**
 * Get fuel price for a specific date
 * Returns null if no price is available
 */
export async function getFuelPrice(date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0]
    const now = Date.now()

    // 0. Try Memory Cache first
    const cached = fuelCache.get(targetDate)
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
        return { 
            price: cached.price, 
            priceTomorrow: cached.priceTomorrow 
        }
    }

    const supabase = createAdminClient()

    // 1. Try DB first for the exact date
    const { data, error } = await supabase
        .from('daily_fuel_prices')
        .select('Price, Price_Tomorrow')
        .eq('Date', targetDate)
        .maybeSingle()

    if (error) {
        console.error('[FUEL_ACTION] getFuelPrice Error:', error)
    }
    
    if (data?.Price) {
        // Update cache
        fuelCache.set(targetDate, { 
            price: data.Price, 
            priceTomorrow: data.Price_Tomorrow || null, 
            timestamp: now 
        })

        return { 
            price: data.Price, 
            priceTomorrow: data.Price_Tomorrow || null 
        }
    }

    // 2. If it's today and missing, attempt sync
    const todayStr = new Date().toISOString().split('T')[0]
    if (targetDate === todayStr) {
        console.log(`[FUEL_ACTION] No price in DB for today (${targetDate}), triggering sync...`)
        const syncResult = await syncDailyFuelPrices()
        if (syncResult.success && syncResult.price) {
            return { 
                price: syncResult.price, 
                priceTomorrow: syncResult.priceTomorrow || null 
            }
        }
    }

    // 3. SMART FALLBACK for Historical Data:
    // A) Try to find the most recent price ANNOUNCED BEFORE this date
    const { data: before, error: errorBefore } = await supabase
        .from('daily_fuel_prices')
        .select('Price, Price_Tomorrow, Date')
        .lt('Date', targetDate)
        .order('Date', { ascending: false })
        .limit(1)
        .maybeSingle()
    
    if (before?.Price) {
        console.log(`[FUEL_ACTION] Using price from ${before.Date} as fallback for ${targetDate}`)
        return { price: before.Price, priceTomorrow: before.Price_Tomorrow || null }
    }

    // B) If still nothing (target is before our records started), 
    // find the EARLIEST price we ever recorded (the start of our data)
    const { data: earliest, error: errorEarliest } = await supabase
        .from('daily_fuel_prices')
        .select('Price, Price_Tomorrow, Date')
        .order('Date', { ascending: true })
        .limit(1)
        .maybeSingle()
    
    if (earliest?.Price) {
        console.log(`[FUEL_ACTION] Using earliest available price from ${earliest.Date} for ${targetDate}`)
        return { price: earliest.Price, priceTomorrow: earliest.Price_Tomorrow || null }
    }

    // C) Absolute last resort (should not happen if DB has data)
    return { price: null, priceTomorrow: null }
}

/**
 * Compatibility wrapper to return just the price number for existing callers
 */
export async function getFuelPriceNumber(date?: string): Promise<number | null> {
    const res = await getFuelPrice(date)
    return res.price
}

/**
 * Match a fuel price against a route's matrix to get suggested rate
 * Now supports optional date to lookup historical fuel price automatically
 */
export async function getSuggestedRate(
    customerId: string, 
    routeName: string, 
    fuelPrice?: number, 
    vehicleType: string = '4-Wheel',
    date?: string
) {
    if (!customerId || !routeName) return null

    let targetFuelPrice = fuelPrice
    
    // If no explicit price provided, but date is given, lookup historical price
    if (!targetFuelPrice && date) {
        const historical = await getFuelPrice(date)
        targetFuelPrice = historical.price || 0
    }

    if (!targetFuelPrice) return null

    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('Customer_Route_Rates')
        .select('Fuel_Rate_Matrix')
        .eq('Customer_ID', customerId)
        .eq('Route_Name', routeName)
        .ilike('Vehicle_Type', vehicleType) 
        .maybeSingle()

    if (error) {
        console.error('[FUEL_ACTION] getSuggestedRate Error:', error)
        return null
    }
    if (!data || !data.Fuel_Rate_Matrix) return null

    const matrix = data.Fuel_Rate_Matrix as Array<{ min: number, max: number, price: number }>
    if (!matrix || matrix.length === 0) return null

    const sortedMatrix = [...matrix].sort((a, b) => a.min - b.min)
    
    const match = sortedMatrix.find(range => targetFuelPrice! >= range.min && targetFuelPrice! <= range.max)
    if (match) return match.price

    const highest = sortedMatrix[sortedMatrix.length - 1]
    if (targetFuelPrice > highest.max) {
        return highest.price
    }

    const lowest = sortedMatrix[0]
    if (targetFuelPrice < lowest.min) {
        return lowest.price
    }
    
    return null
}

/**
 * Get all matrices for a customer
 */
export async function getCustomerMatrices(customerId: string) {
    await requireCustomerAccess(customerId)
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('Customer_Route_Rates')
        .select('*')
        .eq('Customer_ID', customerId)
    
    if (error) {
        console.error('[FUEL_ACTION] getCustomerMatrices Error:', error)
        return []
    }
    return data
}

/**
 * Save or update a matrix for [Customer + Route + Vehicle_Type]
 */
export async function saveCustomerMatrix(customerId: string, routeName: string, vehicleType: string, matrix: { min: number | string; max: number | string; price: number | string }[]) {
    try {
        await requireAdmin()
        const supabase = createAdminClient()
        
        // Clean matrix data: ensure no NaN and proper types
        const cleanMatrix = matrix.map(row => ({
            min: Number(row.min) || 0,
            max: Number(row.max) || 0,
            price: Number(row.price) || 0
        }))

        // Verify we have required IDs
        if (!customerId || !routeName || !vehicleType) {
            return { success: false, error: "Missing Customer ID, Route Name, or Vehicle Type" }
        }

        const { data, error } = await supabase
            .from('Customer_Route_Rates')
            .upsert({
                Customer_ID: customerId,
                Route_Name: routeName,
                Vehicle_Type: vehicleType,
                Fuel_Rate_Matrix: cleanMatrix,
                Updated_At: new Date().toISOString()
            }, { 
                onConflict: 'Customer_ID,Route_Name,Vehicle_Type' 
            })
            .select()
            .single()
        
        if (error) {
            console.error('[FUEL_ACTION] Save failed:', error)
            return { success: false, error: error.message }
        }
        return { success: true, data }
    } catch (e: unknown) {
        console.error('[FUEL_ACTION] Exception:', e)
        return { success: false, error: (e as Error).message }
    }
}

/**
 * Delete a matrix
 */
export async function deleteCustomerMatrix(id: string) {
    await requireAdmin()
    const supabase = createAdminClient()
    const { error } = await supabase
        .from('Customer_Route_Rates')
        .delete()
        .eq('ID', id)
    
    if (error) return { success: false, error: error.message }
    return { success: true }
}
