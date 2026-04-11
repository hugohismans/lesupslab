// ═══════════════════════════════════════════════════════════════════
// firebase-messaging-sw.js — Service Worker FCM (Couche D.2 — Push PWA)
//
// CONFIGURATION REQUISE :
// 1. Remplacer les valeurs CONFIG ci-dessous par celles de votre projet Firebase
//    (Firebase Console → Paramètres du projet → Vos applications → SDK)
// 2. Générer une clé VAPID : Firebase Console → Cloud Messaging → Certificats Web Push
// 3. Copier la clé VAPID dans js/config.js : CONFIG.VAPID_KEY = "..."
// 4. Dans app.js, appeler messaging.getToken({ vapidKey: CONFIG.VAPID_KEY })
//    et stocker le token dans DB : agentStatus/{agentKey}/fcmTokens/{tokenId}
// 5. Une Cloud Function Firebase envoie le push quand une notification est créée
//    (voir documentation Couche D.2 dans le plan)
// ═══════════════════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// ── Config Firebase (identique à js/config.js) ────────────────────
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBV5plJl_9fbjhpumCNoj6BgVN3uqpWrOs',
  authDomain:        'cpasquaregnon-70f59.firebaseapp.com',
  databaseURL:       'https://cpasquaregnon-70f59-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         'cpasquaregnon-70f59',
  storageBucket:     'cpasquaregnon-70f59.firebasestorage.app',
  messagingSenderId: '1028628915813',
  appId:             '1:1028628915813:web:dbca4db8ed5b511321c88c',
};

firebase.initializeApp(FIREBASE_CONFIG);
const messaging = firebase.messaging();

// ── Réception d'un push en arrière-plan ───────────────────────────
messaging.onBackgroundMessage(function(payload) {
  const data  = payload.data || {};
  const title = payload.notification?.title || 'moncompagnon';
  const body  = payload.notification?.body  || data.message || '';
  const type  = data.type || 'info';
  const icons = { alert: '🚨 ', warn: '⚠️ ', info: 'ℹ️ ' };

  self.registration.showNotification(`${icons[type] || ''}${title}`, {
    body,
    icon:  '/assets/logo.jpg',
    badge: '/assets/logo.jpg',
    tag:   `moncompagnon_${type}`,
    renotify: type === 'alert',
    data: { url: payload.data?.url || '/app.html' },
  });
});

// ── Clic sur la notification → ouvrir l'app ───────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/app.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes('app.html'));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
