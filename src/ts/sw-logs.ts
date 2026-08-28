// Relays log messages posted by the service worker (see src/ts/sw.ts) into
// localStorage, so both index.html and debug.html can show the same
// history. Ported from diplospot's sw-logs.js.

const SW_LOG_KEY = 'sw-logs';
const MAX_LOGS = 200;

export interface SwLogEntry {
  time: string;
  message: string;
}

type SwLogListener = (logs: SwLogEntry[]) => void;

function loadStoredLogs(): SwLogEntry[] {
  try {
    const raw = window.localStorage.getItem(SW_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistLogs(logs: SwLogEntry[]): void {
  try {
    window.localStorage.setItem(SW_LOG_KEY, JSON.stringify(logs));
  } catch {
    // storage unavailable (e.g. private browsing) - logs just won't persist
  }
}

let swLogs: SwLogEntry[] = loadStoredLogs();
let listener: SwLogListener | null = null;

export function getLogs(): SwLogEntry[] {
  return swLogs;
}

export function clearLogs(): void {
  swLogs = [];
  persistLogs(swLogs);
  listener?.(swLogs);
}

export function onSwLog(fn: SwLogListener | null): void {
  listener = fn;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== 'SW_LOG') return;
    swLogs.push({ time: data.time, message: data.message });
    if (swLogs.length > MAX_LOGS) swLogs = swLogs.slice(-MAX_LOGS);
    persistLogs(swLogs);
    listener?.(swLogs);
  });
}
