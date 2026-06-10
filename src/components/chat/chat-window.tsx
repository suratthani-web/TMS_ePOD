"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Search, MessageSquare, Check, CheckCheck, Loader2, Image as ImageIcon, User, ShieldCheck, Activity, Target, CheckCircle2 } from "lucide-react"
import { ChatMessage } from '@/lib/actions/chat-actions'
import { uploadImageToDrive } from '@/lib/actions/upload-actions'
import Image from 'next/image'
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"

interface Contact {
  driver_id: string
  driver_name: string
  last_message: string
  unread: number
  updated_at: string
  last_update?: string | null // GPS heartbeat
}

interface ChatWindowProps {
  initialContacts: Contact[]
  initialDrivers: { Driver_ID: string; Driver_Name?: string; Vehicle_Plate?: string }[]
  forcedDriverId?: string | null
}

function formatTime(dateStr: string) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (d.toDateString() === today.toDateString()) return 'วันนี้'
    if (d.toDateString() === yesterday.toDateString()) return 'เมื่อวาน'
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return '' }
}

function groupMessagesByDate(messages: ChatMessage[]) {
  const groups: { date: string; messages: ChatMessage[] }[] = []
  let currentDate = ''
  for (const msg of messages) {
    const date = new Date(msg.created_at).toDateString()
    if (date !== currentDate) {
      currentDate = date
      groups.push({ date: msg.created_at, messages: [msg] })
    } else {
      groups[groups.length - 1].messages.push(msg)
    }
  }
  return groups
}

