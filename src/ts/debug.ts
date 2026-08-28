// Entry bundle for debug.html: renders the service-worker log history kept
// by sw-logs.ts. Ported from diplospot's logs.js.

import { getLogs, clearLogs, onSwLog, type SwLogEntry } from './sw-logs';

function render(contentEl: HTMLElement, logs: SwLogEntry[]): void {
  contentEl.textContent = logs.length
    ? logs.map((e) => `[${e.time}] ${e.message}`).join('\n')
    : 'No logs yet.';
  contentEl.scrollTop = contentEl.scrollHeight;
}

document.addEventListener('DOMContentLoaded', () => {
  const contentEl = document.getElementById('logs-content');
  const clearButton = document.getElementById('logs-clear');
  if (!contentEl) return;

  onSwLog((logs) => render(contentEl, logs));
  render(contentEl, getLogs());

  clearButton?.addEventListener('click', () => {
    clearLogs();
  });
});
