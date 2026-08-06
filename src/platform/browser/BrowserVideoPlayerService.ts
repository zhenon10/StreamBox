import { HTML5VideoPlayerAdapter } from '../player/WebOSPlayer';
import type { VideoPlayerEvents, VideoPlayerService } from '../interfaces';

/**
 * Browser / Simulator video player.
 * Uses the shared HTML5 IVideoPlayer adapter — no business-logic duplication.
 */
export class BrowserVideoPlayerService implements VideoPlayerService {
  private readonly adapter = new HTML5VideoPlayerAdapter();

  attach(container: HTMLElement): void {
    this.adapter.attach(container);
  }

  detach(): void {
    this.adapter.detach();
  }

  load(url: string, options?: import('../interfaces').VideoLoadOptions): Promise<void> {
    return this.adapter.load(url, options);
  }

  play(): Promise<void> {
    return this.adapter.play();
  }

  pause(): void {
    this.adapter.pause();
  }

  stop(): void {
    this.adapter.stop();
  }

  seek(seconds: number): void {
    this.adapter.seek(seconds);
  }

  setVolume(volume: number): void {
    this.adapter.setVolume(volume);
  }

  getVolume(): number {
    return this.adapter.getVolume();
  }

  setMuted(muted: boolean): void {
    this.adapter.setMuted(muted);
  }

  isMuted(): boolean {
    return this.adapter.isMuted();
  }

  setObjectFit(fit: 'contain' | 'cover' | 'fill'): void {
    this.adapter.setObjectFit(fit);
  }

  getCurrentTime(): number {
    return this.adapter.getCurrentTime();
  }

  getDuration(): number {
    return this.adapter.getDuration();
  }

  destroy(): void {
    this.adapter.destroy();
  }

  setEventHandlers(handlers: VideoPlayerEvents): void {
    this.adapter.setEventHandlers(handlers);
  }
}
