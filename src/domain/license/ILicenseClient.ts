import type {
  ActivateResult,
  DeactivateResult,
  ValidateResult,
} from './types';

export interface ILicenseClient {
  activate(
    code: string,
    deviceId: string,
    deviceLabel?: string,
  ): Promise<ActivateResult>;
  claim(deviceId: string, deviceLabel?: string): Promise<ActivateResult>;
  validate(token: string, deviceId: string): Promise<ValidateResult>;
  deactivate(token: string, deviceId: string): Promise<DeactivateResult>;
}
