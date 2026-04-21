// Single place that uses console.*. All other modules import from here.

function isDebugEnabled(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').has('debug');
  } catch {
    return false;
  }
}

function createLogger(prefix?: string) {
  const tag = prefix ? `[${prefix}]` : '';

  return {
    debug(msg: string, ...args: unknown[]): void {
      if (!isDebugEnabled()) return;
      console.debug(`${tag} ${msg}`, ...args);
    },
    info(msg: string, ...args: unknown[]): void {
      console.info(`${tag} ${msg}`, ...args);
    },
    warn(msg: string, ...args: unknown[]): void {
      console.warn(`${tag} ${msg}`, ...args);
    },
    error(msg: string, ...args: unknown[]): void {
      console.error(`${tag} ${msg}`, ...args);
    },
  };
}

export const logger = createLogger();
export const workerLogger = createLogger('worker');
