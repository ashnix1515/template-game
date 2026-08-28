// Drives the "build info" modal: shows the commit this page was built from,
// asks the service worker what commit it has cached, and reports whether an
// update is available. Ported from diplospot's info-panel.js.

import { swState } from './sw-register';

export interface BuildInfo {
  commit: string;
  repoUrl: string;
  builtAt: string;
}

declare global {
  interface Window {
    BUILD_INFO?: BuildInfo;
  }
}

const DEFAULT_REPO_URL = 'https://github.com';

function formatDate(d: Date): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds}${ampm}`;
}

export function formatBuildInfo(info: Partial<BuildInfo> | null | undefined): string {
  if (!info) return 'unknown';
  const built = info.builtAt ? new Date(info.builtAt) : null;
  const when = built && !isNaN(built.getTime()) ? formatDate(built) : info.builtAt || 'unknown';
  const shortCommit = info.commit ? info.commit.substring(0, 7) : 'unknown';
  if (when === 'unknown' && shortCommit === 'unknown') return 'unknown';

  const repoUrl = info.repoUrl || window.BUILD_INFO?.repoUrl || DEFAULT_REPO_URL;
  const commitHtml = info.commit
    ? `<a href="${repoUrl}/commit/${info.commit}" target="_blank" rel="noopener">${shortCommit}</a>`
    : shortCommit;

  return `${when} ${commitHtml}`;
}

let serverBuildEl: HTMLElement | null = null;
let statusEl: HTMLElement | null = null;
let buildInfo: BuildInfo | null = null;
let pendingRefreshReload = false;

function updateStatus(remoteInfo: Partial<BuildInfo> | null | undefined): void {
  if (!statusEl) return;
  if (swState.registration?.waiting) {
    statusEl.textContent = 'Update available';
  } else if (buildInfo && remoteInfo?.commit) {
    statusEl.textContent =
      remoteInfo.commit === buildInfo.commit ? 'Up to date' : 'Update available';
  }
}

function wireModal(modal: HTMLElement, closeButton: HTMLElement | null, onOpen: () => void) {
  const backdrop = modal.querySelector<HTMLElement>('.info-modal-backdrop');

  function close(): void {
    modal.classList.add('hidden');
  }

  function open(): void {
    onOpen();
    modal.classList.remove('hidden');
  }

  closeButton?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);

  return {
    open,
    close,
    isOpen: () => !modal.classList.contains('hidden'),
  };
}

// Sends the active worker a CHECK_UPDATE request. Shared by opening the info
// modal (to refresh the "Server build" display) and Force Refresh (to know
// when it's safe to reload). Returns whether a request was actually sent.
function requestServerCheck(): boolean {
  if (!swState.registration?.active) return false;
  swState.registration.active.postMessage({ type: 'CHECK_UPDATE' });
  return true;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!data) return;
    if (data.type === 'BUILD_STATUS') {
      if (serverBuildEl) serverBuildEl.innerHTML = formatBuildInfo(data.remote);
      updateStatus(data.remote);
      pendingRefreshReload = false;
    } else if (data.type === 'UPDATE_READY') {
      if (serverBuildEl) serverBuildEl.innerHTML = formatBuildInfo(data.buildInfo);
      updateStatus(data.buildInfo);
      if (pendingRefreshReload) {
        pendingRefreshReload = false;
        window.location.reload();
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('info-button');
  const modal = document.getElementById('info-modal');
  if (!button || !modal) return;

  const repoLink = document.getElementById('info-repo-link') as HTMLAnchorElement | null;
  const localBuildEl = document.getElementById('info-local-build');
  statusEl = document.getElementById('info-update-status');
  const refreshButton = document.getElementById('info-force-refresh');
  buildInfo = window.BUILD_INFO ?? null;
  serverBuildEl = document.getElementById('info-server-build');

  const infoModal = wireModal(modal, document.getElementById('info-modal-close'), () => {
    if (buildInfo) {
      if (repoLink) {
        repoLink.href = buildInfo.repoUrl;
        repoLink.textContent = buildInfo.repoUrl;
      }
      if (localBuildEl) {
        localBuildEl.innerHTML = formatBuildInfo(buildInfo);
      }
    }

    if (statusEl) {
      if (swState.registration) {
        statusEl.textContent = swState.registration.waiting ? 'Update available' : 'Checking…';
        swState.registration.update();
      } else {
        statusEl.textContent = 'Unavailable';
      }
    }

    if (serverBuildEl) {
      serverBuildEl.textContent = 'Checking…';
      if (!requestServerCheck()) serverBuildEl.textContent = 'Unavailable';
    }
  });

  button.addEventListener('click', infoModal.open);
  refreshButton?.addEventListener('click', () => {
    if (swState.registration?.waiting) {
      swState.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else if (requestServerCheck()) {
      pendingRefreshReload = true;
      // reload happens from the message listener above, once UPDATE_READY arrives -
      // never reload immediately here, refreshAllAssets is async and may still be in flight.
    } else {
      window.location.reload();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && infoModal.isOpen()) {
      infoModal.close();
    }
  });
});
