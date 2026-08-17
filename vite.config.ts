import { defineConfig, type ConfigEnv, type Plugin, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const PLAYLIST_PROXY_PATH = '/api/playlist-proxy';
const STREAM_PROXY_PATH = '/api/stream-proxy';
const STREAM_REMUX_PATH = '/api/stream-remux';

/** Dev server middleware — fetches remote M3U URLs server-side to bypass browser CORS. */
function playlistProxyPlugin(): Plugin {
  return {
    name: 'ivplayer-playlist-proxy',
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
            headers: { 'User-Agent': 'IvPlayer/1.0' },
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
    name: 'ivplayer-stream-proxy',
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

          // Follow redirects (Xtream live URLs often 302 to CDN).
          const response = await fetch(target, { headers, redirect: 'follow' });

          const contentTypePeek =
            response.headers.get('content-type') ??
            (target.includes('.m3u8')
              ? 'application/vnd.apple.mpegurl'
              : 'video/mp2t');

          // Reject HTML error pages early so MSE does not hang on garbage.
          if (response.status >= 400 || /text\/html/i.test(contentTypePeek)) {
            const errBody = await response.text();
            res.statusCode = response.status >= 400 ? response.status : 502;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(
              `Stream proxy upstream ${response.status}: ${errBody.slice(0, 200) || contentTypePeek}`,
            );
            return;
          }

          res.statusCode = response.status;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Content-Type', contentTypePeek);

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

/** Dev remux — ffmpeg -c copy to MPEG-TS (same idea as license /v1/stream-remux). */
function streamRemuxPlugin(): Plugin {
  return {
    name: 'ivplayer-stream-remux',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(STREAM_REMUX_PATH)) {
          next();
          return;
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
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

        void import('node:child_process').then(({ spawn }) => {
          try {
            const parsed = new URL(target);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              res.statusCode = 400;
              res.end('Only http and https URLs are supported');
              return;
            }
          } catch {
            res.statusCode = 400;
            res.end('Invalid url');
            return;
          }

          const child = spawn(
            'ffmpeg',
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-user_agent',
              'VLC/3.0.20 LibVLC/3.0.20',
              '-i',
              target,
              '-map',
              '0:v:0',
              '-map',
              '0:a:0?',
              '-c',
              'copy',
              '-f',
              'mpegts',
              'pipe:1',
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
          );

          child.on('error', () => {
            if (!res.headersSent) {
              res.statusCode = 501;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'remux_unavailable' }));
            }
          });

          res.statusCode = 200;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'video/mp2t');
          res.setHeader('Cache-Control', 'no-store');
          child.stdout.pipe(res);
          req.on('close', () => {
            try {
              child.kill('SIGKILL');
            } catch {
              // ignore
            }
          });
        });
      });
    },
  };
}

/** Modern ES2022 bundle (not webOS Chromium 79 IIFE). */
function isModernBundle(mode: string, command: ConfigEnv['command']): boolean {
  return (
    mode === 'simulator' ||
    mode === 'web' ||
    mode === 'windows' ||
    mode === 'android' ||
    mode === 'play' ||
    (command === 'serve' && mode !== 'production')
  );
}

function nativePackageAliases(mode: string): Record<string, string> {
  const stubs = path.resolve(rootDir, 'src/platform/native-stubs');
  const alias: Record<string, string> = {};
  if (mode !== 'android' && mode !== 'play') {
    alias['@capacitor/core'] = path.join(stubs, 'capacitor-core.ts');
    alias['@capacitor/app'] = path.join(stubs, 'capacitor-app.ts');
    alias['@capacitor/preferences'] = path.join(stubs, 'capacitor-preferences.ts');
    alias['@capacitor-community/keep-awake'] = path.join(stubs, 'keep-awake.ts');
  }
  return alias;
}

export default defineConfig(({ mode, command }: ConfigEnv): UserConfig => {
  const modern = isModernBundle(mode, command);
  const webBuild = mode === 'web';
  const windowsBuild = mode === 'windows';
  const androidBuild = mode === 'android' || mode === 'play';
  const localSimulator =
    mode === 'simulator' ||
    (command === 'serve' && mode !== 'production' && !windowsBuild && !androidBuild);
  const tvBuild = !modern;
  const fluidViewport = webBuild || windowsBuild || androidBuild;

  let outDir = 'dist';
  if (webBuild) outDir = 'dist-web';
  else if (windowsBuild) outDir = 'dist-windows';
  else if (androidBuild) outDir = 'dist-android';
  else if (localSimulator) outDir = 'dist-simulator';

  return {
    plugins: [
      react({
        // Fast Refresh enabled by default via @vitejs/plugin-react
      }),
      tailwindcss(),
      playlistProxyPlugin(),
      streamProxyPlugin(),
      streamRemuxPlugin(),
      fluidViewport
        ? {
            name: 'fluid-viewport',
            transformIndexHtml(html: string) {
              const viewport = androidBuild
                ? 'width=device-width, initial-scale=1.0, viewport-fit=cover'
                : 'width=device-width, initial-scale=1.0';
              let next = html.replace(
                'width=1920, height=1080, initial-scale=1.0',
                viewport,
              );
              if (webBuild) {
                next = next
                  .replace(/<html lang="[^"]*">/i, '<html lang="tr">')
                  .replace(
                    '</title>',
                    '</title>\n    <link rel="canonical" href="https://ivplayer.tr/app/" />\n    <link rel="alternate" hreflang="tr" href="https://ivplayer.tr/app/" />\n    <link rel="alternate" hreflang="x-default" href="https://ivplayer.tr/app/" />',
                  );
              }
              return next;
            },
          }
        : null,
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
    base: webBuild ? '/app/' : './',
    resolve: {
      alias: {
        '@': path.resolve(rootDir, './src'),
        ...nativePackageAliases(mode),
      },
    },
    define: {
      __IVPLAYER_SIMULATOR__: JSON.stringify(localSimulator),
    },
    build: {
      // webOS TV 6.0 = Chromium 79 (no native ?. / ??). Simulator / desktop / mobile stay modern.
      target: modern ? 'es2022' : 'chrome79',
      // Critical: Tailwind v4 emits @layer — unsupported before Chrome 99 → unstyled TV UI.
      cssTarget: modern ? undefined : 'chrome79',
      outDir,
      // Source maps for local simulator only.
      sourcemap: localSimulator && !webBuild,
      cssCodeSplit: !tvBuild,
      modulePreload: tvBuild ? false : undefined,
      rollupOptions: {
        output: tvBuild
          ? {
              // Single classic IIFE — file:// cannot load ES module graphs on webOS.
              format: 'iife',
              name: 'IvPlayer',
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
      open: localSimulator,
      hmr: {
        overlay: true,
      },
      watch: {
        usePolling: false,
        ignored: [
          '**/dist/**',
          '**/dist-simulator/**',
          '**/dist-windows/**',
          '**/dist-android/**',
          '**/webos-build/**',
          '**/src-tauri/target/**',
          '**/android/.gradle/**',
          '**/android/app/build/**',
          '**/*.ipk',
        ],
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
