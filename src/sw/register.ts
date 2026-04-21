import { logger } from '@/util/logger';

export async function registerSW(): Promise<void> {
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
