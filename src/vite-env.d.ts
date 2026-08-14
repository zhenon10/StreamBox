/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM?: 'browser' | 'webos' | 'windows' | 'android' | string;
  readonly VITE_APP_TARGET?: 'simulator' | 'tv' | 'desktop' | 'mobile' | string;
  readonly VITE_LICENSE_API_URL?: string;
  readonly VITE_STORE_BUILD?: string;
  readonly VITE_PLAY_STORE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __IVPLAYER_SIMULATOR__: boolean;
