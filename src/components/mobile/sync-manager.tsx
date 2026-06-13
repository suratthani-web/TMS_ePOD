"use client"

import { useEffect, useState, useCallback } from "react"
import { syncOfflineJobs, getOfflineJobs } from "@/lib/utils/offline-storage"
import { usePathname } from "next/navigation"
import { CloudOff, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"

export function SyncManager() {
    const pathname = usePathname()
    const [pendingCount, setPendingCount] = useState(0)
    const [isSyncing, setIsSyncing] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)

    const updateCount = useCallback(async () => {
        const jobs = await getOfflineJobs()
        setPendingCount(jobs.length)
    }, [])

    const handleSync = useCallback(async () => {
        const jobs = await getOfflineJobs()
        if (jobs.length === 0) return
        if (isSyncing || !navigator.onLine) return

        setIsSyncing(true)
        try {
            await syncOfflineJobs()
            await updateCount()
            const remaining = await getOfflineJobs()
            if (remaining.length === 0) {
                setShowSuccess(true)
                setTimeout(() => setShowSuccess(false), 3000)
            }
        } finally {
            setIsSyncing(false)
        }
    }, [isSyncing, updateCount])

    useEffect(() => {
        updateCount()
        
        const handleQueueChange = () => updateCount()
        window.addEventListener('tms_offline_queue_change', handleQueueChange)
        
        // Initial sync check
        handleSync()

        // Sync when coming back online
        const handleOnline = () => {
            handleSync()
        }

        window.addEventListener('online', handleOnline)
        return () => {
            window.removeEventListener('tms_offline_queue_change', handleQueueChange)
            window.removeEventListener('online', handleOnline)
        }
    }, [handleSync, updateCount])

    useEffect(() => {
        handleSync()
    }, [pathname, handleSync])

    if (pendingCount === 0 && !showSuccess) return null

    return (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] w-[90%] max-w-sm">
            <div className={`p-3 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center justify-between gap-4 transition-all duration-500 ${
                showSuccess ? 'bg-emerald-500/95 border-emerald-400/50 text-white' : 'bg-card/95 border-border text-foreground'
            }`}>
                <div className="flex items-center gap-3 min-w-0">
                    {showSuccess ? (
                        <CheckCircle2 className="text-white shrink-0 animate-in zoom-in" size={20} />
                    ) : isSyncing ? (
                        <RefreshCw className="text-primary shrink-0 animate-spin" size={20} />
                    ) : (
                        <CloudOff className="text-amber-500 shrink-0" size={20} />
                    )}

                    <div className="flex flex-col min-w-0">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${showSuccess ? 'text-white/80' : 'text-muted-foreground'}`}>
                            {showSuccess ? 'Synced' : 'Offline Sync'}
                        </span>
                        <span className="text-sm font-bold truncate">
                            {showSuccess ? 'ข้อมูลถูกส่งแล้ว' :
                             isSyncing ? `กำลังส่งข้อมูล (${pendingCount})...` :
                             `ค้างส่ง ${pendingCount} รายการ`}
                        </span>
                    </div>
                </div>

                {!showSuccess && !isSyncing && navigator.onLine && (
                    <button
                        onClick={handleSync}
                        className="shrink-0 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
                    >
                        ส่งตอนนี้
                    </button>
                )}

                {!showSuccess && !navigator.onLine && (
                    <div className="shrink-0 flex items-center gap-1 text-xs font-bold text-muted-foreground">
                        <AlertCircle size={12} />
                        รอสัญญาณ
                    </div>
                )}
            </div>
        </div>
    )
}

