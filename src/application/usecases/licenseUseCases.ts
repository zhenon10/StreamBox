import type { StorageService } from '@/platform/interfaces';
import type { ILicenseClient } from '@/domain/license/ILicenseClient';
import type {
  ActivateResult,
  LicenseErrorCode,
  LicenseSnapshot,
  ValidateResult,
} from '@/domain/license/types';
import { getOrCreateDeviceId } from '@/infrastructure/license/DeviceIdentity';
import { LicenseStore } from '@/infrastructure/license/LicenseStore';

export interface LicenseUseCaseDeps {
  readonly licenseClient: ILicenseClient;
  readonly storage: StorageService;
  readonly licenseStore?: LicenseStore;
}

function store(deps: LicenseUseCaseDeps): LicenseStore {
  return deps.licenseStore ?? new LicenseStore(deps.storage);
}

async function persistActivation(
  deps: LicenseUseCaseDeps,
  deviceId: string,
  result: Extract<ActivateResult, { ok: true }>,
): Promise<ActivateResult> {
  const snapshot: LicenseSnapshot = {
    token: result.token,
    deviceId,
    expiresAt: result.expiresAt,
    playlistUrl: result.playlistUrl,
    planName: result.planName,
    activatedAt: Date.now(),
  };
  await store(deps).save(snapshot);
  return result;
}

export async function activateLicense(
  deps: LicenseUseCaseDeps,
  code: string,
  deviceLabel?: string,
): Promise<ActivateResult> {
  const deviceId = await getOrCreateDeviceId(deps.storage);
  const result = await deps.licenseClient.activate(code.trim(), deviceId, deviceLabel);
  if (!result.ok) return result;
  return persistActivation(deps, deviceId, result);
}

/** Site satışından sonra: kod girmeden cihaz ID ile lisansı çek. */
export async function claimDeviceLicense(
  deps: LicenseUseCaseDeps,
  deviceLabel?: string,
): Promise<ActivateResult> {
  const deviceId = await getOrCreateDeviceId(deps.storage);
  const result = await deps.licenseClient.claim(deviceId, deviceLabel);
  if (!result.ok) return result;
  return persistActivation(deps, deviceId, result);
}

export async function validateStoredLicense(
  deps: LicenseUseCaseDeps,
): Promise<
  | { ok: true; snapshot: LicenseSnapshot }
  | { ok: false; error: LicenseErrorCode; snapshot: LicenseSnapshot | null }
> {
  const licenseStore = store(deps);
  const snapshot = await licenseStore.get();
  if (!snapshot) {
    const claimed = await claimDeviceLicense(deps);
    if (!claimed.ok) {
      return { ok: false, error: claimed.error, snapshot: null };
    }
    const saved = await licenseStore.get();
    if (!saved) {
      return { ok: false, error: 'not_found', snapshot: null };
    }
    return { ok: true, snapshot: saved };
  }

  const result: ValidateResult = await deps.licenseClient.validate(
    snapshot.token,
    snapshot.deviceId,
  );

  if (!result.ok) {
    if (result.error === 'expired' || result.error === 'not_found' || result.error === 'device_mismatch') {
      await licenseStore.clear();
    }
    return { ok: false, error: result.error, snapshot };
  }

  const updated: LicenseSnapshot = {
    ...snapshot,
    expiresAt: result.expiresAt,
    playlistUrl: result.playlistUrl,
    planName: result.planName,
  };
  await licenseStore.save(updated);
  return { ok: true, snapshot: updated };
}

export async function clearLicense(deps: LicenseUseCaseDeps): Promise<void> {
  const licenseStore = store(deps);
  const snapshot = await licenseStore.get();
  if (snapshot) {
    await deps.licenseClient.deactivate(snapshot.token, snapshot.deviceId);
  }
  await licenseStore.clear();
}

export async function getStoredLicense(
  deps: Pick<LicenseUseCaseDeps, 'storage' | 'licenseStore'>,
): Promise<LicenseSnapshot | null> {
  return store(deps as LicenseUseCaseDeps).get();
}

export const LICENSE_ERROR_MESSAGES_TR: Record<LicenseErrorCode, string> = {
  invalid_code: 'Geçersiz aktivasyon kodu',
  expired: 'Lisans süresi dolmuş',
  device_limit: 'Bu kod için cihaz limiti doldu',
  device_mismatch: 'Lisans başka bir cihaza bağlı',
  not_found: 'Lisans bulunamadı',
  network: 'Lisans sunucusuna bağlanılamadı',
  unknown: 'Beklenmeyen bir hata oluştu',
};
