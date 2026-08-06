import { HTML5Player } from './HTML5Player';
import {
  VideoPlayerType,
  type IVideoPlayer,
  type IVideoPlayerEvents,
  type IVideoPlayerFactory,
} from './IVideoPlayer';
import type { VideoPlayerEvents, VideoPlayerService } from '../interfaces';

/** webOS-optimized player extending HTML5 with platform-specific tuning. */
export class WebOSPlayer extends HTML5Player {
  override readonly playerType: VideoPlayerType = VideoPlayerType.WebOS;

  protected createVideoElement(): HTMLVideoElement {
    const video = super.createVideoElement();
    video.setAttribute('x-webkit-airplay', 'allow');
    return video;
  }
}

export class WebOSVideoPlayerAdapter implements IVideoPlayer {
  readonly playerType = VideoPlayerType.WebOS;
  private readonly delegate: WebOSPlayer;

  constructor() {
    this.delegate = new WebOSPlayer();
  }

  attach(container: HTMLElement): void {
    this.delegate.attach(container);
  }

  detach(): void {
    this.delegate.detach();
  }

  load(url: string, options?: import('./IVideoPlayer').VideoLoadOptions): Promise<void> {
    return this.delegate.load(url, options);
  }

  play(): Promise<void> {
    return this.delegate.play();
  }

  pause(): void {
    this.delegate.pause();
  }

  stop(): void {
    this.delegate.stop();
  }

  seek(seconds: number): void {
    this.delegate.seek(seconds);
  }

  setVolume(volume: number): void {
    this.delegate.setVolume(volume);
  }

  getVolume(): number {
    return this.delegate.getVolume();
  }

  setMuted(muted: boolean): void {
    this.delegate.setMuted(muted);
  }

  isMuted(): boolean {
    return this.delegate.isMuted();
  }

  setObjectFit(fit: 'contain' | 'cover' | 'fill'): void {
    this.delegate.setObjectFit(fit);
  }

  getCurrentTime(): number {
    return this.delegate.getCurrentTime();
  }

  getDuration(): number {
    return this.delegate.getDuration();
  }

  destroy(): void {
    this.delegate.destroy();
  }

  setEventHandlers(handlers: IVideoPlayerEvents): void {
    this.delegate.setEventHandlers(handlers);
  }
}

export class HTML5VideoPlayerAdapter implements IVideoPlayer {
  readonly playerType = VideoPlayerType.HTML5;
  private readonly delegate: HTML5Player;

  constructor() {
    this.delegate = new HTML5Player();
  }

  attach(container: HTMLElement): void {
    this.delegate.attach(container);
  }

  detach(): void {
    this.delegate.detach();
  }

  load(url: string, options?: import('./IVideoPlayer').VideoLoadOptions): Promise<void> {
    return this.delegate.load(url, options);
  }

  play(): Promise<void> {
    return this.delegate.play();
  }

  pause(): void {
    this.delegate.pause();
  }

  stop(): void {
    this.delegate.stop();
  }

  seek(seconds: number): void {
    this.delegate.seek(seconds);
  }

  setVolume(volume: number): void {
    this.delegate.setVolume(volume);
  }

  getVolume(): number {
    return this.delegate.getVolume();
  }

  setMuted(muted: boolean): void {
    this.delegate.setMuted(muted);
  }

  isMuted(): boolean {
    return this.delegate.isMuted();
  }

  setObjectFit(fit: 'contain' | 'cover' | 'fill'): void {
    this.delegate.setObjectFit(fit);
  }

  getCurrentTime(): number {
    return this.delegate.getCurrentTime();
  }

  getDuration(): number {
    return this.delegate.getDuration();
  }

  destroy(): void {
    this.delegate.destroy();
  }

  setEventHandlers(handlers: IVideoPlayerEvents): void {
    this.delegate.setEventHandlers(handlers);
  }
}

export class VideoPlayerFactory implements IVideoPlayerFactory {
  constructor(private readonly platformType: 'webos' | 'browser') {}

  create(): IVideoPlayer {
    return this.platformType === 'webos'
      ? new WebOSVideoPlayerAdapter()
      : new HTML5VideoPlayerAdapter();
  }
}

/** Adapts IVideoPlayer to legacy VideoPlayerService interface for backward compatibility. */
export class VideoPlayerServiceAdapter implements VideoPlayerService {
  constructor(private readonly player: IVideoPlayer) {}

  attach(container: HTMLElement): void {
    this.player.attach(container);
  }

  detach(): void {
    this.player.detach();
  }

  load(url: string, options?: import('./IVideoPlayer').VideoLoadOptions): Promise<void> {
    return this.player.load(url, options);
  }

  play(): Promise<void> {
    return this.player.play();
  }

  pause(): void {
    this.player.pause();
  }

  stop(): void {
    this.player.stop();
  }

  seek(seconds: number): void {
    this.player.seek(seconds);
  }

  setVolume(volume: number): void {
    this.player.setVolume(volume);
  }

  getVolume(): number {
    return this.player.getVolume();
  }

  setMuted(muted: boolean): void {
    this.player.setMuted(muted);
  }

  isMuted(): boolean {
    return this.player.isMuted();
  }

  setObjectFit(fit: 'contain' | 'cover' | 'fill'): void {
    this.player.setObjectFit(fit);
  }

  getCurrentTime(): number {
    return this.player.getCurrentTime();
  }

  getDuration(): number {
    return this.player.getDuration();
  }

  destroy(): void {
    this.player.destroy();
  }

  setEventHandlers(handlers: VideoPlayerEvents): void {
    this.player.setEventHandlers(handlers);
  }
}
