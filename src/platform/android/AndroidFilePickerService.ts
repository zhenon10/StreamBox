import { BrowserFilePickerService } from '../browser/BrowserNetworkService';
import type { FilePickerResult, FilePickerService } from '../interfaces';

/** Phone file pick — HTML input works in Capacitor WebView (scoped storage). */
export class AndroidFilePickerService implements FilePickerService {
  private readonly picker = new BrowserFilePickerService();

  pickM3UFile(): Promise<FilePickerResult | null> {
    return this.picker.pickM3UFile();
  }
}
