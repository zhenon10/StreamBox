import { create } from 'zustand';
import type {
  AppSettings,
  Channel,
  ChannelId,
  HistoryEntry,
  PlaybackError,
  PlaybackState,
  Playlist,
  PlaylistId,
  PlaylistSource,
  RecentPlaylistEntry,
  Category,
} from '@/domain/entities';
import { DEFAULT_SETTINGS } from '@/domain/entities';
import type { ContentSection } from '@/domain/content/contentSection';
import { channelSession } from '@/application/channels/ChannelSessionStore';

/** Playlist metadata kept in React state — channels live in channelSession. */
export interface PlaylistMeta {
  readonly id: PlaylistId;
  readonly name: string;
  readonly source: PlaylistSource;
  readonly categories: readonly Category[];
  readonly loadedAt: number;
  readonly channelCount: number;
}

interface PlaylistStore {
  readonly currentPlaylist: PlaylistMeta | null;
  readonly isLoading: boolean;
  readonly loadProgress: number;
  readonly loadError: string | null;
  readonly recentPlaylists: readonly RecentPlaylistEntry[];
  readonly favorites: readonly ChannelId[];
  readonly history: readonly HistoryEntry[];
  readonly settings: AppSettings;
  readonly activeCategory: string | null;
  readonly searchQuery: string;
  readonly contentSection: ContentSection;

  setCurrentPlaylist: (playlist: Playlist | PlaylistMeta | null) => void;
  setLoading: (loading: boolean) => void;
  setLoadProgress: (progress: number) => void;
  setLoadError: (error: string | null) => void;
  setRecentPlaylists: (entries: readonly RecentPlaylistEntry[]) => void;
  setFavorites: (ids: readonly ChannelId[]) => void;
  setHistory: (entries: readonly HistoryEntry[]) => void;
  setSettings: (settings: AppSettings) => void;
  setActiveCategory: (category: string | null) => void;
  setSearchQuery: (query: string) => void;
  setContentSection: (section: ContentSection) => void;
  /** @deprecated no-op kept for call-site compatibility */
  setFilteredChannels: (_channels: readonly Channel[]) => void;
}

const MAX_CATEGORIES_IN_STATE = 200;

function toMeta(playlist: Playlist | PlaylistMeta): PlaylistMeta {
  if ('channelCount' in playlist && !('channels' in playlist)) {
    return playlist;
  }

  const full = playlist as Playlist;
  return {
    id: full.id,
    name: full.name,
    source: full.source,
    categories: full.categories.slice(0, MAX_CATEGORIES_IN_STATE),
    loadedAt: full.loadedAt,
    channelCount: full.channels.length,
  };
}

export const usePlaylistStore = create<PlaylistStore>((set) => ({
  currentPlaylist: null,
  isLoading: false,
  loadProgress: 0,
  loadError: null,
  recentPlaylists: [],
  favorites: [],
  history: [],
  settings: DEFAULT_SETTINGS,
  activeCategory: null,
  searchQuery: '',
  contentSection: 'live',

  setCurrentPlaylist: (playlist) => {
    if (!playlist) {
      channelSession.clear();
      set({
        currentPlaylist: null,
        activeCategory: null,
        searchQuery: '',
        contentSection: 'live',
      });
      return;
    }

    if ('channels' in playlist && Array.isArray(playlist.channels)) {
      channelSession.adopt(playlist.id, playlist.channels);
    }

    set({
      currentPlaylist: toMeta(playlist),
      activeCategory: null,
      searchQuery: '',
      contentSection: 'live',
    });
  },
  setLoading: (isLoading) => set({ isLoading }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
  setLoadError: (loadError) => set({ loadError }),
  setRecentPlaylists: (recentPlaylists) => set({ recentPlaylists }),
  setFavorites: (favorites) => set({ favorites }),
  setHistory: (history) => set({ history }),
  setSettings: (settings) => set({ settings }),
  setActiveCategory: (activeCategory) => set({ activeCategory }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setContentSection: (contentSection) =>
    set({ contentSection, activeCategory: null, searchQuery: '' }),
  setFilteredChannels: () => {
    // Intentionally empty — filtered views use ChannelSessionStore indices.
  },
}));

interface PlayerStore {
  readonly activeChannel: Channel | null;
  readonly playbackState: PlaybackState;
  readonly currentTime: number;
  readonly duration: number;
  readonly playbackError: PlaybackError | null;
  readonly showOverlay: boolean;

  setActiveChannel: (channel: Channel | null) => void;
  setPlaybackState: (state: PlaybackState) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackError: (error: PlaybackError | null) => void;
  setShowOverlay: (show: boolean) => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  activeChannel: null,
  playbackState: 'idle',
  currentTime: 0,
  duration: 0,
  playbackError: null,
  showOverlay: true,

  setActiveChannel: (activeChannel) => set({ activeChannel }),
  setPlaybackState: (playbackState) => set({ playbackState }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setPlaybackError: (playbackError) => set({ playbackError }),
  setShowOverlay: (showOverlay) => set({ showOverlay }),
}));

export function selectChannelById(channelId: ChannelId): Channel | null {
  return channelSession.getById(channelId);
}

export function selectIsFavorite(favorites: readonly ChannelId[], channelId: ChannelId): boolean {
  return favorites.includes(channelId);
}
