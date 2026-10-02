"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, FileCheck2, Loader2, MapPinned, BarChart3, Truck } from "lucide-react"
import { login } from "./actions"
import { LoginHeroGraphics } from "./login-hero-graphics"

function errorText(error: string) {
  if (error === 'Invalid credentials') return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
  if (error === 'session_missing') return 'กรุณาเข้าสู่ระบบก่อนใช้งาน'
  if (error === 'session_invalid') return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'
  if (error === 'IP_PENDING') return 'ตรวจพบการเข้าใช้งานจากอุปกรณ์หรือสถานที่ใหม่ กรุณารอ Super Admin อนุมัติการเข้าใช้งานครั้งแรกเพื่อความปลอดภัย'
  if (error === 'IP_BLOCKED') return 'การเข้าใช้งานจาก IP นี้ถูกระงับชั่วคราว กรุณาติดต่อผู้ดูแลระบบ'
  if (error.includes('not linked')) return 'บัญชีของคุณยังไม่ได้ผูกกับโปรไฟล์ลูกค้า กรุณาติดต่อแอดมิน'
  return error
}

const FEATURES = [
  { icon: MapPinned, label: "ติดตามรถเรียลไทม์" },
  { icon: FileCheck2, label: "หลักฐานการส่ง ePOD" },
  { icon: BarChart3, label: "รายงานลูกค้าอัตโนมัติ" },
]

function StaffLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
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
    // Fixed dark palette (not theme tokens): the page sits on a photo in every theme.
    <div className="relative min-h-screen overflow-hidden bg-[#00122e] text-white">
      {/* Photo + smart-logistics overlay share the same center/cover fit */}
      <Image
        src="/images/login-hero-v3.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <LoginHeroGraphics />
      {/* readability: deepen the right side where the text and form sit */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-[#001E4C]/20 to-[#001E4C]/85" />

      {/* Left side stays photo + route graphics only; all text lives on the dark right side */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-8 lg:justify-end lg:px-[6vw]">
        <div className="w-full max-w-[440px] space-y-6">
          {/* brand + message */}
          <div className="[text-shadow:0_2px_12px_rgba(0,18,46,0.6)]">
            <div className="flex items-center gap-3">
              <div className="relative h-11 w-11 overflow-hidden rounded-full bg-white/90 ring-1 ring-white/40">
                <Image src="/drouteMind-mark.png" alt="" fill sizes="44px" className="object-cover" />
              </div>
              <div className="leading-tight">
                <p className="text-lg font-bold tracking-tight">DRouteMind</p>
                <p className="text-xs text-white/70">Smart Transport Management · DD Transport</p>
              </div>
            </div>
            <h1 className="mt-6 text-3xl font-bold leading-tight xl:text-4xl">ทุกเที่ยววิ่ง เห็นชัด ส่งตรงเวลา</h1>
            <p className="mt-2 text-sm text-white/75">วางแผน ติดตาม และยืนยันการส่งสินค้าในระบบเดียว ด้วยข้อมูลจริงจากหน้างาน</p>
          </div>

          {/* login card */}
          <section className="rounded-2xl border border-white/15 bg-[#001E4C]/70 p-7 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
            <h2 className="text-2xl font-bold">เข้าสู่ระบบ</h2>
            <p className="mt-1 text-sm text-white/70">สำหรับแอดมิน ทีมงาน และลูกค้า</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-white/85">ชื่อผู้ใช้</label>
                <input
                  id="email"
                  name="email"
                  type="text"
                  autoComplete="username"
                  required
                  className="h-12 w-full rounded-xl border border-white/15 bg-white/10 px-4 text-base text-white placeholder:text-white/40 outline-none transition focus:border-[#7fa8ff] focus:ring-2 focus:ring-[#7fa8ff]/40"
                  placeholder="ชื่อผู้ใช้หรืออีเมล"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-white/85">รหัสผ่าน</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="h-12 w-full rounded-xl border border-white/15 bg-white/10 px-4 text-base text-white placeholder:text-white/40 outline-none transition focus:border-[#7fa8ff] focus:ring-2 focus:ring-[#7fa8ff]/40"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div role="alert" className="rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">
                  {errorText(error)}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0047BB] text-base font-semibold text-white shadow-lg shadow-[#0047BB]/30 transition hover:bg-[#1858d1] disabled:opacity-70"
              >
                {isPending ? <><Loader2 size={18} className="animate-spin" /> กำลังเข้าสู่ระบบ...</> : "เข้าสู่ระบบ"}
              </button>
            </form>

            <div className="mt-6 border-t border-white/10 pt-5">
              <Link
                href="/mobile/login"
                className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition hover:bg-white/10"
              >
                <span className="flex items-center gap-2.5">
                  <Truck size={18} className="text-[#9fc0ff]" />
                  คนขับรถ? เข้าแอปคนขับ
                </span>
                <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
              </Link>
            </div>
          </section>

          <ul className="flex flex-wrap gap-2 text-xs text-white/80">
            {FEATURES.map(f => (
              <li key={f.label} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#001E4C]/40 px-2.5 py-1.5 backdrop-blur">
                <f.icon size={14} className="text-[#9fc0ff]" /> {f.label}
              </li>
            ))}
          </ul>
          <p className="text-xs text-white/50">© 2026 DRouteMind · DD Transport. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}

export default function StaffLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#00122e] flex items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <StaffLoginContent />
    </Suspense>
  )
}
