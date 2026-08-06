import { mapFetchError, resolveFetchUrl } from '@/infrastructure/network/fetchUrl';

export interface DownloadProgress {
  readonly bytesReceived: number;
  readonly totalBytes: number | null;
  readonly percent: number | null;
}

export interface DownloadOptions {
  readonly timeoutMs?: number;
  readonly retryAttempts?: number;
  readonly retryDelayMs?: number;
  readonly headers?: Record<string, string>;
  readonly onProgress?: (progress: DownloadProgress) => void;
}

export interface DownloadResult {
  readonly data: ArrayBuffer;
  readonly contentType: string | null;
  readonly status: number;
}

export interface IDownloadService {
  download(url: string, options?: DownloadOptions): Promise<DownloadResult>;
  downloadText(url: string, options?: DownloadOptions): Promise<string>;
  cancel(requestId: string): boolean;
  cancelAll(): void;
  getActiveCount(): number;
}

interface ActiveDownload {
  readonly controller: AbortController;
  readonly url: string;
}

/** Reusable HTTP download manager with retry, cancellation, and streaming. */
export class DownloadService implements IDownloadService {
  private readonly active = new Map<string, ActiveDownload>();
  private requestCounter = 0;

  async download(url: string, options?: DownloadOptions): Promise<DownloadResult> {
    const requestId = this.createRequestId();
    const controller = new AbortController();
    this.active.set(requestId, { controller, url });

    const maxAttempts = options?.retryAttempts ?? 3;
    const retryDelay = options?.retryDelayMs ?? 1000;
    let lastError: Error | null = null;
    const fetchUrl = resolveFetchUrl(url);

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (controller.signal.aborted) {
          throw new Error('Download cancelled');
        }

        try {
          return await this.executeDownload(fetchUrl, controller, options);
        } catch (error) {
          lastError = mapFetchError(error, url);
          if (controller.signal.aborted) throw lastError;
          if (attempt < maxAttempts - 1) {
            await this.delay(retryDelay * (attempt + 1));
          }
        }
      }

      throw lastError ?? new Error('Download failed');
    } finally {
      this.active.delete(requestId);
    }
  }

  async downloadText(url: string, options?: DownloadOptions): Promise<string> {
    const result = await this.download(url, options);
    const decoder = new TextDecoder();
    return decoder.decode(result.data);
  }

  cancel(requestId: string): boolean {
    const active = this.active.get(requestId);
    if (!active) return false;
    active.controller.abort();
    this.active.delete(requestId);
    return true;
  }

  cancelAll(): void {
    for (const [id, active] of this.active) {
      active.controller.abort();
      this.active.delete(id);
    }
  }

  getActiveCount(): number {
    return this.active.size;
  }

  private async executeDownload(
    url: string,
    controller: AbortController,
    options?: DownloadOptions,
  ): Promise<DownloadResult> {
    const timeoutMs = options?.timeoutMs ?? 60_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        ...(options?.headers ? { headers: options.headers } : {}),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${String(response.status)}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : null;

      if (!response.body) {
        const data = await response.arrayBuffer();
        options?.onProgress?.({
          bytesReceived: data.byteLength,
          totalBytes,
          percent: 100,
        });
        return { data, contentType, status: response.status };
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytesReceived = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          bytesReceived += value.byteLength;
          options?.onProgress?.({
            bytesReceived,
            totalBytes,
            percent: totalBytes ? (bytesReceived / totalBytes) * 100 : null,
          });
        }
      }

      const data = this.concatChunks(chunks, bytesReceived);
      return { data, contentType, status: response.status };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private concatChunks(chunks: Uint8Array[], totalLength: number): ArrayBuffer {
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result.buffer;
  }

  private createRequestId(): string {
    this.requestCounter++;
    return `dl_${String(this.requestCounter)}_${String(Date.now())}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
