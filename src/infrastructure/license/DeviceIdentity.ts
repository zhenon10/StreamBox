import type { StorageService } from '@/platform/interfaces';

const DEVICE_ID_KEY = 'device.identity.id';

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Try webOS Luna deviceuniqueid; fall back to persisted UUID.
 */
async function tryWebOsDeviceId(timeoutMs = 1500): Promise<string | null> {
  const webOSDev = (
    window as Window & {
      webOS?: {
        service?: {
          request?: (
            uri: string,
            opts: {
              method: string;
              parameters?: Record<string, unknown>;
              onSuccess?: (res: { returnValue?: boolean; idList?: Array<{ idValue?: string }> }) => void;
              onFailure?: () => void;
            },
          ) => void;
        };
      };
    }
  ).webOS;

  if (!webOSDev?.service?.request) return null;

  return new Promise((resolve) => {
    let settled = false;
    const done = (value: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), timeoutMs);

    try {
      webOSDev.service!.request!('luna://com.webos.service.sm', {
        method: 'deviceid/getIDs',
        parameters: { idType: ['LGUDID'] },
        onSuccess: (res) => {
          window.clearTimeout(timer);
          const id = res.idList?.[0]?.idValue?.trim();
          done(id || null);
        },
        onFailure: () => {
          window.clearTimeout(timer);
          done(null);
        },
      });
    } catch {
      window.clearTimeout(timer);
      done(null);
    }
  });
}

export async function getOrCreateDeviceId(storage: StorageService): Promise<string> {
  const existing = await storage.getItem(DEVICE_ID_KEY);
  if (existing?.trim()) return existing.trim();

  const webOsId = await tryWebOsDeviceId();
  const id = webOsId || `sb_${createUuid()}`;
  await storage.setItem(DEVICE_ID_KEY, id);
  return id;
}

/** Short form for support / UI (last 8 chars). */
export function shortDeviceId(deviceId: string): string {
  const clean = deviceId.replace(/[^a-zA-Z0-9]/g, '');
  if (clean.length <= 8) return clean.toUpperCase();
  return clean.slice(-8).toUpperCase();
}
