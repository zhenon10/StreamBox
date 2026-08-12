export type AppLocale = 'tr' | 'en';

export const APP_LOCALES: readonly AppLocale[] = ['tr', 'en'] as const;

export const LOCALE_LABELS: Record<AppLocale, string> = {
  tr: 'Türkçe',
  en: 'English',
};
