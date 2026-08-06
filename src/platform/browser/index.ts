import type { PlatformContext } from '../interfaces';
import { BrowserPlatformService } from './BrowserPlatformService';
import { BrowserRemoteService } from './BrowserRemoteService';
import { BrowserStorageService } from './BrowserStorageService';
import { BrowserNetworkService, BrowserFilePickerService } from './BrowserNetworkService';
import { BrowserVideoPlayerService } from './BrowserVideoPlayerService';

/**
 * Browser / TV Simulator platform composition.
 * Implements the same PlatformContext interfaces as webOS —
 * business logic never branches on concrete classes.
 */
export function createBrowserPlatform(): PlatformContext {
  return {
    platform: new BrowserPlatformService(),
    storage: new BrowserStorageService(),
    network: new BrowserNetworkService(),
    filePicker: new BrowserFilePickerService(),
    remote: new BrowserRemoteService(),
    videoPlayer: new BrowserVideoPlayerService(),
  };
}

export { BrowserPlatformService } from './BrowserPlatformService';
export { BrowserRemoteService } from './BrowserRemoteService';
export { BrowserStorageService } from './BrowserStorageService';
export { BrowserNetworkService, BrowserFilePickerService } from './BrowserNetworkService';
export { BrowserVideoPlayerService } from './BrowserVideoPlayerService';
