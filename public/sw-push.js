// Service Worker handlers para Web Push Notifications.
self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const payload = event.data.json();
      const title = payload.title || 'AxéCloud';
      const options = {
        body: payload.body || 'Você tem uma nova notificação.',
        icon: '/axecloud_192.png',
        badge: '/axecloud_192.png',
        data: {
          url: payload.url || '/'
        },
        vibrate: [100, 50, 100],
        actions: [
          { action: 'open', title: 'Ver Agora' }
        ]
      };

      event.waitUntil(
        self.registration.showNotification(title, options)
      );
    } catch (e) {
      console.error('Erro ao processar payload do push:', e);
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const urlToOpen = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Se já houver uma aba aberta, foca nela e navega.
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Se não houver, abre uma nova.
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
