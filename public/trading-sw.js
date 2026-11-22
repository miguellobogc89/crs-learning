// Service worker de CRS Trading (22/11/2026): solo notificaciones push. No guarda nada en caché ni intercepta
// peticiones, así la app se sigue cargando siempre desde la red como hasta ahora.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: "CRS Trading", body: event.data ? event.data.text() : "" };
  }
  const title = d.title || "CRS Trading";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || "",
      icon: "/trading-app/icon-192.png",
      badge: "/trading-app/icon-192.png",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || "/trading/inicio" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/trading/inicio", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (c.url.includes("/trading/") && "focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(url).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
