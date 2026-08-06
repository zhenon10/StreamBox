import type {
  FilePickerResult,
  FilePickerService,
  NetworkRequestOptions,
  NetworkResponse,
  NetworkService,
} from '../interfaces';

/** Browser network service — fetch with timeout (CORS proxy applied at DownloadService layer). */
export class BrowserNetworkService implements NetworkService {
  async fetch(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse> {
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: options?.method ?? 'GET',
        ...(options?.headers ? { headers: options.headers } : {}),
        ...(options?.body !== undefined ? { body: options.body } : {}),
        signal: controller.signal,
      });

      const body = await response.text();
      return { ok: response.ok, status: response.status, body };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export class BrowserFilePickerService implements FilePickerService {
  async pickM3UFile(): Promise<FilePickerResult | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.m3u,.m3u8,text/plain';
      input.style.display = 'none';

      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const content = await file.text();
        resolve({ name: file.name, content });
        input.remove();
      });

      input.addEventListener('cancel', () => {
        resolve(null);
        input.remove();
      });

      document.body.appendChild(input);
      input.click();
    });
  }
}
