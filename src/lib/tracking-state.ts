// Shared client-side helpers for job-bound GPS tracking.
//
// Tracking is active only while the driver has a job in progress — from when
// they press "เริ่มงาน" (status -> Accepted) until they confirm delivery
// (status -> Completed). LocationTracker is the single owner of the cache and
// the watcher; other screens just call notifyTrackingStateChanged() after a
// status update so the tracker re-checks the server.

// Statuses where GPS tracking should stay ON (between start and delivery).
export const ACTIVE_TRACKING_STATUSES = [
  'Accepted',
  'Arrived Pickup',
  'Picked Up',
  'In Progress',
  'In Transit',
  'Arrived',
  'Arrived Dropoff',
]

export function isActiveTrackingStatus(status?: string | null): boolean {
  return !!status && ACTIVE_TRACKING_STATUSES.includes(status)
}

// Window event that asks LocationTracker to re-resolve the active job.
export const TRACKING_EVENT = 'logis:tracking-state-changed'

export function notifyTrackingStateChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TRACKING_EVENT))
  }
}

// Local cache of the active job id, scoped to the driver so it never leaks
// across accounts on a shared device. Used for an instant decision on app
// launch (incl. APK resume after the OS killed the app) before the server
// query returns, and works offline.
const ACTIVE_JOB_CACHE_KEY = 'logis_active_tracking_job'

export function readCachedActiveJob(driverId?: string | null): string | null {
  if (typeof window === 'undefined' || !driverId) return null
  try {
    const raw = window.localStorage.getItem(ACTIVE_JOB_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { driverId?: string; jobId?: string }
    return parsed?.driverId === driverId ? (parsed.jobId ?? null) : null
  } catch {
    return null
  }
}

export function writeCachedActiveJob(driverId: string | null, jobId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (driverId && jobId) {
      window.localStorage.setItem(ACTIVE_JOB_CACHE_KEY, JSON.stringify({ driverId, jobId }))
    } else {
      window.localStorage.removeItem(ACTIVE_JOB_CACHE_KEY)
    }
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}
