import type { PlatformService, DeviceInfo } from '../interfaces';

/** Browser / Simulator platform bootstrap. */
export class BrowserPlatformService implements PlatformService {
  async initialize(): Promise<void> {
    document.documentElement.dataset.platform = 'browser';
    document.documentElement.dataset.target = 'simulator';
  }

  getDeviceInfo(): DeviceInfo {
    return {
      platform: 'browser',
      model: 'TV Simulator',
      osVersion: navigator.userAgent,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      is4K: window.innerWidth >= 3840,
    };
  }

  exitApp(): void {
    window.close();
  }

  setKeepScreenOn(_enabled: boolean): void {
    // No-op in browser simulator
  }
}
