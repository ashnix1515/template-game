import { describe, it, expect, beforeEach, vi } from 'vitest';

type Listener = (event: { data?: unknown }) => void;

function makeServiceWorkerContainer() {
  const listeners: Record<string, Listener[]> = {};
  return {
    addEventListener: (evt: string, handler: Listener) => {
      (listeners[evt] ??= []).push(handler);
    },
    dispatch: (evt: string, data?: unknown) => {
      (listeners[evt] || []).forEach((h) => h({ data }));
    },
  };
}

describe('sw-logs', () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
  });

  it('stores SW_LOG messages and notifies subscribers, and clearLogs empties them', async () => {
    const container = makeServiceWorkerContainer();
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });

    const { getLogs, clearLogs, onSwLog } = await import('../src/ts/sw-logs');

    expect(getLogs()).toEqual([]);

    const received: unknown[][] = [];
    onSwLog((logs) => received.push(logs));

    container.dispatch('message', {
      type: 'SW_LOG',
      time: '12:00:00',
      message: 'install: complete',
    });

    expect(getLogs()).toEqual([{ time: '12:00:00', message: 'install: complete' }]);
    expect(received).toHaveLength(1);

    clearLogs();
    expect(getLogs()).toEqual([]);
    expect(received).toHaveLength(2);
  });

  it('persists logs to localStorage across module reloads', async () => {
    const container = makeServiceWorkerContainer();
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });

    const first = await import('../src/ts/sw-logs');
    container.dispatch('message', { type: 'SW_LOG', time: 't', message: 'persisted' });

    vi.resetModules();
    const second = await import('../src/ts/sw-logs');
    expect(second.getLogs()).toEqual(first.getLogs());
  });
});
