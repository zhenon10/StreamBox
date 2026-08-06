import type { RemoteKey, RemoteService } from '../interfaces';

const WEBOS_KEY_MAP: Readonly<Record<number, RemoteKey>> = {
  38: 'ArrowUp',
  40: 'ArrowDown',
  37: 'ArrowLeft',
  39: 'ArrowRight',
  13: 'Enter',
  461: 'Back',
  10009: 'Back',
  415: 'Play',
  19: 'Pause',
  413: 'Stop',
  463: 'MediaPlayPause',
};

export class WebOSRemoteService implements RemoteService {
  subscribe(handler: import('../interfaces').RemoteKeyHandler): () => void {
    const listener = (event: KeyboardEvent): void => {
      const key = this.mapKeyCode(event.keyCode);
      if (!key) return;

      event.preventDefault();
      event.stopPropagation();

      handler({ key, repeat: event.repeat });
    };

    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }

  mapKeyCode(keyCode: number): RemoteKey | null {
    return WEBOS_KEY_MAP[keyCode] ?? null;
  }
}
