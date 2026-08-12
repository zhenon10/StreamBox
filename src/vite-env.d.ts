/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM?: 'browser' | 'webos' | string;
  readonly VITE_APP_TARGET?: 'simulator' | 'tv' | string;
  readonly VITE_LICENSE_API_URL?: string;
  readonly VITE_STORE_BUILD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __IVPLAYER_SIMULATOR__: boolean;
