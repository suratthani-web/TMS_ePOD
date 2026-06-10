# DESIGN.md

Design system guidance for TMS_ePOD / LOGIS-PRO 360.

Use this file when changing UI, UX, layout, theme, components, or visual behavior. The product is not a marketing site. It is an operational transport management system for dispatchers, admins, drivers, customers, finance users, and fleet teams.

## Brand Identity

Product names used in the app:

- LOGIS-PRO 360
- TMS_ePOD
- COMMAND CENTRE

The visual language should feel like a logistics command system:

- fast to scan
- precise and operational
- dense but organized
- calm under pressure
- reliable for real daily work

Avoid landing-page aesthetics, decorative hero layouts, oversized marketing copy, generic SaaS gradients, and playful consumer styling.

## Anti-AI UI Rule

The interface must not look or read like generic AI-generated software.

Avoid these AI-looking patterns:

- every page using the same large header + floating statistic cards + rounded card grid
- excessive glassmorphism, glow, blur, and decorative gradients
- repeated "command center" styling on screens that are simple forms or lists
- oversized icons and huge empty spacing in operational tools
- generic dashboard cards that do not match the user's task
- symmetrical layouts that look nice but slow down real work
- fake futuristic labels that make normal functions harder to understand
- repeated purple/blue gradient accents unrelated to CI
- using cards as the default answer to every layout problem
- using English technical drama words for ordinary Thai business workflows

Each screen should be shaped by its actual workflow:

- planning screens prioritize job creation, assignment, filters, and conflict visibility
- monitoring screens prioritize map, current status, alerts, and fast search
- billing screens prioritize amounts, document state, due dates, and export/send actions
- settings screens prioritize grouped configuration and predictable navigation
- mobile driver screens prioritize one-handed task completion
- customer screens prioritize shipment visibility and trust

If two screens solve different jobs, they should not have the same layout just because they share the same design system.

## Language And Tone

Copy must sound like a real logistics system written for Thai operators, not like AI-generated marketing or sci-fi UI.

Use plain, task-oriented language:

- "สร้างงาน"
- "จ่ายงาน"
- "ติดตามงาน"
- "กำลังขนส่ง"
- "ส่งงานสำเร็จ"
- "รอหลักฐาน"
- "ออกใบแจ้งหนี้"
- "ชำระแล้ว"
- "ตั้งค่าบริษัท"
- "จัดการลูกค้า"

Avoid inflated or AI-sounding words unless they are already established in the product and useful:

- avoid "matrix", "protocol", "neural", "quantum", "terminal", "signal", "tactical", "divergence", "node", "alpha"
- avoid "initiate", "optimize your workflow", "unlock insights", "seamless experience"
- avoid Thai text that sounds translated from English
- avoid dramatic warning language for normal validation

Good UI copy is short, specific, and boring in the best way.

Examples:

| Avoid | Prefer |
| --- | --- |
| `INITIATE_RECOVERY_PROTOCOL` | `เปิดรายการซ่อม` |
| `TERMINATE SESSION` | `ออกจากระบบ` |
| `OPERATOR MATRIX` | `ข้อมูลผู้ใช้` |
| `CORE PROTOCOLS` | `เมนูระบบ` |
| `API SIGNAL` | `เชื่อมต่อ API` |
| `SECURE_ADMIN_V2` | `ผู้ดูแลระบบ` |
| `Registry Quiescent` | `ยังไม่มีข้อมูล` |

English labels are acceptable for technical IDs, API terms, system constants, and external integration names. User-facing business actions should use natural Thai in Thai mode and natural English in English mode.

## Bilingual UI Rules

The app supports Thai and English. Every UI change must consider both languages.

Rules:

- Thai labels are often longer than English; do not force narrow fixed-width buttons or tabs.
- English labels can be wider due to long technical words; allow wrapping or truncation only where appropriate.
- Do not hardcode user-facing strings in components if an i18n key exists nearby.
- Do not mix Thai and English in the same label unless it is a business term already used by the company.
- Avoid uppercase styling for Thai text. It does nothing semantically and can make mixed-language layouts feel inconsistent.
- Avoid extreme letter spacing on Thai labels.
- Check that long labels do not overflow in buttons, table headers, tabs, badges, dialogs, and mobile bottom navigation.
- Status names should map consistently between Thai and English.

When adding a new label, write it like a real operator would say it.

## Layout Variety Without Inconsistency

Consistency does not mean every page has the same composition.

Use the same tokens, spacing scale, icons, and interaction patterns, but vary layout by workflow:

- dashboards can use metric cards and charts
- planning should use filters, lists, date controls, and job tables
- tracking should prioritize map and live entities
- settings should use grouped navigation, not a decorative dashboard
- mobile POD should use step-by-step task sections
- billing should use document tables, totals, and action bars

Do not add a hero panel to every screen.

Do not add a decorative card grid when a table, compact list, or form section is more useful.

Do not use "one component style everywhere" if it makes operational tasks slower.

## Corporate CI Colors

The current corporate identity is defined in `src/app/globals.css` under:

`LOGIS-PRO PREMIUM - CI REDESIGN`

Core CI palette:

| Role | Hex | Usage |
| --- | --- | --- |
| White | `#FFFFFF` | Light background, primary text on dark/colored surfaces |
| Dark Navy | `#001e4c` | Corporate foreground, dark background base |
| Corporate Blue | `#00279C` | Primary actions, active states, focus, key highlights |
| Crimson Red | `#B60900` | Accent, critical alerts, destructive status |

Do not replace these colors with a new palette unless explicitly requested by the owner.

## Theme Tokens

Use theme tokens instead of hardcoded colors whenever possible.

Preferred Tailwind tokens:

