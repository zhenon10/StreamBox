import type { RemoteKey, RemoteService } from '../interfaces';

/**
 * Browser remote mapping — keyboard simulates LG Magic Remote.
 * Arrow keys, Enter, Escape/Backspace → TV remote keys.
 */
const BROWSER_KEY_MAP: Readonly<Record<number, RemoteKey>> = {
  38: 'ArrowUp',
  40: 'ArrowDown',
  37: 'ArrowLeft',
  39: 'ArrowRight',
  13: 'Enter',
  8: 'Back',
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

      // Allow typing in inputs / search fields.
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Enter') {
          return;
        }
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
