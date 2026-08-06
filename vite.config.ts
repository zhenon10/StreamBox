import { defineConfig, type ConfigEnv, type Plugin, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const PLAYLIST_PROXY_PATH = '/api/playlist-proxy';
const STREAM_PROXY_PATH = '/api/stream-proxy';

/** Dev server middleware — fetches remote M3U URLs server-side to bypass browser CORS. */
function playlistProxyPlugin(): Plugin {
  return {
    name: 'streambox-playlist-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(PLAYLIST_PROXY_PATH)) {
          next();
          return;
        }

        const requestUrl = new URL(req.url, 'http://localhost');
        const target = requestUrl.searchParams.get('url');

        if (!target) {
          res.statusCode = 400;
          res.end('Missing url parameter');
          return;
        }

        try {
          const parsed = new URL(target);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            res.statusCode = 400;
            res.end('Only http and https URLs are supported');
            return;
          }

          const response = await fetch(target, {
            headers: { 'User-Agent': 'StreamBoxTV/1.0' },
            signal: AbortSignal.timeout(120_000),
          });

          const body = await response.text();
          res.statusCode = response.status;
          res.setHeader('Content-Type', response.headers.get('content-type') ?? 'text/plain');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(body);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'text/plain');
          res.end(error instanceof Error ? error.message : 'Proxy fetch failed');
        }
      });
    },
  };
}

/**
 * Dev stream proxy — pipes remote media with CORS so hls.js / mpegts.js (MSE) can play IPTV.
 * Supports Range requests for VOD seeking.
 */
function streamProxyPlugin(): Plugin {
  return {
    name: 'streambox-stream-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(STREAM_PROXY_PATH)) {
          next();
          return;
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
          res.end();
          return;
        }

        const requestUrl = new URL(req.url, 'http://localhost');
        const target = requestUrl.searchParams.get('url');

        if (!target) {
          res.statusCode = 400;
          res.end('Missing url parameter');
          return;
        }

        try {
          const parsed = new URL(target);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            res.statusCode = 400;
            res.end('Only http and https URLs are supported');
            return;
          }

          const headers: Record<string, string> = {
            // Many IPTV panels whitelist VLC / common players only.
            'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
            Accept: '*/*',
            Connection: 'keep-alive',
          };
          const range = req.headers.range;
          if (range) headers.Range = range;

          // No short timeout — live MPEG-TS is an endless stream.
          const response = await fetch(target, { headers });

          res.statusCode = response.status;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
          res.setHeader('Cache-Control', 'no-store');

          const contentType =
            response.headers.get('content-type') ??
            (target.includes('.m3u8')
              ? 'application/vnd.apple.mpegurl'
              : 'video/mp2t');
          res.setHeader('Content-Type', contentType);

          // Do not forward Content-Length for live/chunked streams — MSE can hang waiting for EOF.
          const contentLength = response.headers.get('content-length');
          const isLikelyLive =
            /\/live\//i.test(target) ||
            response.headers.get('transfer-encoding') === 'chunked' ||
            !contentLength;
          if (contentLength && !isLikelyLive) {
            res.setHeader('Content-Length', contentLength);
          }
          const contentRange = response.headers.get('content-range');
          if (contentRange) res.setHeader('Content-Range', contentRange);
          const acceptRanges = response.headers.get('accept-ranges');
          if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

          if (!response.body) {
            res.end();
            return;
          }

          const reader = response.body.getReader();
          const pump = async (): Promise<void> => {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!res.write(Buffer.from(value))) {
                await new Promise<void>((resolve) => res.once('drain', resolve));
              }
            }
            res.end();
          };

          req.on('close', () => {
            void reader.cancel();
          });

          await pump();
        } catch (error) {
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'text/plain');
            res.end(error instanceof Error ? error.message : 'Stream proxy failed');
          } else {
            res.end();
          }
        }
      });
    },
  };
}

function isSimulatorMode(mode: string, command: ConfigEnv['command']): boolean {
  return mode === 'simulator' || (command === 'serve' && mode !== 'production');
}

export default defineConfig(({ mode, command }: ConfigEnv): UserConfig => {
  const simulator = isSimulatorMode(mode, command);
  const tvBuild = !simulator;

  return {
    plugins: [
      react({
        // Fast Refresh enabled by default via @vitejs/plugin-react
      }),
      tailwindcss(),
      playlistProxyPlugin(),
      streamProxyPlugin(),
      // webOS loads apps from file:// — ES modules + crossorigin fail (CORS / Failed to fetch).
      tvBuild
        ? {
            name: 'webos-classic-scripts',
            transformIndexHtml(html: string) {
              return html
                .replace(/\s+crossorigin(?:="[^"]*")?/gi, '')
                .replace(
                  /<script type="module"([^>]*src="[^"]+"[^>]*)><\/script>/gi,
                  '<script defer$1></script>',
                )
                .replace(/<link rel="modulepreload"[^>]*>/gi, '');
            },
          }
        : null,
    ].filter(Boolean),
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(rootDir, './src'),
      },
    },
    define: {
      __STREAMBOX_SIMULATOR__: JSON.stringify(simulator),
    },
    build: {
      // webOS TV 6.0 = Chromium 79 (no native ?. / ??). Simulator can stay modern.
      target: simulator ? 'es2022' : 'chrome79',
      // Critical: Tailwind v4 emits @layer — unsupported before Chrome 99 → unstyled TV UI.
      cssTarget: simulator ? undefined : 'chrome79',
      outDir: simulator ? 'dist-simulator' : 'dist',
      // Source maps for simulator; production TV builds stay lean.
      sourcemap: simulator,
      cssCodeSplit: !tvBuild,
      modulePreload: tvBuild ? false : undefined,
      rollupOptions: {
        output: tvBuild
          ? {
              // Single classic IIFE — file:// cannot load ES module graphs on webOS.
              format: 'iife',
              name: 'StreamBoxTV',
              inlineDynamicImports: true,
              entryFileNames: 'assets/[name]-[hash].js',
              chunkFileNames: 'assets/[name]-[hash].js',
              assetFileNames: 'assets/[name]-[hash][extname]',
            }
          : {
              manualChunks(id) {
                if (id.includes('node_modules')) {
                  if (id.includes('@tanstack/react-virtual')) return 'virtual';
                  if (id.includes('react') || id.includes('react-router')) return 'vendor';
                }
              },
            },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      open: simulator,
      hmr: {
        overlay: true,
      },
      watch: {
        usePolling: false,
        ignored: ['**/dist/**', '**/dist-simulator/**', '**/webos-build/**', '**/*.ipk'],
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'zustand',
        '@tanstack/react-virtual',
        'hls.js',
        'mpegts.js',
      ],
    },
  };
});
