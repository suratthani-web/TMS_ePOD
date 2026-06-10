"use server"

import { 
  generateRegistrationOptions, 
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  RegistrationResponseJSON,
  AuthenticationResponseJSON
} from '@simplewebauthn/server'
import { createAdminClient } from "@/utils/supabase/server"
import { cookies, headers } from "next/headers"
import { getDriverSession } from "./auth-actions"

// In a real production app, RP_ID should be your domain
const RP_ID = process.env.NEXT_PUBLIC_RP_ID || 'localhost'
const RP_NAME = 'LogisPro Tactical'
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || `http://${RP_ID}:3000`

/**
 * REGISTRATION PHASE 1: Generate options for the browser
 */
export async function getPasskeyRegistrationOptions() {
  const session = await getDriverSession()
  if (!session) throw new Error('Unauthorized')

  const supabase = createAdminClient()
  
  // Get existing credentials for this user to avoid duplicates
  const { data: credentials } = await supabase
    .from('Driver_Passkeys')
    .select('credential_id')
    .eq('driver_id', session.driverId)

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: session.driverId,
    userName: session.driverName,
    attestationType: 'none',
    excludeCredentials: credentials?.map((c: { credential_id: string }) => ({
      id: c.credential_id,
      type: 'public-key',
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform', // Force use of device biometrics
    },
  })

  // Store challenge in a cookie or session to verify in Phase 2
  const cookieStore = await cookies()
  let isSecure = true
  try {
    const headersList = await headers()
    const proto = headersList.get('x-forwarded-proto')
    if (proto) {
      isSecure = proto.toLowerCase() === 'https'
    }
  } catch (err) {}
  cookieStore.set('registration_challenge', options.challenge, { httpOnly: true, secure: isSecure })

  return options
}

/**
 * REGISTRATION PHASE 2: Verify the response and save to DB
 */
export async function verifyPasskeyRegistration(body: RegistrationResponseJSON) {
  const session = await getDriverSession()
  if (!session) throw new Error('Unauthorized')

  const cookieStore = await cookies()
  const expectedChallenge = cookieStore.get('registration_challenge')?.value

  if (!expectedChallenge) throw new Error('Registration challenge missing')

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  })

  if (verification.verified && verification.registrationInfo) {
    const { credentialPublicKey, credentialID, counter } = verification.registrationInfo as unknown as { credentialPublicKey: Uint8Array; credentialID: Uint8Array; counter: number }
    
    const supabase = createAdminClient()
    await supabase.from('Driver_Passkeys').insert({
      driver_id: session.driverId,
      credential_id: Buffer.from(credentialID).toString('base64'),
      public_key: Buffer.from(credentialPublicKey).toString('base64'),
      counter,
      device_name: body.id, // Or a custom name
    })

    return { success: true }
  }

  return { success: false, error: 'Verification failed' }
}

/**
 * AUTHENTICATION PHASE 1: Generate options for the browser
 */
export async function getPasskeyAuthenticationOptions(identifier: string) {
  const supabase = createAdminClient()
  
  // Find driver first
  const { data: driver } = await supabase
    .from('Master_Drivers')
    .select('Driver_ID')
    .or(`Mobile_No.eq.${identifier},Driver_ID.eq.${identifier}`)
    .single()

  if (!driver) throw new Error('Driver not found')

  const { data: credentials } = await supabase
    .from('Driver_Passkeys')
    .select('credential_id')
    .eq('driver_id', driver.Driver_ID)

  if (!credentials || credentials.length === 0) {
    throw new Error('No biometrics registered for this account')
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: credentials.map((c: { credential_id: string }) => ({
      id: c.credential_id,
      type: 'public-key',
    })),
    userVerification: 'preferred',
  })

  const cookieStore = await cookies()
  let isSecure = true
  try {
    const headersList = await headers()
    const proto = headersList.get('x-forwarded-proto')
    if (proto) {
      isSecure = proto.toLowerCase() === 'https'
    }
  } catch (err) {}
  cookieStore.set('auth_challenge', options.challenge, { httpOnly: true, secure: isSecure })
  cookieStore.set('auth_driver_id', driver.Driver_ID, { httpOnly: true, secure: isSecure })

  return options
}

/**
 * AUTHENTICATION PHASE 2: Verify and Log In
 */
export async function verifyPasskeyLogin(body: AuthenticationResponseJSON) {
  const cookieStore = await cookies()
  const expectedChallenge = cookieStore.get('auth_challenge')?.value
  const driverId = cookieStore.get('auth_driver_id')?.value

  if (!expectedChallenge || !driverId) throw new Error('Auth session invalid')

  const supabase = createAdminClient()
  
  // Get the credential from DB
  const { data: passkey } = await supabase
    .from('Driver_Passkeys')
    .select('*')
    .eq('credential_id', body.id)
    .single()

  if (!passkey) throw new Error('Credential not found')

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    authenticator: {
      credentialID: Buffer.from(passkey.credential_id, 'base64'),
      credentialPublicKey: Buffer.from(passkey.public_key, 'base64'),
      counter: passkey.counter,
    },
  } as unknown as Parameters<typeof verifyAuthenticationResponse>[0])

  if (verification.verified) {
    // Update counter
    await supabase.from('Driver_Passkeys')
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq('id', passkey.id)

    // Log the user in! (Import login logic or reusable session creator)
    // For simplicity, I'll set the session cookie here similar to loginDriver
    const { data: driver } = await supabase.from('Master_Drivers').select('*').eq('Driver_ID', driverId).single()
    
    const sessionData = {
      driverId: driver.Driver_ID,
      driverName: driver.Driver_Name,
      branchId: driver.Branch_ID,
      role: 'driver',
    }
    
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    let isSecure = process.env.NODE_ENV === "production"
    try {
      const headersList = await headers()
      const proto = headersList.get('x-forwarded-proto')
      if (proto) {
        isSecure = proto.toLowerCase() === 'https'
      }
    } catch (err) {}
    cookieStore.set("driver_session", JSON.stringify(sessionData), { 
      httpOnly: true, 
      secure: isSecure,
      expires,
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
      path: "/",
    })

    return { success: true }
  }

  return { success: false, error: 'Biometric verification failed' }
}
