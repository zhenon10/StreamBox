type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
};

let sentinel: WakeLockSentinelLike | null = null;

export async function acquireWakeLock(): Promise<void> {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
  };
  if (!nav.wakeLock?.request) return;
  try {
    sentinel = await nav.wakeLock.request('screen');
  } catch {
    sentinel = null;
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (!sentinel || sentinel.released) {
    sentinel = null;
    return;
  }
  try {
    await sentinel.release();
  } catch {
    // ignore
  } finally {
    sentinel = null;
  }
}
