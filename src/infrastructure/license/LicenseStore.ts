import type { StorageService } from '@/platform/interfaces';
import type { LicenseSnapshot } from '@/domain/license/types';

const LICENSE_KEY = 'license.snapshot';

export class LicenseStore {
  constructor(private readonly storage: StorageService) {}

  async get(): Promise<LicenseSnapshot | null> {
    const raw = await this.storage.getItem(LICENSE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as LicenseSnapshot;
      if (!parsed.token || !parsed.deviceId) return null;
      return {
        ...parsed,
        playlistUrl: typeof parsed.playlistUrl === 'string' ? parsed.playlistUrl : '',
      };
    } catch {
      return null;
    }
  }

  async save(snapshot: LicenseSnapshot): Promise<void> {
    await this.storage.setItem(LICENSE_KEY, JSON.stringify(snapshot));
  }

  async clear(): Promise<void> {
    await this.storage.removeItem(LICENSE_KEY);
  }
}
