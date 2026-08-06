import type { PlatformContext } from '../interfaces';
import { WebOSPlatformService } from './WebOSPlatformService';
import { WebOSRemoteService } from './WebOSRemoteService';
import { WebOSStorageService } from './WebOSStorageService';
import { WebOSNetworkService, WebOSFilePickerService } from './WebOSNetworkService';
import { WebOSVideoPlayerService } from './WebOSVideoPlayerService';

export function createWebOSPlatform(): PlatformContext {
  return {
    platform: new WebOSPlatformService(),
    storage: new WebOSStorageService(),
    network: new WebOSNetworkService(),
    filePicker: new WebOSFilePickerService(),
    remote: new WebOSRemoteService(),
    videoPlayer: new WebOSVideoPlayerService(),
  };
}

export { WebOSPlatformService } from './WebOSPlatformService';
export { WebOSRemoteService } from './WebOSRemoteService';
export { WebOSStorageService } from './WebOSStorageService';
export { WebOSNetworkService, WebOSFilePickerService } from './WebOSNetworkService';
export { WebOSVideoPlayerService } from './WebOSVideoPlayerService';
