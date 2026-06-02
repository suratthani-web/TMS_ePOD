import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies, headers } from 'next/headers'

// Use exactly the same logic as middleware
const secretKey = process.env.SESSION_SECRET || 'default_secret_key_change_me_in_production'
const encodedKey = new TextEncoder().encode(secretKey)

export type SessionPayload = {
  userId: string
  roleId: number
  branchId: string | null
  customerId: string | null
  username: string
  expiresAt: string 
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
}

export async function decrypt(session: string | undefined = '') {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ['HS256'],
    })
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function createSession(
  userId: string, 
  roleId: number, 
  branchId: string | null, 
  username: string,
  customerId: string | null = null
) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  
  // Create a lean payload to avoid 4KB cookie limit
  const session = await encrypt({ 
    userId, 
    roleId, 
    branchId, 
    username, 
    customerId, 
    expiresAt
  })
  
  const cookieStore = await cookies()

  // Dynamically determine secure status from protocol header
  let isSecure = process.env.NODE_ENV === 'production'
  try {
    const headersList = await headers()
    const proto = headersList.get('x-forwarded-proto')
    if (proto) {
      isSecure = proto.toLowerCase() === 'https'
    }
  } catch (err) {
    // Graceful fallback if headers() is called outside request context
  }

  cookieStore.set('session', session, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
  })
}

export async function getSession() {
  const cookieStore = await cookies()
  const session = cookieStore.get('session')?.value
  const payload = await decrypt(session)

  if (!payload) {
    return null
  }

  return payload
}

export async function deleteSession() {
    const cookieStore = await cookies()
  cookieStore.delete('session')
}
