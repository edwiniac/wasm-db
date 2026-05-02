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

export function isMacPlatform(): boolean {
  if ((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform) {
    return (navigator as { userAgentData?: { platform?: string } })
      .userAgentData!.platform!.toLowerCase()
      .includes('mac');
  }
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}
