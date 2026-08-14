import type { PlatformContext } from '../interfaces';
import { BrowserNetworkService } from '../browser/BrowserNetworkService';
import { BrowserRemoteService } from '../browser/BrowserRemoteService';
import { BrowserStorageService } from '../browser/BrowserStorageService';
import { BrowserVideoPlayerService } from '../browser/BrowserVideoPlayerService';
import { WindowsFilePickerService } from './WindowsFilePickerService';
import { WindowsPlatformService } from './WindowsPlatformService';

export function createWindowsPlatform(): PlatformContext {
  return {
    platform: new WindowsPlatformService(),
    storage: new BrowserStorageService(),
    network: new BrowserNetworkService(),
    filePicker: new WindowsFilePickerService(),
    remote: new BrowserRemoteService(),
    videoPlayer: new BrowserVideoPlayerService(),
  };
}

export { WindowsPlatformService } from './WindowsPlatformService';
export { WindowsFilePickerService } from './WindowsFilePickerService';
