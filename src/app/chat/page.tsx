export const dynamic = 'force-dynamic'

import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { getChatContacts } from '@/lib/supabase/chat'
import { getActiveFleetStatus } from '@/lib/supabase/gps'
import { ChatWindow } from '@/components/chat/chat-window'
import { getCustomerId } from '@/lib/permissions'

export default async function ChatPage() {
    const customerId = await getCustomerId()
    
    const [chatContacts, activeDrivers] = await Promise.all([
        getChatContacts(),
        getActiveFleetStatus(undefined, customerId)
    ])
    const chatDrivers = activeDrivers.filter((driver): driver is typeof driver & { Driver_ID: string } => Boolean(driver.Driver_ID))

    return (
        <DashboardLayout>
            <div className="flex flex-col gap-8 h-[calc(100vh-140px)]">
                <div className="flex-1 min-h-0">
                    <ChatWindow 
                        initialContacts={chatContacts} 
                        initialDrivers={chatDrivers} 
                    />
                </div>
            </div>
        </DashboardLayout>
    )
}
