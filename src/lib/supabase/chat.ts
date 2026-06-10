import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin, isAdmin, getCustomerId } from "@/lib/permissions"
import { notifyDriverNewChat } from '@/lib/actions/push-actions'
import { SupabaseClient } from '@supabase/supabase-js'

export type ChatMessage = {
  id: number
  sender_id: string
  receiver_id: string
  message: string
  created_at: string
  is_read: boolean
  // Extended for UI helpers
  driver_name?: string 
}

export type ChatContact = {
  driver_id: string
  driver_name: string
  last_message: string
  unread: number
  updated_at: string
}

type ChatMessageRow = Record<string, string | boolean | number | null | undefined>

const toText = (value: ChatMessageRow[string]) => value == null ? "" : String(value)
const toBool = (value: ChatMessageRow[string]) => value === true || value === "true" || value === 1
const toNumber = (value: ChatMessageRow[string]) => Number(value) || 0

// Cache schema detection to avoid multiple DB roundtrips per action call
let _cachedSchema: { tableName: string; columns: { id: string; sender_id: string; receiver_id: string; message: string; is_read: string; created_at: string } } | null = null

// Helper to detect table and column casing
export async function getChatSchema(supabase: SupabaseClient) {
  // Return cached result if available (avoids multiple DB round-trips)
  if (_cachedSchema) return _cachedSchema

  let tableName = 'Chat_Messages'
  // Check table casing
  const { error: tableError } = await supabase.from('Chat_Messages').select('id').limit(1)
  if (tableError && (tableError.code === '42P01' || tableError.message?.includes('not found'))) {
    tableName = 'chat_messages'
  }

  // Common column names to check
  const columns = {
    id: 'id',
    sender_id: 'sender_id',
    receiver_id: 'receiver_id',
    message: 'message',
    is_read: 'is_read',
    created_at: 'created_at'
  }

  // Detect column casing - try to fetch a single row to see keys
  const { data } = await supabase.from(tableName).select('*').limit(1)
  
  if (data && data.length > 0) {
    const row = data[0]
    if ('Created_At' in row) columns.created_at = 'Created_At'
    if ('Sender_ID' in row) columns.sender_id = 'Sender_ID'
    if ('Receiver_ID' in row) columns.receiver_id = 'Receiver_ID'
    if ('Message' in row) columns.message = 'Message'
    if ('Is_Read' in row) columns.is_read = 'Is_Read'
  } else {
    // Fallback: If no data, try a quick probe for Created_At
    const { error: probeError } = await supabase.from(tableName).select('Created_At').limit(1)
    if (!probeError) {
      columns.created_at = 'Created_At'
      columns.sender_id = 'Sender_ID'
      columns.receiver_id = 'Receiver_ID'
      columns.message = 'Message'
      columns.is_read = 'Is_Read'
    }
  }

  _cachedSchema = { tableName, columns }
  return _cachedSchema
}

// Get list of drivers with their last message
export async function getChatContacts(): Promise<ChatContact[]> {
  try {
    // Use admin client directly to bypass RLS issues
    const adminSupabase = createAdminClient()
    
    const branchId = await getUserBranchId()
    const isSuper = await isSuperAdmin()
    const isRegularAdmin = await isAdmin()
    const customerId = await getCustomerId()

    // Detect schema once
    const { tableName, columns } = await getChatSchema(adminSupabase)

    // ⚡ Critical fix: Always limit the fetch - never fetch all messages!
    const { data: messages, error } = await adminSupabase
      .from(tableName)
      .select('*')
      .order(columns.created_at, { ascending: false })
      .limit(1000)

    if (error) {
      console.error('[getChatContacts] Error:', error.message)
      return []
    }

    // Normalizing results to lowercase keys for internal logic
    const normalizedMessages = (messages as ChatMessageRow[] | null)?.map((msg) => ({
        id: toNumber(msg[columns.id]),
        sender_id: toText(msg[columns.sender_id]),
        receiver_id: toText(msg[columns.receiver_id]),
        message: toText(msg[columns.message]),
        is_read: toBool(msg[columns.is_read]),
        created_at: toText(msg[columns.created_at])
    })) || []

    // 1. Get Drivers in my branch to filter messages (Use Admin client for names to ensure visibility)
    let allowedDriverIds: Set<string> | null = null
    const { data: allDrivers } = await adminSupabase.from('Master_Drivers').select('Driver_ID, Driver_Name, Vehicle_Plate, Branch_ID')
    
    // STRICT ISOLATION
    if (!isSuper) {
        if (branchId && branchId !== 'All') {
            allowedDriverIds = new Set(allDrivers?.filter((d: { Branch_ID?: string }) => d.Branch_ID === branchId).map((d: { Driver_ID: string }) => d.Driver_ID) || [])
        } else {
            return []
        }
    } else if (branchId && branchId !== 'All') {
        allowedDriverIds = new Set(allDrivers?.filter((d: { Branch_ID?: string }) => d.Branch_ID === branchId).map((d: { Driver_ID: string }) => d.Driver_ID) || [])
    }

    // Map to lookup driver info easily
    const driverInfoMap = new Map<string, { name: string, plate: string | null }>(allDrivers?.map((d: { Driver_ID: string, Driver_Name: string, Vehicle_Plate: string }) => [d.Driver_ID, { name: d.Driver_Name, plate: d.Vehicle_Plate }]) || [])

    // 2. Group by driver and find last message
    const contactMap = new Map<string, ChatContact>()

    normalizedMessages.forEach((msg) => {
      const driverId = msg.sender_id === 'admin' ? msg.receiver_id : msg.sender_id
      
      if (allowedDriverIds && !allowedDriverIds.has(driverId)) return
      
      if (!contactMap.has(driverId)) {
        const info = driverInfoMap.get(driverId)
        const displayName = info ? `${info.name} (${info.plate || '-'})` : `พนักงานขับรถ (${driverId})`
        
        contactMap.set(driverId, {
          driver_id: driverId,
          driver_name: displayName,
          last_message: msg.message,
          unread: 0,
          updated_at: msg.created_at
        })
      }

      // Count unread messages from driver
      if (msg.sender_id !== 'admin' && !msg.is_read) {
        const contact = contactMap.get(driverId)
        if (contact) {
          contact.unread += 1
        }
      }
    })

    return Array.from(contactMap.values())
  } catch (error) {
    return []
  }
}

