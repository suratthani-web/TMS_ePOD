"use client"

import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Palette, ArrowLeft, Moon, Sun, Monitor, Activity, Zap, ShieldCheck, Target, Sparkles, Cpu } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

type Theme = 'light' | 'dark' | 'system'

export default function ThemeSettingsPage() {
  const router = useRouter()
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme
    if (stored) {
        setTheme(stored)
    } else {
        setTheme('system')
    }
  }, [])

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    
    if (newTheme === 'dark') {
        document.documentElement.classList.add('dark')
    } else if (newTheme === 'light') {
        document.documentElement.classList.remove('dark')
    } else {
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-12 pb-20 p-4 lg:p-10">
        {/* Tactical Elite Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 bg-background/60 backdrop-blur-3xl p-10 rounded-br-[6rem] rounded-tl-[3rem] border border-border shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
            
            <div className="relative z-10 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.4em] text-base font-bold group/back italic">
                    <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                    ย้อนกลับ
                </button>
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-primary/20 rounded-[2.5rem] border-2 border-primary/30 shadow-[0_0_40px_rgba(255,30,133,0.2)] text-primary group-hover:scale-110 transition-all duration-500">
                        <Palette size={42} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-5xl font-black text-foreground tracking-widest uppercase leading-none italic premium-text-gradient">
                            การแสดงผล
                        </h1>
                        <p className="text-base font-bold font-black text-primary uppercase tracking-[0.6em] mt-2 opacity-80 italic">ปรับแต่งอินเตอร์เฟสและรูปแบบสีของระบบ</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-end gap-6 relative z-10">
                <div className="bg-muted/50 border border-border px-6 py-3 rounded-2xl flex items-center gap-3 backdrop-blur-md">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(255,30,133,1)]" />
                    <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">สถานะ: ปกติ</span>
                </div>
                <div className="flex items-center gap-4 bg-primary/10 p-4 rounded-2xl border border-primary/20">
                   <Cpu className="text-primary" size={18} />
                   <span className="text-base font-bold font-black text-foreground uppercase tracking-[0.3em] italic">การประมวลผล: GPU_ACCEL</span>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Light Mode Matrix */}
          <PremiumCard 
            className={cn(
                "group/theme cursor-pointer transition-all duration-700 bg-background/40 border-2 rounded-[3.5rem] overflow-hidden relative",
                theme === 'light' ? 'border-primary ring-4 ring-primary/20 scale-105' : 'border-border hover:border-border/20'
            )}
            onClick={() => handleThemeChange('light')}
          >
             <div className="p-10 flex flex-col items-center text-center space-y-8 relative z-10">
                <div className={cn(
                    "w-24 h-24 rounded-[2rem] flex items-center justify-center transition-all duration-700 shadow-2xl border-2",
                    theme === 'light' ? "bg-primary text-foreground border-border/20 rotate-12" : "bg-muted/50 text-muted-foreground border-border"
                )}>
                    <Sun size={42} strokeWidth={2.5} />
                </div>
                <div className="space-y-4">
                    <h3 className={cn(
                        "text-2xl font-black uppercase tracking-widest italic transition-colors",
                        theme === 'light' ? "text-primary" : "text-foreground"
                    )}>
                        โหมดสว่าง
                    </h3>
                    <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] leading-loose italic">
                        อินเตอร์เฟสความสว่างสูง เหมาะสำหรับการใช้งานกลางแจ้งหรือในที่สว่าง
                    </p>
                </div>
                {theme === 'light' && (
                    <div className="px-5 py-1.5 rounded-full bg-primary/20 text-primary text-base font-bold font-black uppercase tracking-widest border border-primary/30 animate-pulse italic">
                        เปิดใช้งานอยู่
                    </div>
                )}
             </div>
             {theme === 'light' && (
                 <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
             )}
          </PremiumCard>

          {/* Dark Mode Matrix */}
          <PremiumCard 
            className={cn(
                "group/theme cursor-pointer transition-all duration-700 bg-background/40 border-2 rounded-[3.5rem] overflow-hidden relative",
                theme === 'dark' ? 'border-primary ring-4 ring-primary/20 scale-105' : 'border-border hover:border-border/20'
            )}
            onClick={() => handleThemeChange('dark')}
          >
             <div className="p-10 flex flex-col items-center text-center space-y-8 relative z-10">
                <div className={cn(
                    "w-24 h-24 rounded-[2rem] flex items-center justify-center transition-all duration-700 shadow-2xl border-2",
                    theme === 'dark' ? "bg-primary text-foreground border-border/20 rotate-12" : "bg-muted/50 text-muted-foreground border-border"
                )}>
                    <Moon size={42} strokeWidth={2.5} />
                </div>
                <div className="space-y-4">
                    <h3 className={cn(
                        "text-2xl font-black uppercase tracking-widest italic transition-colors",
                        theme === 'dark' ? "text-primary" : "text-foreground"
                    )}>
                        โหมดมืด
                    </h3>
                    <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] leading-loose italic">
                        โทนสีเข้มพรีเมียม ช่วยถนอมสายตาและประหยัดพลังงานหน้าจอ
                    </p>
                </div>
                {theme === 'dark' && (
                    <div className="px-5 py-1.5 rounded-full bg-primary/20 text-primary text-base font-bold font-black uppercase tracking-widest border border-primary/30 animate-pulse italic">
                        เปิดใช้งานอยู่
                    </div>
                )}
             </div>
             {theme === 'dark' && (
                 <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
             )}
          </PremiumCard>

          {/* System Mode Matrix */}
          <PremiumCard 
            className={cn(
                "group/theme cursor-pointer transition-all duration-700 bg-background/40 border-2 rounded-[3.5rem] overflow-hidden relative",
                theme === 'system' ? 'border-primary ring-4 ring-primary/20 scale-105' : 'border-border hover:border-border/20'
            )}
            onClick={() => handleThemeChange('system')}
          >
             <div className="p-10 flex flex-col items-center text-center space-y-8 relative z-10">
                <div className={cn(
                    "w-24 h-24 rounded-[2rem] flex items-center justify-center transition-all duration-700 shadow-2xl border-2",
                    theme === 'system' ? "bg-primary text-foreground border-border/20 rotate-12" : "bg-muted/50 text-muted-foreground border-border"
                )}>
                    <Monitor size={42} strokeWidth={2.5} />
                </div>
                <div className="space-y-4">
                    <h3 className={cn(
                        "text-2xl font-black uppercase tracking-widest italic transition-colors",
                        theme === 'system' ? "text-primary" : "text-foreground"
                    )}>
                        ตามระบบ
                    </h3>
                    <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] leading-loose italic">
                        ปรับเปลี่ยนรูปแบบสีโดยอัตโนมัติตามการตั้งค่าของอุปกรณ์คุณ
                    </p>
                </div>
                {theme === 'system' && (
                    <div className="px-5 py-1.5 rounded-full bg-primary/20 text-primary text-base font-bold font-black uppercase tracking-widest border border-primary/30 animate-pulse italic">
                        เปิดใช้งานอยู่
                    </div>
                )}
             </div>
             {theme === 'system' && (
                 <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />
             )}
          </PremiumCard>
        </div>

        {/* Global Advisory */}
        <div className="mt-20 p-12 rounded-[3.5rem] bg-indigo-500/5 border-2 border-indigo-500/10 flex flex-col md:flex-row gap-10 items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-indigo-500/5 to-transparent pointer-events-none" />
            <div className="p-6 rounded-[2rem] bg-indigo-500/20 text-indigo-400 border-2 border-indigo-500/30 shadow-2xl animate-pulse">
                <Sparkles size={32} />
            </div>
            <div className="space-y-4 text-center md:text-left flex-1">
                <p className="text-xl font-black text-indigo-400 italic uppercase tracking-widest">ข้อมูลทางเทคนิค</p>
                <p className="text-xl font-bold text-muted-foreground leading-relaxed uppercase tracking-wider italic">
                    รูปทรงและเลเยอร์ทั้งหมดถูกเรนเดอร์ด้วยระบบ Tactical Shading ความละเอียดสูง <br />
                    การเปลี่ยนรูปแบบจะทำการคำนวณการแสดงผลใหม่ทั้งหมดเพื่อให้ได้ประสิทธิภาพสูงสุด
                </p>
            </div>
            <PremiumButton variant="outline" className="h-14 px-10 rounded-2xl border-border text-foreground gap-3 uppercase font-black text-base font-bold tracking-[0.3em] ml-auto italic">
                <Activity size={18} /> ปรับจูนการแสดงผล
            </PremiumButton>
        </div>
      </div>
    </DashboardLayout>
  )
}
