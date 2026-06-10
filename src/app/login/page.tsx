"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Shield, X, Truck, Building } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { login } from "./actions"
import Image from "next/image"

function StaffLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'info' | 'staff_form'>('info')
  const [isPending, setIsPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  
  const queryError = searchParams.get("error")
  const error = errorMessage || queryError

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsPending(true)
    setErrorMessage("")
    const formData = new FormData(event.currentTarget)
    try {
      const result = await login(undefined, formData)
      if (result && result.error) {
        setErrorMessage(result.error)
      }
    } catch (e: unknown) {
      // If Next.js threw a NEXT_REDIRECT error, we must rethrow it
      // so Next.js router can perform the server-side redirection successfully.
      const message = e instanceof Error ? e.message : String(e)
      if (message === "NEXT_REDIRECT" || message.includes("NEXT_REDIRECT")) {
        throw e
      }
      setErrorMessage(message || "เกิดข้อผิดพลาด")
    } finally {
      setIsPending(false)
    }
  }

  // Mobile detection and redirect
  useEffect(() => {
    const checkMobile = () => {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('type') === 'staff') return; // Bypass redirect

      const userAgent = navigator.userAgent || navigator.vendor || (window as { opera?: string }).opera;
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent || '');
      const isSmallScreen = window.innerWidth <= 768;
      
      if (isMobile || isSmallScreen) {
        router.replace('/mobile/login');
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-background">
      {/* Corporate CI Background (Navy #001E4C / Deep Black) */}
      <div className="absolute inset-0 z-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/20 via-transparent to-background" />
      </div>

      {/* Glass Decor Elements */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] -translate-y-1/2 animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent/20 rounded-full blur-[120px] translate-y-1/2 animate-pulse" />
      
      <div className="w-full max-w-5xl space-y-12 relative z-10 text-center">
        {/* Logo & Header Section - Balanced Edition */}
        <div className="space-y-6 flex flex-col items-center animate-in fade-in slide-in-from-top-4 duration-1000">
            <div className={cn(
                "relative w-56 h-56 transition-all duration-700 group-hover:scale-105 logo-container-pure",
                "bg-muted rounded-full shadow-2xl border border-border/10",
                "p-6"
            )}>
                <div className="relative w-full h-full rounded-full overflow-hidden bg-background/20 flex items-center justify-center">
                    <Image 
                        src="/logo2.png" 
                        alt="LogisPro" 
                        fill 
                        sizes="(max-width: 768px) 100vw, 224px"
                        priority
                        className="object-contain logo-pure transition-all duration-700 dark:brightness-110" 
                    />
                </div>
            </div>
            <div className="space-y-1">
                <h1 className="text-6xl font-sans font-black text-accent tracking-tighter drop-shadow-lg uppercase italic">
                    Logis<span className="text-primary">Pro</span>
                </h1>
                <p className="text-lg text-muted-foreground font-medium tracking-wide">
                    Sweet deliveries, serious logistics.
                </p>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 px-4 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
            {/* Driver Login Option */}
            <div 
                onClick={() => router.push('/mobile/login')}
                className="group cursor-pointer relative overflow-hidden glass-panel rounded-[3rem] p-8 transition-all duration-500 hover:shadow-[0_20px_60px_rgba(255,30,133,0.15)] hover:-translate-y-3 text-center flex flex-col items-center gap-6"
            >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center shadow-2xl group-hover:rotate-6 group-hover:bg-primary transition-all duration-700">
                    <Truck className="text-primary group-hover:text-white w-8 h-8" strokeWidth={2.5} />
                </div>
                <div className="space-y-1">
                    <h2 className="text-3xl font-black text-accent tracking-tighter">DRIVER</h2>
                    <p className="text-muted-foreground text-[10px] font-bold font-black uppercase tracking-widest">Fleet Portal</p>
                </div>
                <button className="w-full h-14 rounded-xl bg-primary hover:brightness-110 text-foreground font-bold uppercase tracking-wide shadow-xl shadow-primary/20 transition-all">
                    Start Engine
                </button>
            </div>

            {/* Customer Login Option */}
            <div 
                onClick={() => setActiveTab('staff_form')}
                className="group cursor-pointer relative overflow-hidden glass-panel rounded-[3rem] p-8 transition-all duration-500 hover:shadow-[0_20px_60px_rgba(59,130,246,0.15)] hover:-translate-y-3 text-center flex flex-col items-center gap-6"
            >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center shadow-2xl group-hover:scale-110 group-hover:bg-blue-600 transition-all duration-700">
                    <Building className="text-blue-600 group-hover:text-white w-8 h-8" strokeWidth={2.5} />
                </div>
                <div className="space-y-1">
                    <h2 className="text-3xl font-black text-accent tracking-tighter">CUSTOMER</h2>
                    <p className="text-muted-foreground text-[10px] font-bold font-black uppercase tracking-widest">Consignor Portal</p>
                </div>
                <button className="w-full h-14 rounded-xl bg-blue-600 hover:brightness-110 text-white font-bold uppercase tracking-wide shadow-xl shadow-blue-600/20 transition-all">
                    Access Grid
                </button>
            </div>

            {/* Staff Login Option */}
            <div 
                onClick={() => setActiveTab('staff_form')}
                className="group cursor-pointer relative overflow-hidden glass-panel rounded-[3rem] p-8 transition-all duration-500 hover:shadow-[0_20px_60px_rgba(147,51,234,0.15)] hover:-translate-y-3 text-center flex flex-col items-center gap-6"
            >
                <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-16 h-16 bg-accent/10 border border-accent/20 rounded-2xl flex items-center justify-center shadow-2xl group-hover:-rotate-6 group-hover:bg-accent transition-all duration-700">
                    <Shield className="text-accent group-hover:text-white w-8 h-8" strokeWidth={2.5} />
                </div>
                <div className="space-y-1">
                    <h2 className="text-3xl font-black text-accent tracking-tighter">ADMIN</h2>
                    <p className="text-muted-foreground text-[10px] font-bold font-black uppercase tracking-widest">Command Center</p>
                </div>
                <button className="w-full h-14 rounded-xl bg-muted/50 border border-border/10 hover:bg-muted/80 text-foreground font-black text-base font-bold uppercase tracking-wide shadow-xl transition-all">
                    Command Key
                </button>
            </div>
        </div>

        {/* Staff Login Modal */}
        {activeTab === 'staff_form' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/60 backdrop-blur-md animate-in fade-in duration-300">
                <div className="bg-card/90 backdrop-blur-2xl border border-border/10 rounded-[2.5rem] p-10 w-full max-w-sm shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-purple-500" />
                    
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute right-6 top-6 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-xl"
                        onClick={() => setActiveTab('info')}
                    >
                        <X className="w-6 h-6" />
                    </Button>
                    
                    <div className="text-center mb-10">
                        <h3 className="text-3xl font-black text-accent mb-2 underline decoration-primary/30 underline-offset-8">Login</h3>
                        <p className="text-xl text-muted-foreground font-medium tracking-tight">Enterprise staff authentication</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-3 text-left">
                            <Label htmlFor="email" className="text-muted-foreground text-base font-bold font-black uppercase tracking-normal ml-1">Username / Fleet ID</Label>
                            <Input 
                                id="email" 
                                name="email" 
                                type="text" 
                                placeholder="e.g. admin_pro_01" 
                                required 
                                className="h-14 rounded-2xl bg-muted/50 border-border/10 text-foreground placeholder:text-muted-foreground focus:ring-primary/50" 
                            />
                        </div>
                        <div className="space-y-3 text-left">
                            <Label htmlFor="password" className="text-muted-foreground text-base font-bold font-black uppercase tracking-normal ml-1">Security Key</Label>
                            <Input 
                                id="password" 
                                name="password" 
                                type="password" 
                                placeholder="••••••••" 
                                required 
                                className="h-14 rounded-2xl bg-muted/50 border-border/10 text-foreground placeholder:text-muted-foreground focus:ring-primary/50" 
                            />
                        </div>
                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-lg font-bold font-bold rounded-xl animate-shake">
                                {error === 'Invalid credentials' ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : 
                                 error === 'session_missing' ? 'กรุณาเข้าสู่ระบบก่อนใช้งาน' :
                                 error === 'session_invalid' ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' : 
                                 error === 'IP_PENDING' ? 'ตรวจพบการเข้าใช้งานจากอุปกรณ์หรือสถานที่ใหม่ กรุณารอ Super Admin อนุมัติการเข้าใช้งานครั้งแรกเพื่อความปลอดภัย' :
                                 error === 'IP_BLOCKED' ? 'การเข้าใช้งานจาก IP นี้ถูกระงับชั่วคราว กรุณาติดต่อผู้ดูแลระบบ' :
                                 error.includes('not linked') ? 'บัญชีของคุณยังไม่ได้ผูกกับโปรไฟล์ลูกค้า กรุณาติดต่อแอดมิน' :
                                 error}
                            </div>
                        )}
                        <Button type="submit" className="w-full h-14 bg-primary hover:brightness-110 text-foreground rounded-2xl shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]" disabled={isPending}>
                            {isPending ? "AUTHENTICATING..." : "CONFIRM LOGIN"}
                        </Button>
                    </form>
                </div>
            </div>
        )}

        <div className="space-y-4 animate-in fade-in duration-1000 delay-700 pt-10">
            <p className="text-base font-bold text-muted-foreground font-black uppercase tracking-wide">
                © 2024 <span className="text-primary/60">LOGIS-PRO</span> COMMAND. ALL RIGHTS RESERVED.
            </p>
            <div className="flex justify-center gap-8 text-base font-bold text-muted-foreground font-black uppercase tracking-normal">
                <a href="#" className="hover:text-primary transition-colors">Privacy</a>
                <a href="#" className="hover:text-primary transition-colors">Terms</a>
            </div>
        </div>
      </div>
    </div>
  )
}

export default function StaffLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <StaffLoginContent />
    </Suspense>
  )
}

