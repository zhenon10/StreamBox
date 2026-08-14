import type { PlatformContext } from '../interfaces';
import { BrowserNetworkService } from '../browser/BrowserNetworkService';
import { BrowserVideoPlayerService } from '../browser/BrowserVideoPlayerService';
import { AndroidFilePickerService } from './AndroidFilePickerService';
import { AndroidPlatformService } from './AndroidPlatformService';
import { AndroidRemoteService } from './AndroidRemoteService';
import { AndroidStorageService } from './AndroidStorageService';

export function createAndroidPlatform(): PlatformContext {
  return {
    platform: new AndroidPlatformService(),
    storage: new AndroidStorageService(),
    network: new BrowserNetworkService(),
    filePicker: new AndroidFilePickerService(),
    remote: new AndroidRemoteService(),
    videoPlayer: new BrowserVideoPlayerService(),
  };
}

export { AndroidPlatformService } from './AndroidPlatformService';
export { AndroidRemoteService } from './AndroidRemoteService';
export { AndroidFilePickerService } from './AndroidFilePickerService';
