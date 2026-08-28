import { describe, it, expect, beforeEach, vi } from 'vitest';

type Listener = (event: { data?: unknown }) => void;

function makeRegistration(overrides: Record<string, unknown> = {}) {
  return {
    waiting: null,
    active: null,
    installing: null,
    update: vi.fn(),
    addEventListener: vi.fn(),
    ...overrides,
  };
}

function makeServiceWorkerContainer(registration: unknown, controller: unknown = null) {
  const listeners: Record<string, Listener[]> = {};
  return {
    controller,
    register: vi.fn().mockResolvedValue(registration),
    addEventListener: (evt: string, handler: Listener) => {
      (listeners[evt] ??= []).push(handler);
    },
    dispatch: (evt: string, data?: unknown) => {
      (listeners[evt] || []).forEach((h) => h({ data }));
    },
  };
}

// jsdom's `window` is shared across every test in this file, so a real
// window.dispatchEvent('load') would also re-fire every earlier test's
// leftover 'load' listener (each import registers a new one, none are ever
// removed). Capturing the handler this import registered and calling it
// directly keeps each test isolated to its own module instance.
async function importAndLoad() {
  const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
  const mod = await import('../src/ts/sw-register');
  const loadHandler = addEventListenerSpy.mock.calls.find(([evt]) => evt === 'load')?.[1] as
    (() => void) | undefined;
  addEventListenerSpy.mockRestore();
  expect(loadHandler).toBeTypeOf('function');
  loadHandler!();
  return mod;
}

describe('sw-register', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it('calls reg.update() on load and while the tab is visible, not while hidden', async () => {
    const reg = makeRegistration();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: makeServiceWorkerContainer(reg),
      configurable: true,
    });

    await importAndLoad();
    await Promise.resolve();
    await Promise.resolve();

    expect(reg.update).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reg.update).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reg.update).toHaveBeenCalledTimes(2);
  });

  it('does not reload on the initial controller claim, only on a real replacement', async () => {
    const reg = makeRegistration();
    const container = makeServiceWorkerContainer(reg, null);
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      configurable: true,
    });

    await importAndLoad();
    await Promise.resolve();

    container.dispatch('controllerchange');
    expect(reloadSpy).not.toHaveBeenCalled();

    container.dispatch('controllerchange');
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    container.dispatch('controllerchange');
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('shows the update notification when it receives an UPDATE_READY message', async () => {
    document.body.innerHTML = `
      <div id="update-notification" class="hidden">
        <button class="refresh-button"></button>
      </div>
    `;
    const reg = makeRegistration();
    const container = makeServiceWorkerContainer(reg, {});
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });

    await importAndLoad();
    await Promise.resolve();

    const notification = document.getElementById('update-notification')!;
    expect(notification.classList.contains('hidden')).toBe(true);

    container.dispatch('message', { type: 'UPDATE_READY' });
    expect(notification.classList.contains('hidden')).toBe(false);
  });
});
