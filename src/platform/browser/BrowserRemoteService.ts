import type { RemoteKey, RemoteService } from '../interfaces';
import { isTextEntryTypingKey, isTypingInField } from '../textEntry';

/**
 * Browser remote mapping — keyboard simulates LG Magic Remote.
 * Arrow keys, Enter, Escape → TV remote keys.
 * Backspace (8) is never Back: it must delete in search/URL fields.
 */
const BROWSER_KEY_MAP: Readonly<Record<number, RemoteKey>> = {
  38: 'ArrowUp',
  40: 'ArrowDown',
  37: 'ArrowLeft',
  39: 'ArrowRight',
  13: 'Enter',
  27: 'Back',
  32: 'MediaPlayPause',
  179: 'MediaPlayPause',
  415: 'Play',
  19: 'Pause',
  413: 'Stop',
};

export class BrowserRemoteService implements RemoteService {
  subscribe(handler: import('../interfaces').RemoteKeyHandler): () => void {
    const listener = (event: KeyboardEvent): void => {
      const key = this.mapKeyCode(event.keyCode);
      if (!key) return;

      // Space / arrows / Enter must reach INPUT/TEXTAREA (search, URL, license).
      if (isTypingInField(event) && isTextEntryTypingKey(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handler({ key, repeat: event.repeat });
    };

    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }

  mapKeyCode(keyCode: number): RemoteKey | null {
    return BROWSER_KEY_MAP[keyCode] ?? null;
  }
}
