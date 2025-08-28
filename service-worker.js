const CACHE_NAME = 'neotrack-v1.3';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/leaflet/dist/leaflet.css',
  'https://unpkg.com/leaflet/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/firebase/9.17.2/firebase-app-compat.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/firebase/9.17.2/firebase-database-compat.min.js'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installation en cours...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Cache ouvert');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Tous les fichiers mis en cache');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Erreur lors de la mise en cache:', error);
      })
  );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activation en cours...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activation terminée');
      return self.clients.claim();
    })
  );
});

// Stratégie de cache: Network First avec fallback
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-HTTP et les requêtes Firebase
  if (!event.request.url.startsWith('http') || 
      event.request.url.includes('firebaseio.com') ||
      event.request.url.includes('googleapis.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la requête réussit, cloner la réponse et la mettre en cache
        if (response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // En cas d'échec réseau, essayer de servir depuis le cache
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              console.log('Service Worker: Servir depuis le cache:', event.request.url);
              return response;
            }
            
            // Si pas en cache, retourner une réponse offline pour les pages HTML
            if (event.request.destination === 'document') {
              return caches.match('/index.html');
            }
            
            // Pour les autres ressources, retourner une erreur
            return new Response('Ressource non disponible hors ligne', {
              status: 408,
              statusText: 'Offline'
            });
          });
      })
  );
});

// Gestion des notifications push (optionnel pour futures améliorations)
self.addEventListener('push', (event) => {
  console.log('Service Worker: Notification push reçue');
  
  const options = {
    body: event.data ? event.data.text() : 'Nouvelle position du bus disponible',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2'
    },
    actions: [
      {
        action: 'explore',
        title: 'Voir sur NeoTrack',
        icon: '/check.png'
      },
      {
        action: 'close',
        title: 'Fermer',
        icon: '/xmark.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('NeoTrack - Bus Update', options)
  );
});

// Gestion des clics sur les notifications
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Clic sur notification:', event);
  event.notification.close();

  if (event.action === 'explore') {
    // Ouvrir ou focaliser NeoTrack
    event.waitUntil(
      clients.matchAll().then((clientList) => {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Synchronisation en arrière-plan pour l'envoi de positions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Synchronisation en arrière-plan:', event.tag);
  
  if (event.tag === 'background-position-sync') {
    event.waitUntil(syncPosition());
  }
});

// Fonction de synchronisation des positions
async function syncPosition() {
  try {
    // Récupérer les positions en attente depuis IndexedDB ou localStorage
    const pendingPositions = await getPendingPositions();
    
    if (pendingPositions.length > 0) {
      // Envoyer chaque position à Firebase
      for (const position of pendingPositions) {
        try {
          await sendPositionToFirebase(position);
          await removePendingPosition(position.id);
        } catch (error) {
          console.error('Erreur envoi position:', error);
        }
      }
    }
  } catch (error) {
    console.error('Erreur synchronisation:', error);
  }
}

// Fonctions utilitaires pour la gestion des positions hors ligne
async function getPendingPositions() {
  // Implémentation simple avec localStorage (à améliorer avec IndexedDB)
  try {
    const pending = localStorage.getItem('neotrack_pending_positions');
    return pending ? JSON.parse(pending) : [];
  } catch {
    return [];
  }
}

async function removePendingPosition(positionId) {
  try {
    const pending = await getPendingPositions();
    const filtered = pending.filter(p => p.id !== positionId);
    localStorage.setItem('neotrack_pending_positions', JSON.stringify(filtered));
  } catch (error) {
    console.error('Erreur suppression position:', error);
  }
}

async function sendPositionToFirebase(position) {
  // Cette fonction sera appelée depuis le script principal
  // Ici on peut juste logger pour debug
  console.log('Service Worker: Position à envoyer:', position);
}

// Gestion des erreurs globales
self.addEventListener('error', (event) => {
  console.error('Service Worker: Erreur globale:', event.error);
});

// Gestion des erreurs de promesses non catchées
self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker: Promesse rejetée:', event.reason);
});

// Message du client principal
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message reçu:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({version: CACHE_NAME});
  }
  
  if (event.data && event.data.type === 'CACHE_POSITION') {
    // Sauvegarder une position pour envoi ultérieur
    const position = event.data.position;
    getPendingPositions().then(pending => {
      pending.push({
        ...position,
        id: Date.now().toString(),
        timestamp: Date.now()
      });
      localStorage.setItem('neotrack_pending_positions', JSON.stringify(pending));
    });
  }
});

console.log('Service Worker NeoTrack chargé - Version:', CACHE_NAME);
