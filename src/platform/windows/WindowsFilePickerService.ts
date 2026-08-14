import { BrowserFilePickerService } from '../browser/BrowserNetworkService';
import type { FilePickerResult, FilePickerService } from '../interfaces';
import { invokeTauri, isTauriRuntime } from './tauriBridge';

type NativeM3u = {
  readonly name: string;
  readonly content: string;
};

export class WindowsFilePickerService implements FilePickerService {
  private readonly fallback = new BrowserFilePickerService();

  async pickM3UFile(): Promise<FilePickerResult | null> {
    if (!isTauriRuntime()) {
      return this.fallback.pickM3UFile();
    }
    try {
      const result = await invokeTauri<NativeM3u | null>('pick_m3u_file');
      if (!result) return null;
      return { name: result.name, content: result.content };
    } catch {
      return this.fallback.pickM3UFile();
    }
  }
}