- `bg-background`
- `text-foreground`
- `bg-card`
- `text-card-foreground`
- `bg-muted`
- `text-muted-foreground`
- `bg-primary`
- `text-primary`
- `text-primary-foreground`
- `bg-accent`
- `text-accent`
- `text-accent-foreground`
- `border-border`
- `ring-primary`

Avoid adding new arbitrary colors such as `text-white`, `bg-black/40`, `text-gray-*`, or `bg-slate-*` unless the element is intentionally fixed-context, such as a photo overlay, map overlay, print document, or status badge with guaranteed contrast.

## Light And Dark Mode Rules

The app supports both light and dark modes. Every UI change must work in both.

Rules:

- Do not put `text-white` on neutral cards unless the card background is guaranteed dark.
- Do not use `bg-black/20`, `bg-black/30`, or `bg-black/40` for normal panels, tables, forms, or headers. Use `bg-muted/20`, `bg-muted/30`, `bg-muted/40`, `bg-card`, or `bg-background`.
- Use `text-foreground` for primary text.
- Use `text-muted-foreground` for secondary text.
- Use `text-primary-foreground` on `bg-primary`.
- Use `text-accent-foreground` on `bg-accent`.
- Do not rely on color alone to communicate urgent states. Pair color with text, icon, badge, or label.

Acceptable fixed dark overlays:

- image hover overlays
- proof-of-delivery photo previews
- map loading overlays
- camera/signature overlays
- print/PDF-only layouts that intentionally use fixed colors

## Layout Principles

This is an operational tool. Screens should prioritize speed, scanning, and repeated use.

Desktop admin:

- Use dense layouts with clear hierarchy.
- Keep filters, actions, status, and table content close together.
- Prefer tables, lists, tabs, sidebars, segmented filters, and compact cards.
- Avoid huge empty hero areas.
- Avoid nested cards inside cards.
- Avoid decorative backgrounds that reduce readability.

Mobile driver/ePOD:

- Thumb-friendly controls.
- Large primary action buttons.
- Clear step order: job details, pickup, proof, signature, completion.
- Show validation immediately before submission.
- Keep photo, signature, GPS, and status flows obvious.
- Optimize for glare, motion, and weak network conditions.

Customer tracking:

- Show shipment status, route progress, proof, and contact points clearly.
- Reduce admin-only controls.
- Use plain labels and visible status.

## Component Rules

Buttons:

- Primary command: `bg-primary text-primary-foreground`.
- Critical/destructive: use accent/destructive tokens.
- Use icons from `lucide-react` when an icon exists.
- Icon-only buttons need accessible labels or tooltips when practical.
- Avoid oversized pill buttons in dense panels.

Cards:

- Use cards for repeated items, dialogs, grouped stats, and framed tools.
- Do not put cards inside cards unless there is a strong workflow reason.
- Operational cards should be compact and information-rich.

Tables:

- Header rows should use theme-safe backgrounds such as `bg-muted/20` or `bg-muted/40`.
- Text must remain readable in light and dark themes.
- Use status badges for operational state.
- Keep numeric columns aligned and easy to compare.

Dialogs:

- Keep forms structured in sections.
- Use sticky or clearly visible save/cancel actions for long forms.
- Avoid changing existing submission logic while improving layout.

Maps:

- Maps are functional surfaces, not decorative cards.
- Controls must stay readable over map tiles.
- Use overlays only when needed for loading, focus, or alerts.

Charts:

- Use semantic colors consistently.
- Include clear labels and units.
- Do not use many similar shades from one color family.

## Operational Status Colors

Use semantic status colors consistently:

- Success/completed: emerald/green
- In progress/active: primary blue
- Warning/pending: amber
- Critical/SOS/failure/destructive: accent/red
- Neutral/inactive/offline: muted/gray token

Never invent a new color for the same status in a new screen.

## Typography

Fonts are configured in `src/app/layout.tsx`:

- `Prompt` for Thai and Latin UI text
- `Outfit` for display/Latin support

Rules:

- Use compact headings in panels.
- Reserve large headings for true page-level titles.
- Avoid negative letter spacing.
- Avoid viewport-based font sizing.
- Make sure long Thai labels and long IDs do not overflow buttons, tabs, cards, or table cells.

## Assets

Known brand assets:

- `public/logo-ci.png`
- `public/logo-tactical.png`
- `public/logo.png`
- `public/logo2.png`

Use real logo assets for brand surfaces. Do not recreate the logo as SVG or text unless explicitly requested.

## Implementation Guardrails

Before changing UI:

1. Check existing components in the same area.
2. Reuse local patterns and tokens.
3. Preserve business logic and data flow unless the task explicitly asks for logic changes.
4. Verify TypeScript and build when possible.
5. For broad visual changes, test at least one light and one dark mode path.
6. Read user-facing text out loud. If it sounds like AI, rewrite it.
7. Compare the page to nearby pages. It should feel related, not cloned.

High-risk anti-patterns:

- hardcoded `text-white` on theme-dependent surfaces
- hardcoded `bg-black/*` on normal UI panels
- new gradients that ignore CI colors
- marketing-style page sections in admin tools
- hiding important status behind hover-only UI
- replacing existing domain labels with vague generic labels
- generic AI dashboard layout applied to every page
- dramatic copy for ordinary actions
- Thai text that sounds machine-translated
- layout that only works in one language or one theme

## Quick Prompt For AI

When asking an AI to work on UI, include:

`Use DESIGN.md. Keep LOGIS-PRO CI colors, support light/dark mode, use theme tokens, keep the UI operational and dense, avoid generic AI-looking layouts and AI-sounding copy, and do not change business logic unless required.`
