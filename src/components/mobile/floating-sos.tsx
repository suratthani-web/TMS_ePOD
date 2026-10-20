'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, ShieldAlert, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { createSOSAlert } from '@/app/mobile/jobs/actions'

export function FloatingSOS() {
    const [isPressing, setIsPressing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [isActive, setIsActive] = useState(false)
    const [sending, setSending] = useState(false)
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const PRESS_DURATION = 2000 // 2 seconds

    const startPress = () => {
        if (sending || isActive) return
        setIsPressing(true)
        setProgress(0)
        
        const startTime = Date.now()
        timerRef.current = setInterval(() => {
            const elapsed = Date.now() - startTime
            const newProgress = Math.min((elapsed / PRESS_DURATION) * 100, 100)
            setProgress(newProgress)
            
            if (elapsed >= PRESS_DURATION) {
                handleTrigger()
                if (timerRef.current) clearInterval(timerRef.current)
            }
        }, 50)
    }

    const cancelPress = () => {
        setIsPressing(false)
        setProgress(0)
        if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
        }
    }

    const handleTrigger = async () => {
        setIsPressing(false)
        setSending(true)
        
        try {
            // Get location if possible
            let lat = 0, lng = 0
            if (navigator.geolocation) {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject)
                })
                lat = pos.coords.latitude
                lng = pos.coords.longitude
            }

            const result = await createSOSAlert({
                type: 'Emergency',
                lat,
                lng,
                message: 'Driver triggered SOS from floating button'
            })

            if (result.success) {
                setIsActive(true)
                toast.error("ส่งสัญญาณ SOS แล้ว เจ้าหน้าที่จะติดต่อกลับทันที", {
                    duration: 5000,
                    position: 'top-center'
                })
            }
        } catch (error) {
            console.error(error)
            toast.error("ไม่สามารถส่ง SOS ได้ในขณะนี้")
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="fixed top-[calc(6rem+var(--sat))] right-4 z-[100] flex flex-col items-center">
            <motion.div
                onMouseDown={startPress}
                onMouseUp={cancelPress}
                onMouseLeave={cancelPress}
                onTouchStart={startPress}
                onTouchEnd={cancelPress}
                className={cn(
                    "relative w-14 h-14 rounded-2xl flex items-center justify-center cursor-pointer transition-all active:scale-90 select-none",
                    isActive ? "bg-red-500 shadow-lg shadow-red-500/50" : "bg-red-500/10 border-2 border-red-500/20 backdrop-blur-md"
                )}
            >
                {/* Progress Ring Overlay */}
                <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
                    <circle
                        cx="28"
                        cy="28"
                        r="24"
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeDasharray="150.8"
                        strokeDashoffset={150.8 - (150.8 * progress) / 100}
                        className={cn(
                            "text-red-500 transition-all duration-75",
                            progress === 0 && "opacity-0"
                        )}
                    />
                </svg>

                {sending ? (
                    <Loader2 className="text-red-500 animate-spin" size={24} />
                ) : isActive ? (
                    <ShieldAlert className="text-white animate-pulse" size={24} />
                ) : (
                    <AlertTriangle className={cn(
                        "transition-colors",
                        isPressing ? "text-red-500 scale-110" : "text-red-500/40"
                    )} size={24} />
                )}

                {/* Legend while pressing */}
                <AnimatePresence>
                    {isPressing && (
                        <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            className="absolute right-16 px-4 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap shadow-xl"
                        >
                            กดค้างเพื่อส่ง SOS
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    )
}
