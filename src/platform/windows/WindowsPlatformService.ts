import type { DeviceInfo, PlatformService } from '../interfaces';
import { acquireWakeLock, releaseWakeLock } from '../wakeLock';
import { invokeTauri, isTauriRuntime } from './tauriBridge';

export class WindowsPlatformService implements PlatformService {
  async initialize(): Promise<void> {
    document.documentElement.dataset.platform = 'windows';
    document.documentElement.dataset.target = 'desktop';
  }

  getDeviceInfo(): DeviceInfo {
    return {
      platform: 'windows',
      model: 'Windows',
      osVersion: navigator.userAgent,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      is4K: window.innerWidth >= 3840,
    };
  }

  exitApp(): void {
    if (isTauriRuntime()) {
      void invokeTauri('exit_app').catch(() => window.close());
      return;
    }
    window.close();
  }

  setKeepScreenOn(enabled: boolean): void {
    if (enabled) {
      void acquireWakeLock();
    } else {
      void releaseWakeLock();
    }
    if (isTauriRuntime()) {
      void invokeTauri('set_keep_awake', { enabled }).catch(() => undefined);
    }
  }
}
