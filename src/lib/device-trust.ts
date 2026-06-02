import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies, headers } from 'next/headers'

const secretKey = process.env.SESSION_SECRET || 'default_secret_key_change_me_in_production'
const encodedKey = new TextEncoder().encode(secretKey)

export async function signDeviceToken(username: string) {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d') // Trust for 30 days
    .sign(encodedKey)
}

export async function verifyDeviceToken(token: string | undefined) {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ['HS256'],
    })
    return payload as { username: string }
  } catch {
    return null
  }
}

export async function setTrustedDeviceCookie(username: string) {
  const token = await signDeviceToken(username)
  const cookieStore = await cookies()
  
  let isSecure = process.env.NODE_ENV === 'production'
  try {
    const headersList = await headers()
    const proto = headersList.get('x-forwarded-proto')
    if (proto) {
      isSecure = proto.toLowerCase() === 'https'
    }
  } catch (err) {}

  cookieStore.set('tms_trusted_device', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  })
}
