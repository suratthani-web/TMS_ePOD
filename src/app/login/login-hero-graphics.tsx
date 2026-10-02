// Decorative layer over /images/login-hero-v3.jpg (night city + holographic globe).
// The photo already carries the light trails and HUD look, so this layer stays
// light: live pings on the highway trucks and Thai feature tags. The viewBox equals
// the photo's pixel size (1024×572) with the same "slice" fit as the image's
// object-cover, so everything stays pinned at any screen size. aria-hidden.

const W = 1024
const H = 572

type Pt = [number, number]

// Trucks on the highway (traced on the photo)
const TRUCKS: Pt[] = [[335, 474], [468, 464], [587, 340]]

// Feature tags. 'r' tags sit near the login card → hidden on narrower screens.
const TAGS: { at?: Pt; box: Pt; w: number; h?: number; text: string; dot: string; side: "l" | "r" }[] = [
    // covers the English "REAL-TIME TRACKING" label baked into the photo
    { box: [114, 151], w: 120, h: 38, text: "ติดตามรถเรียลไทม์", dot: "#3ee08f", side: "l" },
    { at: TRUCKS[0], box: [150, 412], w: 146, text: "ePOD · รูปถ่าย + ลายเซ็น", dot: "#5b8cff", side: "l" },
    { at: TRUCKS[1], box: [372, 548], w: 122, text: "แจ้งลูกค้าอัตโนมัติ", dot: "#f5b544", side: "l" },
    { at: TRUCKS[2], box: [470, 300], w: 100, text: "ETA ตรงเวลา ✓", dot: "#3ee08f", side: "r" },
]

export function LoginHeroGraphics() {
    return (
        <svg
            className="login-hero-graphics pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
        >
            <defs>
                <filter id="lh-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>

            {/* live position pings on the highway trucks */}
            {TRUCKS.map(([x, y], i) => (
                <g key={`${x}-${y}`} transform={`translate(${x} ${y - 22})`}>
                    <circle className="lh-ping" r="6.5" fill="none" stroke="#67e8f9" strokeWidth="1.6" style={{ animationDelay: `${i * 0.7}s` }} />
                    <circle r="3.8" fill="#ffffff" stroke="#0891b2" strokeWidth="2" filter="url(#lh-glow)" />
                </g>
            ))}

            {/* feature tags */}
            {TAGS.map(t => {
                const [bx, by] = t.box
                const anchorX = t.at && t.at[0] < bx ? bx : bx + t.w
                return (
                    <g key={t.text} className={t.side === "r" ? "lh-tag-r" : undefined}>
                        {t.at && <line x1={t.at[0]} y1={t.at[1] - 22} x2={anchorX} y2={by - 5} stroke="#67e8f9" strokeOpacity="0.55" strokeWidth="1.1" />}
                        <rect x={bx} y={by + 7 - (t.h ?? 24)} width={t.w} height={t.h ?? 24} rx="6" fill="#031a33" fillOpacity="0.92" stroke="#67e8f9" strokeOpacity="0.55" strokeWidth="0.9" />
                        <circle cx={bx + 11} cy={by - 5} r="3" fill={t.dot} />
                        <text x={bx + 20} y={by - 1} fill="#e8f7ff" fontSize="10.5" fontFamily="inherit">{t.text}</text>
                    </g>
                )
            })}

            <style>{`
                .login-hero-graphics .lh-ping { transform-origin: center; transform-box: fill-box; animation: lh-ping 2.4s ease-out infinite; }
                @keyframes lh-ping { 0% { transform: scale(0.6); opacity: .9; } 100% { transform: scale(2.6); opacity: 0; } }
                @media (max-width: 1279px) { .login-hero-graphics .lh-tag-r { display: none; } }
                @media (prefers-reduced-motion: reduce) { .login-hero-graphics .lh-ping { animation: none; } }
            `}</style>
        </svg>
    )
}
