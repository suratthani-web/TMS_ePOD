import { SignJWT, jwtVerify } from 'jose'

const secretKey = process.env.SESSION_SECRET || 'default_secret_key_change_me_in_production'
const encodedKey = new TextEncoder().encode(secretKey)

export type TripPerformanceTokenPayload = {
  start: string
  end: string
  customerNames?: string[]
  branchId?: string | null
  requestedBy?: string
}

/**
 * สร้าง Token สำหรับดาวน์โหลดไฟล์ Excel รายงาน Trip Performance
 * มีอายุ 24 ชั่วโมง เพื่อให้ผู้บริหารกดดาวน์โหลดผ่าน LINE In-App Browser ได้ทันทีโดยไม่ต้องล็อกอินซ้ำ
 */
export async function createTripPerformanceDownloadToken(payload: TripPerformanceTokenPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(encodedKey)
}

/**
 * ตรวจสอบความถูกต้องและวันหมดอายุของ Token
 */
export async function verifyTripPerformanceDownloadToken(token: string): Promise<TripPerformanceTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ['HS256']
    })
    return payload as unknown as TripPerformanceTokenPayload
  } catch {
    return null
  }
}
