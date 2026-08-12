import { useCallback } from 'react';
import { usePlaylistStore } from '@/application/stores/playlistStore';
import { translate, type AppLocale, type MessageKey } from '@/i18n';

export function useLocale(): AppLocale {
  return usePlaylistStore((s) => s.settings.locale ?? 'tr');
}

export function useT(): (key: MessageKey) => string {
  const locale = useLocale();
  return useCallback((key: MessageKey) => translate(locale, key), [locale]);
}
