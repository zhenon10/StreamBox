export type LicenseErrorCode =
  | 'invalid_code'
  | 'expired'
  | 'device_limit'
  | 'device_mismatch'
  | 'not_found'
  | 'network'
  | 'unknown';

export interface LicenseSuccess {
  readonly ok: true;
  readonly token: string;
  readonly expiresAt: number;
  readonly playlistUrl: string;
  readonly planName: string;
}

export interface LicenseValidateSuccess {
  readonly ok: true;
  readonly expiresAt: number;
  readonly playlistUrl: string;
  readonly planName: string;
}

export interface LicenseFailure {
  readonly ok: false;
  readonly error: LicenseErrorCode;
}

export type ActivateResult = LicenseSuccess | LicenseFailure;
export type ValidateResult = LicenseValidateSuccess | LicenseFailure;
export type DeactivateResult = { readonly ok: true } | LicenseFailure;

/** Persisted on device after successful activate / validate. */
export interface LicenseSnapshot {
  readonly token: string;
  readonly deviceId: string;
  readonly expiresAt: number;
  readonly playlistUrl: string;
  readonly planName: string;
  readonly activatedAt: number;
}
