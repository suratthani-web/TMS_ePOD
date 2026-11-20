"use client"

import { useState } from "react"
import {
  BookOpen,
  LogIn,
  ClipboardCheck,
  Navigation,
  Camera,
  CheckCircle2,
  MapPin,
  Signature,
  PartyPopper,
  ShieldCheck,
  FileDown,
  ZoomIn,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react"

type StepImage = {
  src: string
  caption: string
}

type ManualStep = {
  stepNumber: number
  title: string
  subtitle: string
  description: string
  highlights: string[]
  accent: string
  badgeBg: string
  icon: React.ReactNode
  images: StepImage[]
}

const STEPS: ManualStep[] = [
  {
    stepNumber: 1,
    title: "เข้าสู่ระบบ (Login)",
    subtitle: "รหัสพนักงาน / เบอร์โทรศัพท์",
    description:
      "เปิดแอป DRouteMind กรอกรหัสพนักงานหรือเบอร์โทรศัพท์ และรหัสผ่านปลอดภัย จากนั้นกดปุ่มสีน้ำเงิน 'เข้าสู่ระบบ'",
    highlights: ['กดปุ่ม "เข้าสู่ระบบ"'],
    accent: "bg-blue-600",
    badgeBg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: <LogIn size={20} />,
    images: [
      {
        src: "/manual/steps/step-01-login.jpg",
        caption: "ขั้นตอนที่ 1: กรอกไอดี/เบอร์โทร รหัสผ่าน แล้วกด 'เข้าสู่ระบบ'",
      },
    ],
  },
  {
    stepNumber: 2,
    title: "ดูงานและกดรับงาน",
    subtitle: "หน้าแรก → รายละเอียดงาน",
    description:
      "ที่หน้าแรกจะพบการ์ดงานปัจจุบัน ตรวจสอบลูกค้า จุดรับ-จุดส่ง แล้วกดปุ่มสีส้ม 'เริ่มจัดการงานนี้' จากนั้นกดปุ่มสีน้ำเงิน 'เริ่มงาน'",
    highlights: ['ปุ่มส้ม "เริ่มจัดการงานนี้"', 'ปุ่มน้ำเงิน "เริ่มงาน"'],
    accent: "bg-orange-500",
    badgeBg: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    icon: <ClipboardCheck size={20} />,
    images: [
      {
        src: "/manual/steps/step-02-home-job.jpg",
        caption: "ขั้นตอนที่ 2.1: แตะปุ่มสีส้ม 'เริ่มจัดการงานนี้' ที่หน้าแรก",
      },
      {
        src: "/manual/steps/step-03-start-job.jpg",
        caption: "ขั้นตอนที่ 2.2: ตรวจสอบข้อมูลงาน แล้วกดปุ่ม 'เริ่มงาน'",
      },
    ],
  },
  {
    stepNumber: 3,
    title: "เดินทางและถึงจุดรับสินค้า",
    subtitle: "นำทาง → ถึงจุดรับสินค้า → รับสินค้าเข้า",
    description:
      "กดปุ่มสีเขียว 'นำทาง' เพื่อเปิดแผนที่ไปยังจุดรับของ เมื่อถึงหน้างานให้กด 'ถึงจุดรับสินค้า' และเมื่อขึ้นของเสร็จให้กดปุ่มเขียว 'รับสินค้าเข้า'",
    highlights: ['"นำทาง"', '"ถึงจุดรับสินค้า"', 'ปุ่มเขียว "รับสินค้าเข้า"'],
    accent: "bg-sky-600",
    badgeBg: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    icon: <Navigation size={20} />,
    images: [
      {
        src: "/manual/steps/step-04-arrive-pickup.jpg",
        caption: "ขั้นตอนที่ 3.1: กด 'นำทาง' และเมื่อถึงโกดังกด 'ถึงจุดรับสินค้า'",
      },
      {
        src: "/manual/steps/step-05-receive-goods.jpg",
        caption: "ขั้นตอนที่ 3.2: กดปุ่มสีเขียว 'รับสินค้าเข้า' เพื่อบันทึกหลักฐาน",
      },
    ],
  },
  {
    stepNumber: 4,
    title: "ถ่ายรูปและเซ็นชื่อรับสินค้า",
    subtitle: "หลักฐานการรับสินค้า",
    description:
      "กด 'ถ่ายรูปสินค้า' หรือ 'แนบรูปภาพ' เพื่อถ่ายสภาพสินค้าขณะรับ จากนั้นให้ผู้ส่งของลงชื่อในช่อง 'ลายเซ็นพนักงาน (ผู้ส่งของ)' (กด 'ล้าง' ได้หากเซ็นผิด)",
    highlights: ['"ถ่ายรูปสินค้า" / "แนบรูปภาพ"', '"ลายเซ็นพนักงาน (ผู้ส่งของ)"'],
    accent: "bg-indigo-600",
    badgeBg: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
    icon: <Camera size={20} />,
    images: [
      {
        src: "/manual/steps/step-06-pickup-form.jpg",
        caption: "ขั้นตอนที่ 4.1: เลือกถ่ายรูปสินค้า/แนบรูป และช่องลงลายเซ็น",
      },
      {
        src: "/manual/steps/step-07-pickup-filled.jpg",
        caption: "ขั้นตอนที่ 4.2: ตัวอย่างเมื่อถ่ายรูปและลงลายเซ็นเรียบร้อยแล้ว",
      },
    ],
  },
  {
    stepNumber: 5,
    title: "ยืนยันการรับของเข้า",
    subtitle: "บันทึกและเริ่มจัดส่ง",
    description:
      "เลื่อนลงด้านล่างตรวจสอบรูปถ่ายและลายเซ็นให้ครบถ้วน แล้วกดปุ่มสีน้ำเงิน 'บันทึกและดำเนินการต่อ' เพื่อเปลี่ยนสถานะเป็นกำลังขนส่ง",
    highlights: ['ปุ่มน้ำเงิน "บันทึกและดำเนินการต่อ"'],
    accent: "bg-blue-600",
    badgeBg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: <CheckCircle2 size={20} />,
    images: [
      {
        src: "/manual/steps/step-08-pickup-confirm.jpg",
        caption: "ขั้นตอนที่ 5: กด 'บันทึกและดำเนินการต่อ' เพื่อยืนยันรับสินค้าเข้า",
      },
    ],
  },
  {
    stepNumber: 6,
    title: "นำทางไปส่งของ & ถึงจุดหมาย",
    subtitle: "นำทาง → ถึงจุดส่งสินค้า → บันทึกส่งงาน",
    description:
      "กด 'นำทาง' เพื่อเดินทางไปบ้านหรือโกดังลูกค้า เมื่อถึงปลายทางให้กด 'ถึงจุดส่งสินค้า' และเตรียมส่งมอบโดยกดปุ่มสีเขียว 'บันทึกส่งงาน'",
    highlights: ['"นำทาง"', '"ถึงจุดส่งสินค้า"', 'ปุ่มเขียว "บันทึกส่งงาน"'],
    accent: "bg-teal-600",
    badgeBg: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    icon: <MapPin size={20} />,
    images: [
      {
        src: "/manual/steps/step-09-arrive-delivery.jpg",
        caption: "ขั้นตอนที่ 6.1: ถึงปลายทางแล้วกด 'ถึงจุดส่งสินค้า'",
      },
      {
        src: "/manual/steps/step-10-record-delivery.jpg",
        caption: "ขั้นตอนที่ 6.2: กดปุ่มสีเขียว 'บันทึกส่งงาน' เพื่อเปิดหน้า ePOD",
      },
    ],
  },
  {
    stepNumber: 7,
    title: "ถ่ายรูปส่งของ & ให้ลูกค้าเซ็นชื่อ (ePOD)",
    subtitle: "ส่งงาน (POD)",
    description:
      "กด 'ถ่ายรูปสินค้า' หรือ 'แนบรูปภาพ' ถ่ายสินค้าพร้อมเอกสารบิล ให้ผู้รับสินค้าเซ็นชื่อในช่อง '2. ลายเซ็นผู้รับ' แล้วกดปุ่มสีน้ำเงิน 'ยืนยันการส่งงาน'",
    highlights: ['"ถ่ายรูปสินค้า"', '"2. ลายเซ็นผู้รับ"', 'ปุ่มน้ำเงิน "ยืนยันการส่งงาน"'],
    accent: "bg-rose-600",
    badgeBg: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    icon: <Signature size={20} />,
    images: [
      {
        src: "/manual/steps/step-11-pod-form.jpg",
        caption: "ขั้นตอนที่ 7.1: ถ่ายรูปสินค้าที่ส่งมอบและให้ลูกค้าลงลายเซ็น",
      },
      {
        src: "/manual/steps/step-12-pod-signed.jpg",
        caption: "ขั้นตอนที่ 7.2: เซ็นรับครบแล้ว กดปุ่ม 'ยืนยันการส่งงาน'",
      },
    ],
  },
  {
    stepNumber: 8,
    title: "ส่งงานสำเร็จ!",
    subtitle: "ปิดงานสมบูรณ์ 5 ขั้นตอน",
    description:
      "หน้าจอจะแสดง 'ส่งงานสำเร็จ!' สามารถกด 'กลับหน้ารายละเอียดงาน' เพื่อตรวจดูสถานะติ๊กถูกสีเขียวครบทั้ง 5 ขั้นตอน และแถบ 'งานเสร็จสิ้นแล้ว'",
    highlights: ['หน้าจอ "ส่งงานสำเร็จ!"', 'ติ๊กถูกสีเขียวครบ 5 ขั้นตอน'],
    accent: "bg-emerald-600",
    badgeBg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: <PartyPopper size={20} />,
    images: [
      {
        src: "/manual/steps/step-13-success.jpg",
        caption: "ขั้นตอนที่ 8.1: หน้าจอยืนยัน 'ส่งงานสำเร็จ!'",
      },
      {
        src: "/manual/steps/step-14-completed.jpg",
        caption: "ขั้นตอนที่ 8.2: ติ๊กถูกสีเขียวครบ 5 ขั้นตอน 'งานเสร็จสิ้นแล้ว'",
      },
    ],
  },
]

const ALL_IMAGES: Array<StepImage & { stepTitle: string }> = STEPS.flatMap((step) =>
  step.images.map((img) => ({
    ...img,
    stepTitle: `${step.stepNumber}. ${step.title}`,
  }))
)

export function ManualClient() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const openModalBySrc = (src: string) => {
    const idx = ALL_IMAGES.findIndex((item) => item.src === src)
    if (idx >= 0) setActiveIndex(idx)
  }

  const activeImage = activeIndex !== null ? ALL_IMAGES[activeIndex] : null

  return (
    <div className="pt-20 px-4 sm:px-6 pb-32 space-y-6">
      {/* Intro & PDF Download Card */}
      <div className="rounded-[2rem] p-6 bg-gradient-to-br from-[#17265f] via-[#131d47] to-card border border-white/15 shadow-xl relative overflow-hidden">
        <div className="absolute -top-6 -right-6 opacity-10 pointer-events-none">
          <BookOpen size={140} />
        </div>

        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <BookOpen size={28} className="text-amber-400" />
            </div>
            <div>
              <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-400/30 mb-1">
                DRouteMind V1.2.5
              </span>
              <h2 className="text-xl font-black text-white leading-tight">
                คู่มือพนักงานขับรถ
              </h2>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                ขั้นตอนใช้งานจริงตั้งแต่รับงานจนปิดงาน (ePOD)
              </p>
            </div>
          </div>

          <a
            href="/manual/driver_guide_droutemind.pdf"
            download="driver_guide_droutemind.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between gap-3 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] transition-all text-white font-extrabold text-sm px-4 py-3.5 rounded-2xl shadow-lg shadow-orange-950/40"
          >
            <span className="flex items-center gap-2.5">
              <FileDown size={20} className="shrink-0" />
              <span>ดาวน์โหลดคู่มือ PDF (ส่ง/เปิดอ่านออฟไลน์)</span>
            </span>
            <ExternalLink size={16} className="shrink-0 opacity-85" />
          </a>

          <p className="text-[11px] text-slate-300/80 font-medium leading-relaxed">
            แนะนำ: กดที่รูปภาพหน้าจอในแต่ละขั้นตอนเพื่อขยายดูแบบเต็มจอ หรือดาวน์โหลดไฟล์ PDF เก็บไว้เปิดดูผ่าน LINE ได้ทันที
          </p>
        </div>
      </div>

      {/* Workflow Section Header */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-1.5 h-7 bg-orange-500 rounded-full" />
        <div>
          <h3 className="text-lg font-black text-foreground tracking-tight leading-none">
            ขั้นตอนการทำงาน (8 ขั้นตอน)
          </h3>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            อัปเดตล่าสุดตามหน้าจอแอป DRouteMind V1.2.5
          </p>
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-4">
        {STEPS.map((step) => (
          <section
            key={step.stepNumber}
            className="bg-card rounded-[1.75rem] p-5 border border-border shadow-md space-y-4"
          >
            <div className="flex items-start gap-3.5">
              <div
                className={`${step.accent} text-white w-11 h-11 rounded-2xl shadow-md shrink-0 flex items-center justify-center`}
              >
                {step.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${step.badgeBg}`}
                  >
                    ขั้นตอนที่ {step.stepNumber}
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground truncate">
                    {step.subtitle}
                  </span>
                </div>
                <h4 className="text-base font-black text-foreground leading-snug">
                  {step.title}
                </h4>
              </div>
            </div>

            <p className="text-sm text-muted-foreground font-medium leading-relaxed">
              {step.description}
            </p>

            {/* Button Highlights */}
            <div className="flex flex-wrap gap-1.5">
              {step.highlights.map((hl) => (
                <span
                  key={hl}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-muted/70 text-foreground border border-border"
                >
                  {hl}
                </span>
              ))}
            </div>

            {/* Screenshot Thumbnails */}
            <div
              className={`grid gap-3 ${
                step.images.length > 1 ? "grid-cols-2" : "grid-cols-1 max-w-[200px]"
              }`}
            >
              {step.images.map((img) => (
                <button
                  key={img.src}
                  type="button"
                  onClick={() => openModalBySrc(img.src)}
                  className="group relative rounded-2xl overflow-hidden border border-border bg-black/40 aspect-[9/19] text-left active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <img
                    src={img.src}
                    alt={img.caption}
                    loading="lazy"
                    className="w-full h-full object-cover object-top"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold text-white line-clamp-1">
                      แตะเพื่อขยายรูป
                    </span>
                    <ZoomIn size={14} className="text-amber-400 shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Important Checklist Section */}
      <div className="bg-slate-900 rounded-[2rem] p-6 text-white space-y-4 border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute -bottom-8 -right-8 opacity-10 pointer-events-none">
          <ShieldCheck size={160} />
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <ShieldCheck className="text-amber-400 shrink-0" size={26} />
          <div>
            <h3 className="text-lg font-black tracking-tight">ข้อควรระวังสำคัญ</h3>
            <p className="text-xs text-slate-400 font-medium">
              4 ข้อที่คนขับต้องปฏิบัติตามทุกเที่ยวงาน
            </p>
          </div>
        </div>

        <div className="space-y-3 relative z-10 text-sm">
          <div className="flex gap-3 items-start">
            <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0" />
            <p className="text-slate-300 font-medium leading-relaxed">
              <span className="text-white font-bold">เปิด GPS ตลอดเวลา:</span>{" "}
              เพื่อให้ระบบบันทึกเวลาและพิกัดเข้า-ออกจุดรับและจุดส่งได้แม่นยำ
            </p>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-2 h-2 rounded-full bg-amber-400 mt-2 shrink-0" />
            <p className="text-slate-300 font-medium leading-relaxed">
              <span className="text-white font-bold">ถ่ายรูปให้ชัดเจน:</span>{" "}
              รูปถ่ายสินค้าขณะรับ-ส่งและลายเซ็น (ePOD) เป็นหลักฐานสำคัญในการจ่ายค่าเที่ยว
            </p>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-2 h-2 rounded-full bg-emerald-400 mt-2 shrink-0" />
            <p className="text-slate-300 font-medium leading-relaxed">
              <span className="text-white font-bold">กดสถานะตามจริงทุกจุด:</span>{" "}
              เริ่มงาน → ถึงจุดรับ → รับสินค้าเข้า → ถึงจุดส่ง → บันทึกส่งงาน ห้ามกดข้ามขั้นตอน
            </p>
          </div>
          <div className="flex gap-3 items-start">
            <div className="w-2 h-2 rounded-full bg-rose-400 mt-2 shrink-0" />
            <p className="text-slate-300 font-medium leading-relaxed">
              <span className="text-white font-bold">พบปัญหาแจ้งแอดมิน / SOS ทันที:</span>{" "}
              หากสินค้าเสียหาย ติดต่อลูกค้าไม่ได้ หรือแอปขัดข้อง ให้ถ่ายรูปและแจ้งผ่านแชท/SOS ทันที
            </p>
          </div>
        </div>
      </div>

      {/* Full-Screen Image Zoom Modal */}
      {activeImage && activeIndex !== null && (
        <div
          className="fixed inset-0 z-[200] bg-black/92 backdrop-blur-md flex flex-col justify-between p-4 pt-[calc(1rem+var(--sat))] pb-[calc(1rem+var(--sab))]"
          onClick={() => setActiveIndex(null)}
        >
          <div
            className="flex items-center justify-between gap-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-400 truncate">
                {activeImage.stepTitle}
              </p>
              <p className="text-[11px] text-slate-300">
                รูปที่ {activeIndex + 1} จาก {ALL_IMAGES.length}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveIndex(null)}
              aria-label="ปิดหน้าต่างขยายรูป"
              className="w-10 h-10 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white active:scale-95"
            >
              <X size={20} />
            </button>
          </div>

          <div
            className="flex-1 flex items-center justify-center my-3 min-h-0 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() =>
                setActiveIndex(
                  (activeIndex - 1 + ALL_IMAGES.length) % ALL_IMAGES.length
                )
              }
              aria-label="รูปก่อนหน้า"
              className="absolute left-1 z-10 w-10 h-10 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center active:scale-95"
            >
              <ChevronLeft size={22} />
            </button>

            <img
              src={activeImage.src}
              alt={activeImage.caption}
              className="max-h-full max-w-full rounded-2xl border border-white/15 shadow-2xl object-contain"
            />

            <button
              type="button"
              onClick={() =>
                setActiveIndex((activeIndex + 1) % ALL_IMAGES.length)
              }
              aria-label="รูปถัดไป"
              className="absolute right-1 z-10 w-10 h-10 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center active:scale-95"
            >
              <ChevronRight size={22} />
            </button>
          </div>

          <div
            className="bg-white/10 border border-white/15 rounded-2xl px-4 py-3 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs sm:text-sm font-bold text-white leading-snug">
              {activeImage.caption}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
