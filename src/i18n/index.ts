import type { AppLocale } from './locale';
import type { MessageKey, Messages } from './types';
import { en } from './messages/en';
import { tr } from './messages/tr';

const catalogs: Record<AppLocale, Messages> = { tr, en };

export function translate(locale: AppLocale, key: MessageKey): string {
  return catalogs[locale][key] ?? catalogs.en[key] ?? key;
}

export function licenseErrorKey(
  code: string,
): Extract<
  MessageKey,
  | 'license.invalid_code'
  | 'license.expired'
  | 'license.device_limit'
  | 'license.device_mismatch'
  | 'license.not_found'
  | 'license.network'
  | 'license.unknown'
> {
  switch (code) {
    case 'invalid_code':
      return 'license.invalid_code';
    case 'expired':
      return 'license.expired';
    case 'device_limit':
      return 'license.device_limit';
    case 'device_mismatch':
      return 'license.device_mismatch';
    case 'not_found':
      return 'license.not_found';
    case 'network':
      return 'license.network';
    default:
      return 'license.unknown';
  }
}

export type { MessageKey, Messages };
export type { AppLocale } from './locale';
export { APP_LOCALES, LOCALE_LABELS } from './locale';
