import { logger } from '@/util/logger';
import { useQueryStore } from '@/state/store';

function dispatchOnlineState(online: boolean): void {
  useQueryStore.getState().dispatch({ type: 'SET_ONLINE', online });
}

export async function registerSW(): Promise<void> {
  // Online/offline tracking works independently of SW support.
  window.addEventListener('online', () => dispatchOnlineState(true));
  window.addEventListener('offline', () => dispatchOnlineState(false));
  // Sync initial state if the page loaded while offline.
  if (!navigator.onLine) dispatchOnlineState(false);

  if (!('serviceWorker' in navigator)) {
    logger.warn('Service Worker not supported — fetch invariant cannot be enforced');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    logger.info('Service Worker registered', reg.scope);
  } catch (err) {
    logger.error('Service Worker registration failed', err);
  }
}
