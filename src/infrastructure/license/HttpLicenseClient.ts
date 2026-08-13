import type { NetworkService } from '@/platform/interfaces';
import type { ILicenseClient } from '@/domain/license/ILicenseClient';
import type {
  ActivateResult,
  DeactivateResult,
  LicenseErrorCode,
  ValidateResult,
} from '@/domain/license/types';

const KNOWN_ERRORS = new Set<LicenseErrorCode>([
  'invalid_code',
  'expired',
  'device_limit',
  'device_mismatch',
  'not_found',
  'network',
  'unknown',
]);

function parseError(raw: unknown): LicenseErrorCode {
  if (typeof raw === 'string' && KNOWN_ERRORS.has(raw as LicenseErrorCode)) {
    return raw as LicenseErrorCode;
  }
  return 'unknown';
}

export function getLicenseApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_LICENSE_API_URL as string | undefined;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim().replace(/\/$/, '');
  return 'http://127.0.0.1:8787';
}

export class HttpLicenseClient implements ILicenseClient {
  constructor(
    private readonly network: NetworkService,
    private readonly baseUrl: string = getLicenseApiBaseUrl(),
  ) {}

  async activate(
    code: string,
    deviceId: string,
    deviceLabel?: string,
  ): Promise<ActivateResult> {
    return this.postActivate('/v1/activate', {
      code,
      deviceId,
      ...(deviceLabel ? { deviceLabel } : {}),
    });
  }

  async claim(deviceId: string, deviceLabel?: string): Promise<ActivateResult> {
    return this.postActivate('/v1/claim', {
      deviceId,
      ...(deviceLabel ? { deviceLabel } : {}),
    });
  }

  async validate(token: string, deviceId: string): Promise<ValidateResult> {
    try {
      const response = await this.network.fetch(`${this.baseUrl}/v1/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, deviceId }),
        timeoutMs: 15_000,
      });
      const data = this.parseJson(response.body);
      if (!response.ok || !data || data.ok !== true) {
        return { ok: false, error: parseError(data?.error) };
      }
      return {
        ok: true,
        expiresAt: Number(data.expiresAt),
        playlistUrl: String(data.playlistUrl ?? ''),
        planName: String(data.planName ?? ''),
      };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  async deactivate(token: string, deviceId: string): Promise<DeactivateResult> {
    try {
      const response = await this.network.fetch(`${this.baseUrl}/v1/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, deviceId }),
        timeoutMs: 15_000,
      });
      const data = this.parseJson(response.body);
      if (!response.ok || !data || data.ok !== true) {
        return { ok: false, error: parseError(data?.error) };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  private async postActivate(
    path: string,
    body: Record<string, string>,
  ): Promise<ActivateResult> {
    try {
      const response = await this.network.fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        timeoutMs: 15_000,
      });
      const data = this.parseJson(response.body);
      if (!response.ok || !data || data.ok !== true) {
        return { ok: false, error: parseError(data?.error) };
      }
      return {
        ok: true,
        token: String(data.token ?? ''),
        expiresAt: Number(data.expiresAt),
        playlistUrl: String(data.playlistUrl ?? ''),
        planName: String(data.planName ?? ''),
      };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  private parseJson(raw: string): Record<string, unknown> | null {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
