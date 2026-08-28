// Registers the service worker and shows the "New version available" banner.
// Ported from diplospot's sw-register.js: local-first caching means the page
// you're looking at can be stale, so this drives the update UI + the reload
// that happens once the new worker takes over.

export interface SwState {
  registration: ServiceWorkerRegistration | null;
}

export const swState: SwState = { registration: null };

function showUpdateNotification(): void {
  const notification = document.getElementById('update-notification');
  if (!notification) return;

  notification.classList.remove('hidden');
  const refreshButton = notification.querySelector<HTMLButtonElement>('.refresh-button');
  if (refreshButton) {
    refreshButton.onclick = () => {
      if (swState.registration?.waiting) {
        swState.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    };
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        swState.registration = reg;

        if (reg.waiting) {
          showUpdateNotification();
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateNotification();
            }
          });
        });

        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'UPDATE_READY') {
            showUpdateNotification();
          }
        });

        reg.update();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update();
          }
        });
        setInterval(
          () => {
            reg.update();
          },
          60 * 60 * 1000
        );
      })
      .catch(() => {});

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      if (!hadController) {
        hadController = true;
        return;
      }
      refreshing = true;
      window.location.reload();
    });
  });
}
