"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Share, X, PlusSquare } from "lucide-react"
import { Button } from "@/components/ui/button"

declare global {
  interface Window {
    MSStream?: unknown
  }
  interface Navigator {
    standalone?: boolean
  }
}

export function PWAInstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Check if it's iOS Safari and NOT already in standalone mode
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    const isStandalone = window.navigator.standalone === true
    const hasDismissed = localStorage.getItem('pwa_hint_dismissed')

    if (isIOS && !isStandalone && !hasDismissed) {
      // Show after a short delay
      const timer = setTimeout(() => setShow(true), 3000)
      return () => clearTimeout(timer)
    }
  }, [])

  const dismiss = () => {
    setShow(false)
    localStorage.setItem('pwa_hint_dismissed', 'true')
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-6 left-4 right-4 z-[100] bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-4 flex flex-col gap-3 transition-colors duration-300"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <PlusSquare className="text-primary-foreground w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-foreground font-bold text-xl">ติดตั้งแอป LOGIS Driver</h3>
                <p className="text-muted-foreground text-lg font-bold">ติดตั้งลงบนหน้าจอหลักเพื่อการใช้งานที่รวดเร็ว</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={dismiss} className="text-muted-foreground h-8 w-8">
              <X size={18} />
            </Button>
          </div>

          <div className="bg-muted/50 rounded-xl p-3 text-lg font-bold text-muted-foreground space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 flex items-center justify-center bg-primary/10 rounded text-primary text-base font-bold font-bold">1</span>
              <span>กดปุ่ม <Share className="inline w-3 h-3 text-primary" /> (แชร์) ด้านล่างของ Safari</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 flex items-center justify-center bg-primary/10 rounded text-primary text-base font-bold font-bold">2</span>
              <span>เลื่อนลงมาแล้วกด <span className="text-foreground font-semibold">&quot;เพิ่มลงในหน้าจอโฮม&quot;</span></span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

