export function isCrossOriginIsolated(): boolean {
  return typeof window !== 'undefined' && window.crossOriginIsolated === true;
}

export function hasSharedArrayBuffer(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

export async function hasOPFS(): Promise<boolean> {
  try {
    if (!navigator?.storage?.getDirectory) return false;
    await navigator.storage.getDirectory();
    return true;
  } catch {
    return false;
  }
}
