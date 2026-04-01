// Firebase Cloud Messaging Service Worker
// This file must be in the public/ root directory and served at /firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCbkEpvYeoQJ0O-pjszaNb1Nj5T0wf_T3s",
  authDomain: "smart-broker-usa.firebaseapp.com",
  projectId: "smart-broker-usa",
  storageBucket: "smart-broker-usa.firebasestorage.app",
  messagingSenderId: "349178824168",
  appId: "1:349178824168:web:96a4ebb72e96deb3b8505d",
});

const messaging = firebase.messaging();

// Handle background messages (when app is not in focus)
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Background message received:', payload);

  const { title, body, icon, badge, data } = payload.notification || {};
  const notificationTitle = title || 'Smart Broker USA';
  const notificationOptions = {
    body: body || '',
    icon: icon || '/icons/icon-192x192.png',
    badge: badge || '/icons/icon-72x72.png',
    data: data || payload.data || {},
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    tag: payload.data?.tag || 'smart-broker-notification',
    renotify: true,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If app is already open, focus it
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(urlToOpen);
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
