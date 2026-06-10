'use client'

import React, { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Script from 'next/script'

// Declare global liff property on window
declare global {
    interface Liff {
        init: (config: { liffId: string }) => Promise<void>;
        isLoggedIn: () => boolean;
        getProfile: () => Promise<{ displayName: string; userId: string; [key: string]: unknown }>;
        login: (config?: { redirectUri?: string }) => void;
        getContext: () => { userId: string; [key: string]: unknown } | null;
        isInClient: () => boolean;
        closeWindow: () => void;
        isApiAvailable: (api: string) => boolean;
        shareTargetPicker: (messages: unknown[]) => Promise<unknown>;
    }
    interface Window {
        liff: Liff
    }
}

function SignatureContent() {
    const searchParams = useSearchParams()
    const jobId = searchParams.get('jobId') || 'JOB-TEST'
    
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [isLiffInit, setIsLiffInit] = useState(false)
    const [driverName, setDriverName] = useState<string>('')
    const [submitting, setSubmitting] = useState(false)
    const [success, setSuccess] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // Setup Canvas touch & mouse listeners
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Set high-res canvas scaling
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * 2
        canvas.height = rect.height * 2
        ctx.scale(2, 2)

        // Pen styles
        ctx.strokeStyle = '#10b981' // Neon emerald green line
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        const getPos = (e: MouseEvent | TouchEvent) => {
            const clientRect = canvas.getBoundingClientRect()
            if ('touches' in e) {
                if (e.touches.length === 0) return { x: 0, y: 0 }
                return {
                    x: e.touches[0].clientX - clientRect.left,
                    y: e.touches[0].clientY - clientRect.top
                }
            } else {
                return {
                    x: e.clientX - clientRect.left,
                    y: e.clientY - clientRect.top
                }
            }
        }

        const startDrawing = (e: MouseEvent | TouchEvent) => {
            e.preventDefault()
            const pos = getPos(e)
            ctx.beginPath()
            ctx.moveTo(pos.x, pos.y)
            setIsDrawing(true)
        }

        const draw = (e: MouseEvent | TouchEvent) => {
            if (!isDrawing) return
            e.preventDefault()
            const pos = getPos(e)
            ctx.lineTo(pos.x, pos.y)
            ctx.stroke()
        }

        const stopDrawing = () => {
            setIsDrawing(false)
        }

        // Add mouse listeners
        canvas.addEventListener('mousedown', startDrawing)
        canvas.addEventListener('mousemove', draw)
        canvas.addEventListener('mouseup', stopDrawing)
        canvas.addEventListener('mouseleave', stopDrawing)

        // Add touch listeners
        canvas.addEventListener('touchstart', startDrawing, { passive: false })
        canvas.addEventListener('touchmove', draw, { passive: false })
        canvas.addEventListener('touchend', stopDrawing)

        return () => {
            canvas.removeEventListener('mousedown', startDrawing)
            canvas.removeEventListener('mousemove', draw)
            canvas.removeEventListener('mouseup', stopDrawing)
            canvas.removeEventListener('mouseleave', stopDrawing)
            canvas.removeEventListener('touchstart', startDrawing)
            canvas.removeEventListener('touchmove', draw)
            canvas.removeEventListener('touchend', stopDrawing)
        }
    }, [isDrawing])

    // Initialize LINE LIFF
    const handleLiffScriptLoad = () => {
        if (!window.liff) {
            console.error('LIFF script failed to load')
            return
        }

        const liffId = process.env.NEXT_PUBLIC_LIFF_ID || process.env.NEXT_PUBLIC_LIFF_SIGNATURE_ID || '2006123456-ABCdefgh'
        window.liff.init({ liffId })
            .then(() => {
                setIsLiffInit(true)
                if (window.liff.isLoggedIn()) {
                    window.liff.getProfile()
                        .then((profile: { displayName: string }) => {
                            setDriverName(profile.displayName || '')
                        })
                        .catch((err: unknown) => console.error('[LIFF Profile Error]', err))
                } else {
                    window.liff.login()
                }
            })
            .catch((err: unknown) => {
                console.warn('[LIFF Init failed - Fallback to standard web]', err)
                setIsLiffInit(false)
            })
    }

    const clearCanvas = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    const handleSubmit = async () => {
        const canvas = canvasRef.current
        if (!canvas) return

        setSubmitting(true)
        setErrorMsg(null)

        try {
            // Convert to Base64 PNG image
            const signatureBase64 = canvas.toDataURL('image/png')
            
            // Send to our Next.js backend API
            const response = await fetch('/api/liff/signature', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    signatureBase64,
                    lineUserId: window.liff?.isLoggedIn() ? window.liff.getContext()?.userId : null
                })
            })

            const resData = await response.json()
            if (resData.success) {
                setSuccess(true)
                setTimeout(() => {
                    // Close the LIFF app and return to chat
                    if (window.liff && window.liff.isInClient()) {
                        window.liff.closeWindow()
                    } else {
                        // Web fallback
                        alert('บันทึกสำเร็จ! ขอบคุณครับ')
                    }
                }, 2000)
            } else {
                setErrorMsg(resData.error || 'บันทึกลายเซ็นล้มเหลว กรุณาลองอีกครั้ง')
            }
        } catch (e: unknown) {
            console.error(e)
            setErrorMsg(e instanceof Error ? e.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 font-sans">
            {/* LINE LIFF Script Loader */}
            <Script 
                src="https://static.line-scdn.net/liff/edge/2/sdk.js" 
                onLoad={handleLiffScriptLoad}
            />

            {/* Header */}
            <header className="text-center pt-4">
                <div className="inline-flex items-center justify-center p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                    <span className="text-xs text-emerald-400 font-semibold tracking-wider uppercase">TMS Digital ePOD</span>
                </div>
                <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
                    ยืนยันรับสินค้าดิจิทัล
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                    ใบงานเลขที่: <span className="text-slate-200 font-mono font-bold">{jobId}</span>
                </p>
                {driverName && (
                    <p className="text-xs text-emerald-500 mt-0.5">
                        ผู้ปฏิบัติงาน: {driverName}
                    </p>
                )}
            </header>

            {/* Canvas/Signature Card */}
            <main className="my-auto flex flex-col items-center">
                {success ? (
                    <div className="w-full max-w-sm aspect-video bg-slate-900/60 border border-emerald-500/30 rounded-2xl flex flex-col items-center justify-center p-6 backdrop-blur-xl animate-fade-in">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-bold text-slate-100">ส่งข้อมูลสำเร็จ!</h2>
                        <p className="text-xs text-slate-400 mt-1 text-center">
                            ขอบคุณครับ ระบบได้ทำการบันทึกลายเซ็นของคุณ และกำลังปิดหน้าต่างนี้โดยอัตโนมัติ...
                        </p>
                    </div>
                ) : (
                    <div className="w-full max-w-sm flex flex-col">
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 shadow-2xl backdrop-blur-xl">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-xs font-semibold text-slate-400">✍️ กรุณาใช้นิ้วเซ็นสดยืนยันในกรอบนี้</span>
                                <button 
                                    onClick={clearCanvas}
                                    className="text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors flex items-center"
                                >
                                    ล้างหน้าจอ
                                </button>
                            </div>
                            
                            {/* Interactive Drawing Canvas */}
                            <div className="w-full aspect-[4/3] bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-inner">
                                <canvas 
                                    ref={canvasRef}
                                    className="w-full h-full cursor-crosshair touch-none"
                                />
                            </div>
                        </div>

                        {errorMsg && (
                            <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 text-center font-medium animate-pulse">
                                ⚠️ {errorMsg}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Footer buttons */}
            <footer className="w-full max-w-sm mx-auto pb-4">
                {!success && (
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide shadow-lg transition-all duration-300 flex items-center justify-center ${
                            submitting
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                                : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 hover:shadow-emerald-500/10 hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                    >
                        {submitting ? (
                            <div className="flex items-center space-x-2">
                                <svg className="animate-spin h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                <span>กำลังบันทึกข้อมูล...</span>
                            </div>
                        ) : (
                            '📝 ยืนยันการจัดส่ง (ePOD)'
                        )}
                    </button>
                )}
            </footer>
        </div>
    )
}

export default function LiffSignaturePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
                <div className="text-center">
                    <svg className="animate-spin h-8 w-8 text-emerald-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="text-sm text-slate-400">กำลังเตรียมหน้าจอเซ็นชื่อ...</p>
                </div>
            </div>
        }>
            <SignatureContent />
        </Suspense>
    )
}
