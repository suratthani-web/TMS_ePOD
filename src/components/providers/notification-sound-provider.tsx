"use client"

import { useEffect, useRef } from "react"

export function NotificationSoundProvider() {
  const notificationAudio = useRef<HTMLAudioElement | null>(null)
  const emergencyAudio = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    console.log("[SoundProvider] Mounted and listening for SW messages...")

    // ── Initialize Audio Elements ──
    notificationAudio.current = new Audio("/sounds/notification.mp3")
    emergencyAudio.current = new Audio("/sounds/emergency.mp3")

    // Configure audio
    if (notificationAudio.current) notificationAudio.current.preload = "auto"
    if (emergencyAudio.current) emergencyAudio.current.preload = "auto"

    // ── Unlock Audio on First User Interaction ──
    const handleFirstInteraction = () => {
      const unlock = (audio: HTMLAudioElement) => {
        const prevVolume = audio.volume;
        audio.volume = 0; // Mute during unlock
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = prevVolume; // Restore volume
        }).catch(() => {});
      }
      
      if (notificationAudio.current) unlock(notificationAudio.current);
      if (emergencyAudio.current) unlock(emergencyAudio.current);
      
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("touchstart", handleFirstInteraction);
      document.removeEventListener("keydown", handleFirstInteraction);
    }

    document.addEventListener("click", handleFirstInteraction);
    document.addEventListener("touchstart", handleFirstInteraction);
    document.addEventListener("keydown", handleFirstInteraction);

    const handleMessage = (data: { type?: string; notification?: { type?: string; title?: string } }, source: string) => {
      // Check if message is of type PUSH_RECEIVED
      if (data && data.type === "PUSH_RECEIVED") {
        const { type, title } = data.notification ?? {}

        console.log(`[SoundProvider] [Source: ${source}] Push Received: "${title}" (Type: ${type})`)

        try {
          if (type === "sos") {
            if (emergencyAudio.current) {
              console.log("[SoundProvider] Attempting to play EMERGENCY sound...")
              emergencyAudio.current.currentTime = 0
              emergencyAudio.current.play()
                .then(() => console.log("[SoundProvider] EMERGENCY sound played successfully."))
                .catch(e => console.warn("[SoundProvider] SOS sound BLOCKED by browser:", e.message))
            }
          } else {
            if (notificationAudio.current) {
              console.log("[SoundProvider] Attempting to play NOTIFICATION sound...")
              notificationAudio.current.currentTime = 0
              notificationAudio.current.play()
                .then(() => console.log("[SoundProvider] NOTIFICATION sound played successfully."))
                .catch(e => console.warn("[SoundProvider] Notification sound BLOCKED by browser:", e.message))
            }
          }
        } catch (error) {
          console.error("[SoundProvider] Exception during playback:", error)
        }
      }
    }

    // ── Channel 1: BroadcastChannel (Legacy/Tab-wide) ──
    const channel = new BroadcastChannel("notification_channel")
    channel.onmessage = (event) => handleMessage(event.data, "BroadcastChannel")

    // ── Channel 2: Service Worker Message (Direct Client) ──
    const handleSWMessage = (event: MessageEvent) => handleMessage(event.data, "ServiceWorker")
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSWMessage)
    }

    return () => {
      channel.close()
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSWMessage)
      }
      document.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("touchstart", handleFirstInteraction);
      document.removeEventListener("keydown", handleFirstInteraction);
    }
  }, [])

  return null // This component only handles side effects
}
