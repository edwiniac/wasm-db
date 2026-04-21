import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isCrossOriginIsolated', () => {
  it('returns true when window.crossOriginIsolated is true', async () => {
    Object.defineProperty(window, 'crossOriginIsolated', { value: true, configurable: true });
    const { isCrossOriginIsolated } = await import('@/util/featureDetect');
    expect(isCrossOriginIsolated()).toBe(true);
  });

  it('returns false when window.crossOriginIsolated is false', async () => {
    Object.defineProperty(window, 'crossOriginIsolated', { value: false, configurable: true });
    vi.resetModules();
    const { isCrossOriginIsolated } = await import('@/util/featureDetect');
    expect(isCrossOriginIsolated()).toBe(false);
  });
});

describe('hasSharedArrayBuffer', () => {
  it('returns boolean for SharedArrayBuffer availability', async () => {
    vi.resetModules();
    const { hasSharedArrayBuffer } = await import('@/util/featureDetect');
    expect(typeof hasSharedArrayBuffer()).toBe('boolean');
  });
});

describe('hasOPFS', () => {
  it('returns false when navigator.storage.getDirectory is not available', async () => {
    vi.resetModules();
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: vi.fn() },
      configurable: true,
    });
    const { hasOPFS } = await import('@/util/featureDetect');
    await expect(hasOPFS()).resolves.toBe(false);
  });

  it('returns true when navigator.storage.getDirectory resolves', async () => {
    vi.resetModules();
    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory: vi.fn().mockResolvedValue({}) },
      configurable: true,
    });
    const { hasOPFS } = await import('@/util/featureDetect');
    await expect(hasOPFS()).resolves.toBe(true);
  });

  it('returns false when getDirectory throws', async () => {
    vi.resetModules();
    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory: vi.fn().mockRejectedValue(new Error('DOMException')) },
      configurable: true,
    });
    const { hasOPFS } = await import('@/util/featureDetect');
    await expect(hasOPFS()).resolves.toBe(false);
  });
});
