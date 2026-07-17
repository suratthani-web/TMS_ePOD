import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAdminClient()

  try {
    const { data: users, error: uError } = await supabase
      .from('Master_Users')
      .select('Username, Name, Role, Role_ID, Line_User_ID')

    if (uError) {
      return NextResponse.json({ success: false, error: uError.message })
    }

    return NextResponse.json({
      success: true,
      users
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message })
  }
}