// Get messages for a specific driver
export async function getMessages(driverId: string): Promise<ChatMessage[]> {
  try {
    const supabase = await createClient()
    
    const isSuper = await isSuperAdmin()
    const isRegularAdmin = await isAdmin()
    const customerId = await getCustomerId()
    
    // 0. Detect correct schema (Try admin client first if authorized)
    let { tableName, columns } = await getChatSchema((isSuper || isRegularAdmin || customerId) ? createAdminClient() : supabase)

    const effectiveSupabase = (isSuper || isRegularAdmin || customerId) ? createAdminClient() : supabase
    const result = await effectiveSupabase
      .from(tableName)
      .select('*')
      .or(`${columns.sender_id}.eq.${driverId},${columns.receiver_id}.eq.${driverId}`)
      .order(columns.created_at, { ascending: true })

    let data = result.data

    if (result.error) {
        const adminSupabase = createAdminClient()
        
        const adminSchema = await getChatSchema(adminSupabase)
        tableName = adminSchema.tableName
        columns = adminSchema.columns

        const { data: adminData, error: adminError } = await adminSupabase
            .from(tableName)
            .select('*')
            .or(`${columns.sender_id}.eq.${driverId},${columns.receiver_id}.eq.${driverId}`)
            .order(columns.created_at, { ascending: true })
        
        if (adminError) {
            throw adminError
        }
        data = adminData
    }

    // Normalize
    return (data as ChatMessageRow[] | null)?.map((msg) => ({
        id: toNumber(msg[columns.id]),
        sender_id: toText(msg[columns.sender_id]),
        receiver_id: toText(msg[columns.receiver_id]),
        message: toText(msg[columns.message]),
        is_read: toBool(msg[columns.is_read]),
        created_at: toText(msg[columns.created_at])
    })) || []
  } catch (error) {
    return []
  }
}


// Send a message (as admin)
export async function sendMessage(driverId: string, driverName: string, message: string) {
  try {
    const supabase = await createClient()
    
    // 0. Detect correct schema
    const { tableName, columns } = await getChatSchema(supabase)

    const payload: Record<string, unknown> = {
      [columns.sender_id]: 'admin',
      [columns.receiver_id]: driverId,
      [columns.message]: message,
      [columns.is_read]: false,
      [columns.created_at]: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from(tableName)
      .insert(payload)
      .select()
      .single()

    if (error) {
        const adminSupabase = createAdminClient()
        const { data: adminData, error: adminError } = await adminSupabase
            .from(tableName)
            .insert(payload)
            .select()
            .single()
        
        if (adminError) {
            throw adminError
        }

        // Push admin fallback path
        try { await notifyDriverNewChat(driverId, message) } catch (e) { console.error(e) }

        return { success: true, data: adminData }
    }

    // Notify Driver via Push
    try { await notifyDriverNewChat(driverId, message) } catch (e) { console.error(e) }

    return { success: true, data }
  } catch (error) {
    return { success: false, error }
  }
}

// Mark messages as read
export async function markAsRead(driverId: string) {
  try {
    const supabase = await createClient()

    // 0. Detect correct schema
    const { tableName, columns } = await getChatSchema(supabase)

    const { error } = await supabase
      .from(tableName)
      .update({ [columns.is_read]: true })
      .eq(columns.receiver_id, 'admin')
      .eq(columns.sender_id, driverId)
      .eq(columns.is_read, false)

    if (error) {
        const adminSupabase = createAdminClient()
        const { error: adminError } = await adminSupabase
            .from(tableName)
            .update({ [columns.is_read]: true })
            .eq(columns.receiver_id, 'admin')
            .eq(columns.sender_id, driverId)
            .eq(columns.is_read, false)
        
        if (adminError) throw adminError
    }
    return { success: true }
  } catch (error) {
    return { success: false, error }
  }
}

// Get unread count for a driver
export async function getUnreadChatCountForDriver(driverId: string): Promise<number> {
  try {
    const supabase = await createClient()

    // 0. Detect correct schema
    const { tableName, columns } = await getChatSchema(supabase)

    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .eq(columns.receiver_id, driverId)
      .eq(columns.is_read, false)
    
    if (error) {
        const adminSupabase = createAdminClient()
        const { count: adminCount, error: adminError } = await adminSupabase
            .from(tableName)
            .select('*', { count: 'exact', head: true })
            .eq(columns.receiver_id, driverId)
            .eq(columns.is_read, false)
        
        if (adminError) return 0
        return adminCount || 0
    }
    return count || 0
  } catch {
    return 0
  }
}
