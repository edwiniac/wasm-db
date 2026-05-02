import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { relativeTime } from './relativeTime';

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps < 60 seconds ago', () => {
    const now = Date.now();
    vi.setSystemTime(now + 30_000);
    expect(relativeTime(now)).toBe('just now');
  });

  it('returns "N min ago" for timestamps 1-59 minutes ago', () => {
    const now = Date.now();
    vi.setSystemTime(now + 5 * 60_000);
    expect(relativeTime(now)).toBe('5 min ago');
  });

  it('returns "N hours ago" for timestamps 1-23 hours ago', () => {
    const now = Date.now();
    vi.setSystemTime(now + 3 * 60 * 60_000);
    expect(relativeTime(now)).toBe('3 hours ago');
  });

  it('returns "yesterday" for timestamps 24-47 hours ago', () => {
    const now = Date.now();
    vi.setSystemTime(now + 25 * 60 * 60_000);
    expect(relativeTime(now)).toBe('yesterday');
  });

  it('returns a locale date string for timestamps >= 48 hours ago', () => {
    const past = new Date('2024-01-01T00:00:00Z').getTime();
    vi.setSystemTime(new Date('2024-01-10T00:00:00Z').getTime());
    const result = relativeTime(past);
    expect(result).not.toBe('just now');
    expect(result).not.toMatch(/ago/);
    expect(result).not.toBe('yesterday');
    expect(result.length).toBeGreaterThan(0);
  });
});
