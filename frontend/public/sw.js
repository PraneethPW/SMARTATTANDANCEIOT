self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || "TransitSync", {
      body: data.body || "Journey update",
      tag: data.notificationId || "journey",
      data: { url: "/" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        const own = windows.find(
          (w) => new URL(w.url).origin === self.location.origin,
        );
        return own ? own.focus() : clients.openWindow("/");
      }),
  );
});