export function ChatWindow({ initialContacts, initialDrivers, forcedDriverId }: ChatWindowProps) {
  const [isHydrated, setIsHydrated] = useState(false)
  const { t } = useLanguage()
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const selectedDriverIdRef = useRef<string | null>(null)
  
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const contactsRef = useRef<Contact[]>(initialContacts)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [onlineDrivers, setOnlineDrivers] = useState<Set<string>>(new Set())
  
  const supabaseClient = useMemo(() => createClient(), [])

  useEffect(() => {
    setIsHydrated(true)
    if (forcedDriverId) setSelectedDriverId(forcedDriverId)
  }, [forcedDriverId])

  useEffect(() => {
    selectedDriverIdRef.current = selectedDriverId
  }, [selectedDriverId])

  useEffect(() => {
    contactsRef.current = contacts
  }, [contacts])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior })
    }
  }, [])

  const filteredContacts = useMemo(() => {
    const contactMap = new Map<string, Contact>()
    
    // Fill with default active drivers
    initialDrivers.forEach(d => {
      contactMap.set(d.Driver_ID, {
        driver_id: d.Driver_ID,
        driver_name: d.Driver_Name ? `${d.Driver_Name} (${d.Vehicle_Plate || '-'})` : `พนักงานขับรถ (${d.Driver_ID})`,
        last_message: 'เริ่มการสนทนา',
        unread: 0,
        updated_at: '2024-01-01T00:00:00.000Z',
        last_update: (d as any).Last_Update
      })
    })

    // Overlay with real contacts
    contacts.forEach(c => {
      contactMap.set(c.driver_id, c)
    })

    const all = Array.from(contactMap.values())
    const q = searchQuery.toLowerCase().trim()
    
    const filtered = q 
        ? all.filter(c => (c.driver_name || '').toLowerCase().includes(q) || (c.driver_id || '').toLowerCase().includes(q))
        : all

    return filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [contacts, initialDrivers, searchQuery])

  const activeDriver = useMemo(() => {
    if (!selectedDriverId) return null
    return filteredContacts.find(c => c.driver_id === selectedDriverId) || null
  }, [selectedDriverId, filteredContacts])

  const fetchMessages = useCallback(async (driverId: string) => {
    try {
        const { getChatHistory } = await import('@/lib/actions/chat-actions')
        const history = await getChatHistory(driverId)
        if (history) {
          setMessages(history)
          setTimeout(() => scrollToBottom('instant'), 100)
        }
    } catch (e) {
        console.error("Fetch failed", e)
    }
  }, [scrollToBottom])

  const markAllAsRead = useCallback(async (driverId: string) => {
    try {
        const { markAsReadAction } = await import('@/lib/actions/chat-actions')
        await markAsReadAction(driverId)
        setContacts(prev => prev.map(c => 
          c.driver_id === driverId ? { ...c, unread: 0 } : c
        ))
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => {
    if (selectedDriverId && isHydrated) {
      fetchMessages(selectedDriverId)
      markAllAsRead(selectedDriverId)
    }
  }, [selectedDriverId, fetchMessages, markAllAsRead, isHydrated])

  const updateContactList = useCallback((newMsg: ChatMessage) => {
    setContacts(prev => {
      const driverId = newMsg.sender_id === 'admin' ? newMsg.receiver_id : newMsg.sender_id
      const existing = prev.find(c => c.driver_id === driverId)
      
      const lastMsgText = newMsg.message.startsWith('[IMAGE] ') 
        ? (newMsg.sender_id === 'admin' ? 'คุณ: 📷 ส่งรูปภาพ' : '📷 ส่งรูปภาพ')
        : (newMsg.sender_id === 'admin' ? `คุณ: ${newMsg.message}` : newMsg.message)

      if (existing) {
        return prev.map(c => c.driver_id === driverId ? {
          ...c,
          last_message: lastMsgText,
          unread: (newMsg.sender_id !== 'admin' && driverId !== selectedDriverIdRef.current) ? (c.unread || 0) + 1 : c.unread,
          updated_at: newMsg.created_at
        } : c)
      } else {
        return [{
          driver_id: driverId,
          driver_name: newMsg.driver_name || `พนักงานขับรถ (${driverId})`,
          last_message: lastMsgText,
          unread: (newMsg.sender_id !== 'admin' && driverId !== selectedDriverIdRef.current) ? 1 : 0,
          updated_at: newMsg.created_at
        }, ...prev]
      }
    })
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    
    const handleRealtimeInsert = (payload: any) => {
      const raw = payload.new
      const newMsg: ChatMessage = {
        id: raw.id ?? raw.Id,
        sender_id: raw.sender_id ?? raw.Sender_ID,
        receiver_id: raw.receiver_id ?? raw.Receiver_ID,
        message: raw.message ?? raw.Message,
        is_read: raw.is_read ?? raw.Is_Read,
        created_at: raw.created_at ?? raw.Created_At
      }

      if (!newMsg.sender_id || !newMsg.message) return

      const currentSelectedId = selectedDriverIdRef.current
      const relevantDriverId = newMsg.sender_id === 'admin' ? newMsg.receiver_id : newMsg.sender_id
      
      if (relevantDriverId === currentSelectedId) {
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
        scrollToBottom()
        if (newMsg.sender_id !== 'admin') {
            import('@/lib/actions/chat-actions').then(({ markAsReadAction }) => markAsReadAction(relevantDriverId)).catch(() => {})
        }
      } else if (newMsg.sender_id !== 'admin') {
         toast.info(`ข้อความใหม่จาก ${relevantDriverId}`)
      }
      updateContactList(newMsg)
    }

    const handleGPSUpdate = (payload: any) => {
        const newLog = payload.new
        const driverId = newLog.driver_id || newLog.Driver_ID
        setContacts(prev => prev.map(c => 
            c.driver_id === driverId ? { ...c, last_update: newLog.timestamp || newLog.Timestamp || new Date().toISOString() } : c
        ))
    }

    const presenceChannel = supabaseClient.channel('online_drivers')
    
    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const newState = presenceChannel.presenceState()
            const onlineIds = new Set(Object.keys(newState))
            setOnlineDrivers(onlineIds)
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            setOnlineDrivers(prev => new Set([...Array.from(prev), key]))
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            setOnlineDrivers(prev => {
                const next = new Set(prev)
                next.delete(key)
                return next
            })
        })
        .subscribe()

    const channel = supabaseClient
      .channel('chat_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Chat_Messages' }, handleRealtimeInsert)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, handleRealtimeInsert)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_logs' }, handleGPSUpdate)
      .subscribe()

    return () => { 
        supabaseClient.removeChannel(channel)
        supabaseClient.removeChannel(presenceChannel)
    }
  }, [updateContactList, scrollToBottom, supabaseClient, isHydrated])

  const sendMessage = async () => {
    if (!inputMessage.trim() || !selectedDriverId || isSending) return
    const text = inputMessage.trim()
    setInputMessage('')
    setIsSending(true)

    const optimistic: ChatMessage = {
      id: Date.now(),
      sender_id: 'admin',
      receiver_id: selectedDriverId,
      message: text,
      created_at: new Date().toISOString(),
      is_read: false,
    }
    setMessages(prev => [...prev, optimistic])
    scrollToBottom()

    try {
        const { sendChatMessage } = await import('@/lib/actions/chat-actions')
        const result = await sendChatMessage('admin', text, selectedDriverId)
        if (!result.success) {
            setMessages(prev => prev.filter(m => m.id !== optimistic.id))
            setInputMessage(text)
            toast.error("ส่งไม่สำเร็จ")
        }
    } catch {
        toast.error("เกิดข้อผิดพลาด")
    } finally {
        setIsSending(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedDriverId) return
    setUploadingImage(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', 'Chat_Images')
    try {
        const { uploadImageToDrive } = await import('@/lib/actions/upload-actions')
        const uploadResult = await uploadImageToDrive(formData)
        if (uploadResult.success && uploadResult.directLink) {
            const { sendChatMessage } = await import('@/lib/actions/chat-actions')
            await sendChatMessage('admin', `[IMAGE] ${uploadResult.directLink}`, selectedDriverId)
        }
    } catch {
        toast.error('อัปโหลดล้มเหลว')
    } finally {
        setUploadingImage(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (!isHydrated) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto" /></div>

  const messageGroups = groupMessagesByDate(messages)
  const totalUnread = contacts.reduce((s, c) => s + (c.unread || 0), 0)

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      {/* Header */}
      <div className="bg-card p-6 rounded-2xl border shadow-sm shrink-0">
          <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                  <MessageSquare size={24} />
              </div>
              <div>
                  <h1 className="text-2xl font-bold uppercase tracking-tight">ศูนย์ติดต่อสื่อสาร</h1>
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Realtime Driver Communication</p>
              </div>
          </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
          {/* Sidebar */}
          <div className="w-80 bg-card border rounded-2xl flex flex-col overflow-hidden shadow-sm">
              <div className="p-4 border-b space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">คนขับรถ ({filteredContacts.length})</span>
                    {totalUnread > 0 && <span className="bg-primary text-white text-[10px] px-2 py-0.5 rounded-full font-bold">{totalUnread}</span>}
                  </div>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="ค้นหา..."
                        className="pl-9 h-10 text-sm bg-muted/30 border-none rounded-lg"
                    />
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {filteredContacts.map(c => (
                      <div 
                        key={c.driver_id}
                        onClick={() => setSelectedDriverId(c.driver_id)}
                        className={cn(
                            "p-3 rounded-xl cursor-pointer transition-colors flex items-center gap-3",
                            selectedDriverId === c.driver_id ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-muted"
                        )}
                      >
                          <div className="relative shrink-0">
                              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-bold border">
                                  {c.driver_name.charAt(0)}
                              </div>
                              {(() => {
                                  const isPresenceOnline = onlineDrivers.has(c.driver_id)
                                  const lastUpdateDate = c.last_update ? new Date(c.last_update) : null
                                  const isGPSOnline = lastUpdateDate && (new Date().getTime() - lastUpdateDate.getTime() < 10 * 60 * 1000)
                                  const isOnline = isPresenceOnline || isGPSOnline
                                  
                                  return (
                                      <div className={cn(
                                          "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background",
                                          isOnline ? "bg-emerald-500" : "bg-muted"
                                      )} />
                                  )
                              })()}
                          </div>
                          <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-baseline">
                                  <p className="text-sm font-bold truncate">{c.driver_name}</p>
                                  <span className="text-[9px] opacity-60">{formatTime(c.updated_at)}</span>
                              </div>
                              <p className="text-xs truncate opacity-70 italic">{c.last_message}</p>
                          </div>
                          {c.unread > 0 && <div className="w-2 h-2 bg-rose-500 rounded-full" />}
                      </div>
                  ))}
              </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 bg-card border rounded-2xl flex flex-col overflow-hidden shadow-sm">
              {activeDriver ? (
                  <>
                    <div className="p-4 border-b bg-muted/10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                                {activeDriver.driver_name.charAt(0)}
                            </div>
                            <div>
                                <p className="text-sm font-bold">{activeDriver.driver_name}</p>
                                {(() => {
                                    const isPresenceOnline = onlineDrivers.has(activeDriver.driver_id)
                                    const lastUpdateDate = activeDriver.last_update ? new Date(activeDriver.last_update) : null
                                    const isGPSOnline = lastUpdateDate && (new Date().getTime() - lastUpdateDate.getTime() < 10 * 60 * 1000)
                                    const isOnline = isPresenceOnline || isGPSOnline

                                    return (
                                        <p className={cn(
                                            "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1",
                                            isOnline ? "text-emerald-500" : "text-slate-400"
                                        )}>
                                            <span className={cn(
                                                "w-1.5 h-1.5 rounded-full",
                                                isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                                            )} /> 
                                            {isOnline ? 'Online' : 'Offline'}
                                        </p>
                                    )
                                })()}
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted/10">
                        {messageGroups.map((group, gi) => (
                            <div key={gi} className="space-y-4">
                                <div className="flex justify-center">
                                    <span className="text-[10px] font-bold bg-muted px-2 py-1 rounded text-muted-foreground uppercase">{formatDate(group.date)}</span>
                                </div>
                                {group.messages.map(msg => {
                                    const isMe = msg.sender_id === 'admin'
                                    return (
                                        <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                                            <div className={cn(
                                                "max-w-[70%] p-3 rounded-2xl text-sm shadow-sm",
                                                isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted text-foreground border border-border rounded-tl-none"
                                            )}>
                                                {msg.message.startsWith('[IMAGE] ') ? (
                                                    <div className="relative w-48 h-48 rounded-lg overflow-hidden">
                                                        <Image src={msg.message.replace('[IMAGE] ', '')} alt="Chat" fill className="object-cover" />
                                                    </div>
                                                ) : <p>{msg.message}</p>}
                                                <div className={cn("text-[9px] mt-1 opacity-60 flex items-center gap-1", isMe ? "justify-end" : "justify-start")}>
                                                    {formatTime(msg.created_at)}
                                                    {isMe && (msg.is_read ? <CheckCheck size={10} /> : <Check size={10} />)}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-4 border-t">
                        <div className="flex gap-2 items-center">
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                            <Button variant="ghost" size="icon" disabled={uploadingImage} onClick={() => fileInputRef.current?.click()}>
                                {uploadingImage ? <Loader2 className="animate-spin" size={18} /> : <ImageIcon size={18} />}
                            </Button>
                            <Input 
                                value={inputMessage}
                                onChange={e => setInputMessage(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                                placeholder="พิมพ์ข้อความ..."
                                className="flex-1"
                            />
                            <Button onClick={sendMessage} disabled={!inputMessage.trim() || isSending}>
                                <Send size={18} />
                            </Button>
                        </div>
                    </div>
                  </>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50">
                      <MessageSquare size={64} className="mb-4" />
                      <p className="font-bold uppercase tracking-widest">กรุณาเลือกคนขับเพื่อเริ่มสนทนา</p>
                  </div>
              )}
          </div>
      </div>
    </div>
  )
}
