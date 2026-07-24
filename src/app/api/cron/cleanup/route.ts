import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ASSETS_BUCKET = 'company-assets'

const FOLDERS_TO_CLEAN = [
    'Job_Photos',
    'Pickup_Photos',
    'POD_Photos',
    'Signatures',
    'Pickup_Signatures',
    'POD_Signatures',
    'Reports',
    'POD_Reports'
]

export async function GET(req: Request) {
    try {
        // 1. Security Check using CRON_SECRET
        const authHeader = req.headers.get('authorization')
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = createClient(supabaseUrl, supabaseKey)

        // Database logs cutoff (45 days)
        const dbCutoffDate = new Date()
        dbCutoffDate.setDate(dbCutoffDate.getDate() - 45)
        const dbCutoffStr = dbCutoffDate.toISOString()

        // Storage files & job image links cutoff (20 days)
        const storageCutoffDate = new Date()
        storageCutoffDate.setDate(storageCutoffDate.getDate() - 20)
        const storageCutoffStr = storageCutoffDate.toISOString()
        const storageCutoffTime = storageCutoffDate.getTime()

        console.log(`[CRON Cleanup] Starting cleanup. DB Cutoff: ${dbCutoffStr} (45d), Storage Cutoff: ${storageCutoffStr} (20d)`)
        const reportLog: Record<string, any> = {
            dbCutoffDate: dbCutoffStr,
            storageCutoffDate: storageCutoffStr,
            database: {},
            storage: {}
        }

        // 2. Clear Database Logs & Notifications older than 45 days
        const tablesToDelete = [
            { name: 'gps_logs', dateCol: 'timestamp' },
            { name: 'System_Logs', dateCol: 'created_at' },
            { name: 'Notifications', dateCol: 'Created_At' },
            { name: 'Chat_Messages', dateCol: 'Created_At' }
        ]

        for (const table of tablesToDelete) {
            const { error, count } = await supabase
                .from(table.name)
                .delete({ count: 'exact' })
                .lt(table.dateCol, dbCutoffStr)
            
            if (error) {
                console.error(`[CRON Cleanup] Error cleaning table ${table.name}:`, error.message)
                reportLog.database[table.name] = `Error: ${error.message}`
            } else {
                console.log(`[CRON Cleanup] Deleted ${count || 0} records from ${table.name}.`)
                reportLog.database[table.name] = count || 0
            }
        }

        // 3. Nullify image links in Jobs_Main older than 20 days
        const { error: dbErr } = await supabase
            .from('Jobs_Main')
            .update({
                Photo_Proof_Url: null,
                Signature_Url: null,
                Pickup_Photo_Url: null,
                Pickup_Signature_Url: null
            })
            .lt('Created_At', storageCutoffStr)

        if (dbErr) {
            console.error('[CRON Cleanup] Error nullifying database links:', dbErr.message)
            reportLog.database['Jobs_Main_Update'] = `Error: ${dbErr.message}`
        } else {
            console.log('[CRON Cleanup] Nullified database links successfully.')
            reportLog.database['Jobs_Main_Update'] = 'Success'
        }

        // 4. Scan and delete old files from Storage folders
        for (const folder of FOLDERS_TO_CLEAN) {
            let offset = 0
            const limit = 100
            let hasMore = true
            let totalDeleted = 0

            while (hasMore) {
                const { data: files, error } = await supabase.storage
                    .from(ASSETS_BUCKET)
                    .list(folder, {
                        limit,
                        offset,
                        sortBy: { column: 'created_at', order: 'asc' } // oldest first
                    })

                if (error) {
                    console.error(`[CRON Cleanup] Error listing files in ${folder}:`, error.message)
                    break
                }

                if (!files || files.length === 0) {
                    hasMore = false
                    break
                }

                // OPTIMIZATION:
                // Since files are sorted by created_at ASC (oldest first), if the very first (oldest) file
                // is newer than our cutoff time, it means ALL files in this folder are newer than the cutoff.
                // We can safely break the loop immediately, saving many paginated API calls!
                const oldestFile = files.find(f => f.name !== '.emptyFolderPlaceholder')
                if (oldestFile) {
                    const oldestFileTime = new Date(oldestFile.created_at ?? 0).getTime()
                    if (oldestFileTime >= storageCutoffTime) {
                        console.log(`[CRON Cleanup] Optimization: Oldest file in "${folder}" is newer than 20 days. Skipping rest of folder.`)
                        hasMore = false
                        break
                    }
                }

                const filesToDelete: string[] = []
                files.forEach(file => {
                    if (file.name === '.emptyFolderPlaceholder') return
                    const fileCreatedAt = new Date(file.created_at ?? 0).getTime()
                    if (fileCreatedAt < storageCutoffTime) {
                        filesToDelete.push(`${folder}/${file.name}`)
                    }
                })


                if (filesToDelete.length > 0) {
                    const { error: deleteErr } = await supabase.storage
                        .from(ASSETS_BUCKET)
                        .remove(filesToDelete)

                    if (deleteErr) {
                        console.error(`[CRON Cleanup] Error deleting files in ${folder}:`, deleteErr.message)
                    } else {
                        totalDeleted += filesToDelete.length
                    }
                } else {
                    offset += limit
                }

                if (files.length < limit) {
                    hasMore = false
                }
            }

            console.log(`[CRON Cleanup] Cleaned folder "${folder}". Deleted: ${totalDeleted} files.`)
            reportLog.storage[folder] = totalDeleted
        }

        return NextResponse.json({ 
            status: 'ok', 
            message: 'Retention cleanup executed successfully', 
            report: reportLog 
        })

    } catch (err) {
        console.error('[CRON Cleanup] Critical Exception:', err)
        return NextResponse.json({ 
            error: 'Internal Server Error', 
            details: (err as Error).message 
        }, { status: 500 })
    }
}
