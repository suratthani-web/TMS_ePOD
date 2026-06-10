"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { MobileHeader } from "@/components/mobile/mobile-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, User, Bot, Loader2, MessageSquare, Image as ImageIcon, Camera } from "lucide-react"
import { createClient } from "@/utils/supabase/client" // Client side supabase for realtime
import { getChatHistory, sendChatMessage, ChatMessage, markChatReadByDriver } from "@/lib/actions/chat-actions"
import { getDriverSession } from "@/lib/actions/auth-actions"
import { uploadImageToDrive } from "@/lib/actions/upload-actions"
import Image from "next/image"

export default function MobileChatPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [driverId, setDriverId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const supabase = useMemo(() => createClient(), [])

  // 1. Init Session & Load History
  useEffect(() => {
    const init = async () => {
        const session = await getDriverSession()
        if (!session) {
            router.push('/mobile/login')
            return
        }
        setDriverId(session.driverId)
        
        const history = await getChatHistory(session.driverId)
        setMessages(history)
        
        // Mark as read when entering the chat
        await markChatReadByDriver(session.driverId)
        
        setLoading(false)
    }
    init()
  }, [router])

  // 3. Polling Fallback — refresh every 8s in case Realtime is not working 
  // (Supabase Realtime may not fire inside Android WebView)
  useEffect(() => {
    if (!driverId) return
    const poll = setInterval(async () => {
      const latest = await getChatHistory(driverId)
      setMessages(prev => {
        if (latest.length !== prev.length) return latest
        return prev
      })
    }, 8000)
    return () => clearInterval(poll)
  }, [driverId])

  // 2. Realtime Subscription
  useEffect(() => {
    if (!driverId) return

    const setupSync = async () => {
        // Detect correct table name & columns
        let tableName = 'Chat_Messages'
        let receiverCol = 'receiver_id'
        let idCol = 'id'
        
        const { data: probeData, error: checkError } = await supabase.from('Chat_Messages').select('*').limit(1)
        if (checkError && (checkError.code === '42P01' || checkError.message?.includes('not found'))) {
            tableName = 'chat_messages'
            const { data: lowerProbe } = await supabase.from('chat_messages').select('*').limit(1)
            if (lowerProbe && lowerProbe.length > 0 && 'Receiver_ID' in lowerProbe[0]) {
                receiverCol = 'Receiver_ID'
                idCol = 'Id' // Or ID? Usually Id or ID. Let's stick to what we find.
            }
        } else if (probeData && probeData.length > 0) {
            if ('Receiver_ID' in probeData[0]) receiverCol = 'Receiver_ID'
            if ('Id' in probeData[0]) idCol = 'Id'
            else if ('ID' in probeData[0]) idCol = 'ID'
        }

        const channel = supabase
            .channel('chat_room')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: tableName,
                    filter: `${receiverCol}=eq.${driverId}`
                },
                (payload) => {
                    const rawMsg = payload.new as Record<string, unknown>
                    const newMsg: ChatMessage = {
                        id: Number(rawMsg[idCol] ?? rawMsg['id'] ?? rawMsg['Id'] ?? rawMsg['ID'] ?? 0),
                        sender_id: String(rawMsg['sender_id'] ?? rawMsg['Sender_ID'] ?? ''),
                        receiver_id: String(rawMsg['receiver_id'] ?? rawMsg['Receiver_ID'] ?? ''),
                        message: String(rawMsg['message'] ?? rawMsg['Message'] ?? ''),
                        created_at: String(rawMsg['created_at'] ?? rawMsg['Created_At'] ?? ''),
                        is_read: Boolean(rawMsg['is_read'] ?? rawMsg['Is_Read'] ?? false)
                    }
                    setMessages(prev => {
                        if (prev.find(m => m.id === newMsg.id)) return prev
                        // Play sound if from admin
                        if (newMsg.sender_id === 'admin') {
                            try { new Audio('/sounds/notification.mp3').play().catch(() => {}) } catch {}
                        }
                        return [...prev, newMsg]
                    })
                }
            )
            .subscribe()
        
        return channel
    }

    const channelPromise = setupSync()

    return () => {
        channelPromise.then(channel => {
            if (channel) supabase.removeChannel(channel)
        })
    }
  }, [driverId])

  // 3. Auto Scroll
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const handleSend = async () => {
    if (!inputText.trim() || !driverId || sending) return

    const text = inputText
    setInputText("") // Optimistic clear
    setSending(true)

    // Optimistic UI Update
    const optimisticMsg: ChatMessage = {
        id: Date.now(),
        sender_id: driverId,
        receiver_id: 'admin',
        message: text,
        created_at: new Date().toISOString(),
        is_read: false
    }
    setMessages(prev => [...prev, optimisticMsg])
    
    // Server Action
    const result = await sendChatMessage(driverId, text)

    if (!result.success) {
        // Remove optimistic message on error
        setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id))
        setInputText(text) // Restore input
    }
    
    
    setSending(false)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !driverId) return
    
    setUploadingImage(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', 'Chat_Images')
    
    try {
        const uploadResult = await uploadImageToDrive(formData)
        if (uploadResult.success && uploadResult.directLink) {
            const imageUrlMessage = `[IMAGE] ${uploadResult.directLink}`
            await sendChatMessage(driverId, imageUrlMessage, 'admin')
        } else {
            toast.error('อัปโหลดรูปภาพไม่สำเร็จ')
        }
    } catch {
        toast.error('เกิดข้อผิดพลาดในการอัปโหลด')
    } finally {
        setUploadingImage(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
        if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }


  return (
    <div className="fixed inset-0 z-[160] flex flex-col bg-background overflow-hidden">
      <MobileHeader title="แชทกับเจ้าหน้าที่" showBack />

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pt-24" ref={scrollRef}>
        {loading ? (
            <div className="flex justify-center pt-20">
                <Loader2 className="animate-spin text-gray-400" />
            </div>
        ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 opacity-50 mt-20">
                <MessageSquare size={48} className="mb-2" />
                <p>ยังไม่มีข้อความ</p>
                <p className="text-lg font-bold">พิมพ์ข้อความเพื่อเริ่มการสนทนา</p>
            </div>
        ) : (
            <div className="space-y-6 pb-6">
                {messages.map((msg) => {
                    const isMe = msg.sender_id === driverId
                    return (
                        <div 
                            key={msg.id} 
                            className={`flex gap-3 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isMe ? "bg-indigo-600" : "bg-slate-700"}`}>
                                {isMe ? <User size={16} className="text-foreground" /> : <Bot size={16} className="text-emerald-500" />}
                            </div>
                            
                            <div className={`max-w-[75%] p-3 rounded-2xl text-xl ${
                                isMe 
                                    ? "bg-indigo-600 text-white rounded-tr-none" 
                                    : "bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200"
                            }`}>
                                {msg.message.startsWith('[IMAGE] ') ? (
                                    <div className="relative w-48 h-48 sm:w-64 sm:h-64 rounded-xl overflow-hidden mb-1 border border-black/10">
                                        <Image src={msg.message.replace('[IMAGE] ', '')} alt="Chat image" fill className="object-cover" />
                                    </div>
                                ) : (
                                    <p className="break-words">{msg.message}</p>
                                )}
                                <p className={`text-base font-bold mt-1 text-right ${isMe ? "text-indigo-200" : "text-gray-400"}`}>
                                    {new Date(msg.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    )
                })}
            </div>
        )}
      </div>

      <div className="p-3 bg-white/90 backdrop-blur-md border-t border-gray-200 pb-safe">
        <div className="flex gap-2">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleImageUpload} 
            />
            <input 
                type="file" 
                ref={cameraInputRef} 
                className="hidden" 
                accept="image/*" 
                capture="environment"
                onChange={handleImageUpload} 
            />
            <div className="flex gap-1">
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="shrink-0 h-11 w-11 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 rounded-full"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={sending || uploadingImage}
                    title="ถ่ายรูป"
                >
                    <Camera size={22} />
                </Button>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="shrink-0 h-11 w-11 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 rounded-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || uploadingImage}
                    title="แนบรูปภาพ"
                >
                    {uploadingImage ? <Loader2 className="animate-spin" size={20} /> : <ImageIcon size={22} />}
                </Button>
            </div>
            <Input 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                    }
                }}
                placeholder="พิมพ์ข้อความ..."
                className="bg-white/80 border-gray-200 text-foreground focus-visible:ring-indigo-500 h-11 flex-1"
                disabled={sending}
            />
            <Button 
                onClick={handleSend}
                size="icon" 
                className="bg-indigo-600 hover:bg-indigo-700 shrink-0 h-11 w-11"
                disabled={sending || !inputText.trim()}
            >
                {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            </Button>
        </div>
      </div>
    </div>
  )
}

