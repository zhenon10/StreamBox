import { App } from '@capacitor/app';
import { BrowserRemoteService } from '../browser/BrowserRemoteService';
import type { RemoteKey, RemoteKeyHandler } from '../interfaces';

/** Android KeyEvent codes that WebView may pass through untranslated. */
const ANDROID_KEY_MAP: Readonly<Record<number, RemoteKey>> = {
  19: 'ArrowUp',
  20: 'ArrowDown',
  21: 'ArrowLeft',
  22: 'ArrowRight',
  23: 'Enter',
  66: 'Enter',
  85: 'MediaPlayPause',
  86: 'Stop',
  126: 'Play',
  127: 'Pause',
};

/**
 * Keyboard / D-pad mapping plus Android hardware Back.
 * The Capacitor listener prevents the default "exit app" behavior.
 */
export class AndroidRemoteService extends BrowserRemoteService {
  override mapKeyCode(keyCode: number): RemoteKey | null {
    return ANDROID_KEY_MAP[keyCode] ?? super.mapKeyCode(keyCode);
  }

  override subscribe(handler: RemoteKeyHandler): () => void {
    const unsubKeyboard = super.subscribe(handler);
    let removed = false;
    let handle: { remove: () => Promise<void> } | null = null;

    void App.addListener('backButton', () => {
      if (!removed) handler({ key: 'Back', repeat: false });
    }).then((listener) => {
      if (removed) {
        void listener.remove();
        return;
      }
      handle = listener;
    });

    return () => {
      removed = true;
      unsubKeyboard();
      void handle?.remove();
    };
  }
}
