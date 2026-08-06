import type { PlatformService, DeviceInfo } from '../interfaces';

declare global {
  interface Window {
    webOS?: {
      platformBack?: () => void;
      deviceInfo?: (callback: (info: WebOSDeviceInfo) => void) => void;
    };
    PalmSystem?: {
      platformBack?: () => void;
      stageReady?: () => void;
    };
  }
}

interface WebOSDeviceInfo {
  modelName?: string;
  platformVersion?: string;
  sdkVersion?: string;
}

export class WebOSPlatformService implements PlatformService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (window.PalmSystem?.stageReady) {
      window.PalmSystem.stageReady();
    }

    document.addEventListener('webOSRelaunch', () => {
      window.location.reload();
    });

    this.initialized = true;
  }

  getDeviceInfo(): DeviceInfo {
    const width = window.innerWidth;
    const height = window.innerHeight;

    return {
      platform: 'webos',
      model: 'LG Smart TV',
      osVersion: 'unknown',
      screenWidth: width,
      screenHeight: height,
      is4K: width >= 3840 || height >= 2160,
    };
  }

  exitApp(): void {
    if (window.webOS?.platformBack) {
      window.webOS.platformBack();
      return;
    }
    if (window.PalmSystem?.platformBack) {
      window.PalmSystem.platformBack();
      return;
    }
    window.close();
  }

  setKeepScreenOn(enabled: boolean): void {
    if (enabled) {
      document.body.style.setProperty('--keep-screen-on', '1');
    } else {
      document.body.style.removeProperty('--keep-screen-on');
    }
  }
}
