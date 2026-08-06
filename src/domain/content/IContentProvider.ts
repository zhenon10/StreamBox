import type { Channel, Playlist, PlaylistId, PlaylistSourceType } from '../entities';

/** Unique identifier for a content provider implementation. */
export type ContentProviderId = string & { readonly __brand: 'ContentProviderId' };

export function createContentProviderId(value: string): ContentProviderId {
  return value as ContentProviderId;
}

export interface ContentLoadProgress {
  readonly loaded: number;
  readonly total: number | null;
}

export interface ContentLoadRequest {
  readonly sourceType: PlaylistSourceType | ContentSourceType;
  readonly location: string;
  readonly label?: string;
}

/** Extended source types for future providers beyond M3U file/url. */
export const ContentSourceType = {
  M3UFile: 'm3u-file',
  M3UUrl: 'm3u-url',
  Xtream: 'xtream',
  XMLTV: 'xmltv',
  DLNA: 'dlna',
  SMB: 'smb',
  WebDAV: 'webdav',
  Plex: 'plex',
  Jellyfin: 'jellyfin',
} as const;

export type ContentSourceType = (typeof ContentSourceType)[keyof typeof ContentSourceType];

export interface ContentLoadResult {
  readonly name: string;
  readonly channels: readonly Channel[];
  readonly categories: readonly import('../entities').Category[];
  readonly source: import('../entities').PlaylistSource;
}

/**
 * Contract every content source must implement.
 * The application layer interacts only through this interface.
 */
export interface IContentProvider {
  readonly id: ContentProviderId;
  readonly displayName: string;
  readonly supportedSourceTypes: readonly ContentSourceType[];
  canHandle(sourceType: ContentSourceType): boolean;
  load(
    request: ContentLoadRequest,
    onProgress?: (progress: ContentLoadProgress) => void,
  ): Promise<ContentLoadResult>;
}

export interface IContentProviderRegistry {
  register(provider: IContentProvider): void;
  getProviderFor(sourceType: ContentSourceType): IContentProvider | null;
  getProviderById(id: ContentProviderId): IContentProvider | null;
  getAll(): readonly IContentProvider[];
}

/** Architecture contracts for future provider implementations. */
export interface IFutureContentProvider extends IContentProvider {
  readonly isAvailable: boolean;
}

export type FutureProviderKind =
  | 'xmltv'
  | 'xtream'
  | 'dlna'
  | 'smb'
  | 'webdav'
  | 'plex'
  | 'jellyfin';

export interface FutureProviderDescriptor {
  readonly kind: FutureProviderKind;
  readonly displayName: string;
  readonly requiredCapabilities: readonly string[];
}

export const FUTURE_PROVIDER_DESCRIPTORS: readonly FutureProviderDescriptor[] = [
  {
    kind: 'xmltv',
    displayName: 'XMLTV EPG',
    requiredCapabilities: ['network', 'cache', 'parser'],
  },
  {
    kind: 'xtream',
    displayName: 'Xtream Codes',
    requiredCapabilities: ['network', 'auth', 'cache'],
  },
  {
    kind: 'dlna',
    displayName: 'DLNA/UPnP',
    requiredCapabilities: ['network-discovery', 'platform-native'],
  },
  {
    kind: 'smb',
    displayName: 'SMB/CIFS',
    requiredCapabilities: ['network', 'platform-native', 'download'],
  },
  {
    kind: 'webdav',
    displayName: 'WebDAV',
    requiredCapabilities: ['network', 'auth', 'download'],
  },
  {
    kind: 'plex',
    displayName: 'Plex',
    requiredCapabilities: ['network', 'auth', 'oauth'],
  },
  {
    kind: 'jellyfin',
    displayName: 'Jellyfin',
    requiredCapabilities: ['network', 'auth', 'oauth'],
  },
];

export interface IPlaylistRepositoryContract {
  save(playlist: Playlist): Promise<void>;
  getById(id: PlaylistId): Promise<Playlist | null>;
}
