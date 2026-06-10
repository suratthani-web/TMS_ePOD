# AI_CONTEXT.md

Compact project context for AI coding agents working on TMS_ePOD.

Read this before making code changes. Keep edits scoped, preserve production behavior, and avoid broad rewrites unless explicitly requested.

## Project Summary

TMS_ePOD is a production transport management and electronic proof-of-delivery system.

Primary users:

- Admin / Super Admin
- Dispatch / planning staff
- Drivers
- Customers
- Accounting / finance staff
- Fleet and maintenance teams

Primary workflows:

- login and role-based routing
- dashboard and command center monitoring
- job planning and assignment
- driver mobile job execution
- pickup and delivery proof
- signature and photo capture
- GPS tracking and monitoring
- billing, invoices, payouts
- fleet, fuel, maintenance, safety
- customer tracking and public invoice/tracking pages
- notifications, push, chat, LINE integration

## Tech Stack

Core:

- Next.js App Router, currently Next `16.1.6`
- React `19.2.3`
- TypeScript
- Tailwind CSS v4 via `src/app/globals.css`
- Supabase
- Vercel deployment
- PWA via `@ducanh2912/next-pwa`
- Capacitor Android support

Important libraries:

- `jose` for custom JWT session cookie handling
- `@supabase/ssr` and `@supabase/supabase-js`
- `firebase-admin`
- `lucide-react`
- `framer-motion`
- `leaflet` / `react-leaflet`
- `recharts`
- `exceljs`, `xlsx`, `jspdf`, `html2canvas`
- `@line/bot-sdk`
- `@google/generative-ai`
- `web-push`

## Important Commands

Use these from repo root:

```bash
npm run dev
npx tsc --noEmit --pretty false
npm run lint
npm run build
```

Build command already includes memory headroom:

```bash
cross-env NODE_OPTIONS=--max-old-space-size=4096 next build --webpack
```

Local dev server normally runs at:

```text
http://localhost:3000
```

## Key Files And Directories

App routes:

- `src/app/`
- `src/app/mobile/` driver mobile app
- `src/app/admin/` admin surfaces
- `src/app/settings/` system settings and master data
- `src/app/billing/` billing and invoice workflows
- `src/app/planning/` planning and job creation
- `src/app/monitoring/` live monitoring
- `src/app/dashboard/` dashboards
- `src/app/api/` API routes

Components:

- `src/components/ui/` shared UI primitives
- `src/components/layout/` desktop layout/sidebar
- `src/components/mobile/` mobile driver UI
- `src/components/planning/` planning UI
- `src/components/monitoring/` monitoring UI
- `src/components/analytics/` dashboard analytics UI
- `src/components/billing/` billing UI
- `src/components/maps/` maps

Data/actions:

- `src/lib/supabase/` database access and analytics helpers
- `src/lib/actions/` server actions
- `src/utils/supabase/` Supabase server/client utilities
- `src/lib/permissions.ts` permission helpers
- `src/lib/session.ts` custom session helper

Theme/design:

- `src/app/globals.css`
- `DESIGN.md`

Routing/session:

- `src/proxy.ts`

## Session And Routing Notes

The app uses a custom `session` cookie for staff/admin routing and `driver_session` for driver mobile routes.

Important recent production fix:

- React Error #310 was caused by a root redirect chain during hydration.
- The fix moved root and login redirects into `src/proxy.ts`.
- Do not casually move `/` redirect logic back into a client component.
- Keep root/login redirects server/proxy-side where possible.

Expected routing behavior:

- `/` with valid staff session redirects to `/dashboard`
- `/` without staff session redirects to `/login`
- `/` with mobile user agent and driver session redirects to `/mobile/jobs`
- `/` with mobile user agent and no driver session redirects to `/mobile/login`
- `/login` with valid staff session redirects to `/dashboard`
- invalid staff session cookies should be cleared

## Supabase And Permissions

The system has multiple layers of access control:

- role IDs
- local JWT session payload
- Supabase data access
- menu permissions
- customer/driver-specific restrictions

Be careful with:

- `isSuperAdmin`
- `isAdmin`
- `hasPermission`
- `getUserBranchId`
- `getFixedUserBranchId`
- customer-specific visibility
- branch filtering

Never widen access or remove branch/customer filters unless explicitly requested.

## Domain Model Hints

Common domain entities:

- Jobs_Main
- Master_Users
- Master_Drivers
- Master_Vehicles
- Master_Customers
- Billing_Notes
- Driver_Payments
- Fuel_Logs
- Repair_Tickets
- Notifications
- POD / proof records
- routes and danger zones
- container jobs and ePOD reports

Common job statuses include:

- New
- Pending
- Requested
- Draft
- Assigned
- Confirmed
- Picked Up
- In Transit
- Arrived
- Completed
- Delivered
- Failed
- Cancelled
- SOS

Preserve existing status strings unless a migration plan is provided.

## UI/UX Guidance

Use `DESIGN.md` for UI rules.

Short version:

- operational dashboard, not marketing site
- UI must not look like generic AI-generated software
- copy must not sound like AI-generated marketing or machine translation
- light/dark theme support is mandatory
- use CI colors from `src/app/globals.css`
- prefer theme tokens over hardcoded colors
- avoid normal UI surfaces with `bg-black/*` and `text-white`
- keep dispatch screens dense and fast to scan
- make mobile driver flows large, clear, and resilient
- use natural Thai/English labels, not inflated sci-fi words
- avoid applying the same card-grid layout to every page

## Current Known CI Issues

GitHub Actions may fail for reasons unrelated to app correctness:

- old `actions/upload-artifact@v3`
- missing `requirements.txt` in a Python test workflow
- CI lint currently checks legacy/debug/generated files and treats many warnings as errors

Local checks used during recent work:

- `npx tsc --noEmit --pretty false`
- `npm run lint`
- `npm run build`

Vercel build is the primary production deployment signal at the moment.

## Editing Rules For AI Agents

Do:

- inspect files before editing
- keep changes scoped to the request
- use existing local patterns
- preserve business logic unless the user asks for logic changes
- run TypeScript after meaningful code changes
- run build before production-impacting changes when practical
- stage/commit only files that belong to the requested scope

Do not:

- run `git add -A` in this repo without explicit confirmation
- push unrelated local changes
- revert user changes unless explicitly requested
- move auth/session logic without understanding current flow
- replace corporate CI palette
- create new broad abstractions without need
- commit generated debug scripts unless requested

## Git And Deployment Notes

Default remote:

- `origin` -> `https://github.com/Armpjsf/tms-app.git`

There is also:

- `cloudflare` -> `https://github.com/Armpjsf/TMS_cloudflare.git`

Default production branch:

- `main`

Use `codex/` prefix for new working branches unless the user asks otherwise.

Recent production PR:

- PR #2 fixed React Error #310 by using `src/proxy.ts`.
- Merged to `main`.

## Quick Prompt For AI

For future work, paste this:

`Read AI_CONTEXT.md and DESIGN.md first. Work only on the requested scope. Preserve production behavior, auth, permissions, branch filtering, CI colors, light/dark support, and natural non-AI language. Do not create generic AI-looking card layouts. Do not push unrelated local changes.`
