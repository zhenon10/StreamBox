import { KeepAwake } from '@capacitor-community/keep-awake';
import { App } from '@capacitor/app';
import type { DeviceInfo, PlatformService } from '../interfaces';
import { setAndroidTelevision } from '../detectPlatform';
import { acquireWakeLock, releaseWakeLock } from '../wakeLock';
import { queryIsTelevision } from './tvMode';

export class AndroidPlatformService implements PlatformService {
  async initialize(): Promise<void> {
    const television = await queryIsTelevision();
    setAndroidTelevision(television);
    document.documentElement.dataset.platform = 'android';
    document.documentElement.dataset.ui = television ? 'tv' : 'touch';
    document.documentElement.dataset.target = television ? 'tv' : 'mobile';
    if (television) {
      const viewport = document.querySelector('meta[name="viewport"]');
      viewport?.setAttribute('content', 'width=1920, height=1080, initial-scale=1.0');
    } else {
      bindPhoneViewport();
    }
  }

  getDeviceInfo(): DeviceInfo {
    return {
      platform: 'android',
      model: 'Android',
      osVersion: navigator.userAgent,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      is4K: window.innerWidth >= 3840,
    };
  }

  exitApp(): void {
    void App.exitApp().catch(() => window.close());
  }

  setKeepScreenOn(enabled: boolean): void {
    if (enabled) {
      void acquireWakeLock();
      void KeepAwake.keepAwake().catch(() => undefined);
      return;
    }
    void releaseWakeLock();
    void KeepAwake.allowSleep().catch(() => undefined);
  }
}

function bindPhoneViewport(): void {
  const root = document.documentElement;
  const apply = (): void => {
    const vv = window.visualViewport;
    const height = Math.round(vv?.height ?? window.innerHeight);
    root.style.setProperty('--app-height', `${String(height)}px`);
  };
  apply();
  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}
