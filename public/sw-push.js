// ─────────────────────────────────────────────────────────────────
// LOGIS-PRO Service Worker — Push Notification Handler
// Handles Web Push for both Admin (desktop) and Driver (mobile web)
// ─────────────────────────────────────────────────────────────────

// ── Lifecycle Management: Force immediate update ──
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", function (event) {
  console.log("[SW] Push Received.");

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || "LOGIS-PRO";
  const notifType = data.type || "general";

  // ── Vibration patterns per event type ──
  const vibratePatterns = {
    sos:           [0, 500, 100, 500, 100, 800, 200, 500],   // Aggressive SOS
    chat:          [0, 200, 100, 200],                         // Double buzz
    new_job:       [0, 300, 100, 300, 100, 400],               // Triple bump
    status_update: [0, 150, 100, 150],                         // Light double
    marketplace:   [0, 250, 100, 250, 100, 250],               // Triple light
    general:       [0, 200, 100, 300],                         // Standard
  };

  const vibrate = vibratePatterns[notifType] || vibratePatterns.general;

  // ── Notification tag: unique per driver/job to avoid unwanted collapsing ──
  const tag = data.tag || `tms-${notifType}-${Date.now()}`;

  // ── Action buttons ──
  const actions = data.actions || [];

  // SOS: always add default action buttons if not provided
  if (notifType === "sos" && actions.length === 0) {
    actions.push(
      { action: "view_location", title: "📍 ดูตำแหน่ง" },
      { action: "call_driver",   title: "📞 โทรหาคนขับ" }
    );
  }

  const options = {
    body: data.body || "มีรายการอัปเดตใหม่ในระบบ",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate,
    requireInteraction: notifType === "sos" || notifType === "new_job",  // Persistent for critical events
    silent: false,
    sound: notifType === "sos" ? "/sounds/emergency.mp3" : "/sounds/notification.mp3", // Hint for some browsers
    data: {
      url:         data.url || "/",
      type:        notifType,
      driverPhone: data.driverPhone || null,
      driverId:    data.driverId || null,
    },
    actions,
    tag,
    renotify: true,
  };

  // ── Broadcast to active clients to trigger custom sound ──
  // Redundant Dual-Signaling Strategy for maximum reliability
  event.waitUntil(
    Promise.all([
      // 1. Using BroadcastChannel (Broad focus)
      (async () => {
        try {
          const channel = new BroadcastChannel("notification_channel");
          channel.postMessage({
            type: "PUSH_RECEIVED",
            notification: {
              title,
              body: options.body,
              type: notifType,
              data: options.data
            }
          });
          channel.close();
        } catch (err) {
          console.error("[SW] BroadcastChannel error:", err);
        }
      })(),

      // 2. Using clients.postMessage (Direct focus)
      (async () => {
        try {
          const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
          windowClients.forEach((client) => {
            client.postMessage({
              type: "PUSH_RECEIVED",
              notification: {
                title,
                body: options.body,
                type: notifType,
                data: options.data
              }
            });
          });
        } catch (err) {
          console.error("[SW] direct client postMessage error:", err);
        }
      })()
    ])
    .then(() => self.registration.showNotification(title, options))
  );
});

// ─────────────────────────────────────────────────────────────────
// Notification Click Handler
// ─────────────────────────────────────────────────────────────────
self.addEventListener("notificationclick", function (event) {
  console.log("[SW] Notification click:", event.action);

  event.notification.close();

  const notifData = event.notification.data || {};
  let urlToOpen = notifData.url || "/";

  // ── Handle specific action buttons ──
  if (event.action === "call_driver" && notifData.driverPhone) {
    // Open tel: link — works on mobile, prompts on desktop
    urlToOpen = `tel:${notifData.driverPhone}`;
    event.waitUntil(clients.openWindow(urlToOpen));
    return;
  }

  if (event.action === "view_location" && notifData.driverId) {
    urlToOpen = `/monitoring?driver=${notifData.driverId}`;
  }

  // ── Navigate to URL ──
  const fullUrl = new URL(urlToOpen, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(function (windowClients) {
        // Focus existing window if URL already open
        for (const client of windowClients) {
          if (client.url === fullUrl && "focus" in client) {
            return client.focus();
          }
        }
        // Navigate an existing open window
        if (windowClients.length > 0) {
          const client = windowClients[0];
          if ("navigate" in client) {
            return client.navigate(fullUrl).then(c => c?.focus());
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(fullUrl);
        }
      })
  );
});
