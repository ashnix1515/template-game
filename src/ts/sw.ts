/// <reference lib="webworker" />
export {};
declare const self: ServiceWorkerGlobalScope;

// Cache-first service worker with commit-based update detection. Ported
// from diplospot's sw.js: assets are served from cache first (local-first),
// and every page navigation triggers a background check of buildinfo.js -
// if its commit differs from what's cached, every asset is re-fetched and
// clients are told an update is ready.

const CACHE_NAME = 'template-game-v1';
const ASSETS = [
  './',
  './index.html',
  './debug.html',
  './buildinfo.js',
  './assets/manifest.json',
  './assets/icon.svg',
  './assets/favicon.svg',
];

interface BuildInfo {
  commit: string;
  repoUrl: string;
  builtAt: string;
}

function log(message: string): void {
  try {
    console.log('[sw]', message);
  } catch {
    // console unavailable
  }
  notifyClients({ type: 'SW_LOG', message, time: new Date().toISOString() });
}

function notifyClients(msg: Record<string, unknown>): Promise<void> {
  return self.clients
    .matchAll({ includeUncontrolled: true })
    .then((clients) => {
      clients.forEach((c) => c.postMessage(msg));
    })
    .catch(() => {});
}

function parseBuildInfo(text: string): BuildInfo | null {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function getCachedBuildInfo(): Promise<BuildInfo | null> {
  return caches
    .open(CACHE_NAME)
    .then((cache) => cache.match('./buildinfo.js'))
    .then((cached) => (cached ? cached.text() : null))
    .then((text) => (text ? parseBuildInfo(text) : null));
}

function checkForUpdate(): Promise<void> {
  return fetch('./buildinfo.js', { cache: 'no-store' })
    .then((res) => res.text())
    .then((text) => {
      const remote = parseBuildInfo(text);
      if (!remote) return;
      return getCachedBuildInfo().then((current) => {
        if (!current || current.commit !== remote.commit) {
          log(`new build detected: ${remote.commit} (was ${current && current.commit})`);
          return refreshAllAssets(remote);
        }
        log(`up to date: ${remote.commit}`);
        return notifyClients({ type: 'BUILD_STATUS', local: current, remote, refreshed: false });
      });
    })
    .catch((e) => {
      log(`update check failed: ${e}`);
    });
}

function refreshAllAssets(remote: BuildInfo): Promise<void> {
  return caches
    .open(CACHE_NAME)
    .then((cache) => {
      return Promise.all(
        ASSETS.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => {
              if (res && res.status === 200) {
                log(`refreshed ${url}`);
                return cache.put(url, res);
              }
            })
            .catch((e) => {
              log(`refresh FAILED: ${url} - ${e}`);
            })
        )
      );
    })
    .then(() => {
      log(`refresh complete for ${remote.commit}`);
      return notifyClients({ type: 'UPDATE_READY', buildInfo: remote });
    });
}

self.addEventListener('install', (event) => {
  log(`install: starting, CACHE_NAME=${CACHE_NAME}`);
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return Promise.all(
          ASSETS.map((url) =>
            cache
              .add(url)
              .then(() => log(`precached ${url}`))
              .catch((e) => log(`precache FAILED: ${url} - ${e}`))
          )
        );
      })
      .then(() => {
        log('install: complete');
      })
  );
});

self.addEventListener('activate', (event) => {
  log('activate: starting');
  event.waitUntil(
    caches
      .keys()
      .then((names) => {
        return Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              log(`deleting old cache: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        log('activate: clients.claim()');
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.waitUntil(checkForUpdate());
  }
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(event.request).then((networkResponse) => {
        if (
          !networkResponse ||
          networkResponse.status !== 200 ||
          networkResponse.type !== 'basic'
        ) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          })
          .catch(() => {});
        return networkResponse;
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    log('SKIP_WAITING received');
    self.skipWaiting();
  } else if (event.data.type === 'CHECK_UPDATE') {
    checkForUpdate();
  }
});
