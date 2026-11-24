export type CapturedPin = {
  lat: number
  lng: number
  accuracy: number | null
  speed: number | null
  deviceId: string
}

const DEVICE_ID_STORAGE_KEY = 'tms_driver_device_id'

function generateDeviceUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function getOrCreateDriverDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr-device'
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (existing && existing.trim()) return existing.trim()
    const created = generateDeviceUuid()
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, created)
    return created
  } catch {
    return generateDeviceUuid()
  }
}

async function readBrowserGeolocation(timeoutMs: number): Promise<CapturedPin | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  const deviceId = getOrCreateDriverDeviceId()
  return new Promise<CapturedPin | null>((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude)
          const lng = Number(pos.coords.longitude)
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
            resolve(null)
            return
          }
          const acc = pos.coords.accuracy != null && Number.isFinite(pos.coords.accuracy)
            ? Number(pos.coords.accuracy)
            : null
          const spd = pos.coords.speed != null && Number.isFinite(pos.coords.speed)
            ? Number(pos.coords.speed)
            : null
          resolve({ lat, lng, accuracy: acc, speed: spd, deviceId })
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 }
      )
    } catch {
      resolve(null)
    }
  })
}

export async function captureCurrentPinSilent(timeoutMs = 3500): Promise<CapturedPin | null> {
  if (typeof window === 'undefined') return null
  const deviceId = getOrCreateDriverDeviceId()

  const captureTask = (async (): Promise<CapturedPin | null> => {
    try {
      const { Geolocation } = await import('@capacitor/geolocation')
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: timeoutMs,
      })
      const lat = Number(pos.coords.latitude)
      const lng = Number(pos.coords.longitude)
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
        const acc = pos.coords.accuracy != null && Number.isFinite(pos.coords.accuracy)
          ? Number(pos.coords.accuracy)
          : null
        const spd = pos.coords.speed != null && Number.isFinite(pos.coords.speed)
          ? Number(pos.coords.speed)
          : null
        return { lat, lng, accuracy: acc, speed: spd, deviceId }
      }
    } catch {
      // Fall back to standard browser Geolocation API
    }
    return readBrowserGeolocation(timeoutMs)
  })()

  const timeoutTask = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs)
  })

  try {
    return await Promise.race([captureTask, timeoutTask])
  } catch {
    return null
  }
}

export function appendPinToFormData(formData: FormData, pin: CapturedPin | null): void {
  if (!pin) return
  formData.append('pin_lat', String(pin.lat))
  formData.append('pin_lng', String(pin.lng))
  if (pin.accuracy != null && Number.isFinite(pin.accuracy)) {
    formData.append('pin_accuracy', String(pin.accuracy))
  }
  if (pin.speed != null && Number.isFinite(pin.speed)) {
    formData.append('pin_speed', String(pin.speed))
  }
  formData.append('pin_device_id', pin.deviceId)
}
