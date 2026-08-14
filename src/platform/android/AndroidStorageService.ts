import { Preferences } from '@capacitor/preferences';
import type { StorageService } from '../interfaces';

/**
 * Dual-write: Capacitor Preferences (Android SharedPreferences) + WebView localStorage.
 * WebView storage is wiped on some devices / debug reinstalls; native prefs survive app restarts.
 */
export class AndroidStorageService implements StorageService {
  async getItem(key: string): Promise<string | null> {
    try {
      const native = await Preferences.get({ key });
      if (native.value != null && native.value !== '') return native.value;
    } catch {
      /* fall through to localStorage */
    }

    try {
      const local = localStorage.getItem(key);
      if (local != null) {
        void Preferences.set({ key, value: local }).catch(() => undefined);
        return local;
      }
    } catch {
      /* ignore */
    }

    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota — native prefs still persist */
    }
    try {
      await Preferences.set({ key, value });
    } catch {
      /* localStorage is the fallback */
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    try {
      await Preferences.remove({ key });
    } catch {
      /* ignore */
    }
  }

  async getKeys(prefix?: string): Promise<string[]> {
    const keys = new Set<string>();
    try {
      const result = await Preferences.keys();
      for (const key of result.keys) keys.add(key);
    } catch {
      /* ignore */
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) keys.add(key);
      }
    } catch {
      /* ignore */
    }
    const all = [...keys];
    return prefix ? all.filter((key) => key.startsWith(prefix)) : all;
  }
}
