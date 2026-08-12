# IvPlayer

Commercial-quality IPTV / media player for **LG webOS**, with a **simulator-first** development workflow.

## Architecture

Clean Architecture + Platform Abstraction Layer:

| Layer | Role |
|---|---|
| Domain | Entities, repository contracts, events |
| Application | Use cases, DI, playback orchestration, stores |
| Infrastructure | M3U parser, IndexedDB, providers |
| Platform | `BrowserPlatform` (simulator) / `WebOSPlatform` (TV) |
| UI | React pages, spatial + graph navigation |

Business logic never imports LG APIs or `HTMLVideoElement` directly. Playback goes through `IVideoPlayer` / `VideoPlayerService`.

## Automatic platform detection

| Environment | Platform implementation |
|---|---|
| `npm run simulator` / browser | **BrowserPlatform** |
| LG webOS TV / emulator (`PalmSystem` / `webOS`) | **WebOSPlatform** |

Forced via env (see `.env.simulator` / `.env.production`):

- `VITE_PLATFORM=browser|webos`
- `VITE_APP_TARGET=simulator|tv`

## Simulator-first development

Primary daily workflow is the **browser TV simulator** with:

- Hot Reload
- Vite HMR
- React Fast Refresh
- Source maps
- M3U CORS proxy (`/api/playlist-proxy`)

### Scripts

```bash
# Development (default)
npm run simulator          # Vite --mode simulator (HMR + Fast Refresh)
npm run simulator:build    # Production-like simulator bundle → dist-simulator/
npm run simulator:run      # Preview dist-simulator/

# Alias
npm run dev                # → npm run simulator

# LG webOS production
npm run tv                 # Help for TV workflow
npm run tv:package         # Typecheck + Vite production build + webos-build/ (+ ares-package)
npm run tv:install         # ares-install (needs WEBOS_DEVICE or --device)
npm run tv:launch          # ares-launch
```

### TV remote in the browser

| Key | Action |
|---|---|
| `↑` `↓` `←` `→` | Navigate focus |
| `Enter` | OK / select |
| `Esc` / `Backspace` | Back |
| `↑ ↑ ↓ ↓ ← → Enter` | Developer overlay |

### Example: start simulator

```bash
cd iptvpayer
npm install
npm run simulator
```

Open http://localhost:5173/

### Example: deploy to LG TV

```bash
# Register device once (webOS TV CLI)
ares-setup-device

# Build + package
npm run tv:package

# Install + launch
set WEBOS_DEVICE=myTV          # PowerShell: $env:WEBOS_DEVICE="myTV"
npm run tv:install
npm run tv:launch

# Or one shot:
npm run tv -- all --device myTV
```

## Project layout

```
license-server/        # Activation-code license API (Node http)
docs/lg-content-store/ # Seller Lounge checklist & templates
scripts/
  simulator.mjs
  package-webos.mjs
  generate-webos-icons.mjs
  store-check.mjs
  install-webos.mjs
  launch-webos.mjs
  tv.mjs
src/
  domain/license/
  infrastructure/license/
  platform/
    browser/
    webos/
    player/
webos/
  appinfo.json
  icon.png / icon-large.png / splash.png
  store/store-icon-400.png
```

## Tech stack

React · TypeScript (strict) · Vite · Tailwind CSS · Zustand · React Router

## License activation

Activation code + device ID (no MAC).

- **Simulator:** hybrid — Aktive et + Open URL / Open File (`VITE_STORE_BUILD=false`)
- **Store / production TV:** activation only (`VITE_STORE_BUILD=true`)

```bash
# Terminal 1 — license API (port 8787)
npm run license:server

# Terminal 2 — app
npm run simulator
```

Demo code: **`DEMO-2026`**. See [`license-server/README.md`](license-server/README.md).

Admin panel: http://127.0.0.1:8787/admin (key: `ivplayer-admin`, env `LICENSE_ADMIN_KEY`).

## LG Content Store

```bash
npm run tv:icons          # brand/ivplayer-app-icon.* → webos icons + splash
npm run tv:store-check    # pre-flight (assets, appinfo, env warnings)
npm run tv:package        # production IPK (fails if icons missing)
```

Before Seller Lounge upload:

1. Set **public HTTPS** `VITE_LICENSE_API_URL` in `.env.production` (replace `https://YOUR-LICENSE-HOST`).
2. Keep `VITE_STORE_BUILD=true`.
3. Upload `webos/store/store-icon-400.png` as the 400×400 store icon.
4. Complete docs under [`docs/lg-content-store/`](docs/lg-content-store/) (checklist, UX scenario, privacy/support URLs).

Seller Lounge also requires the official App Self Checklist and screenshots — see `docs/lg-content-store/CHECKLIST.md`.

For **emulator** testing against a local license server, temporarily set `VITE_LICENSE_API_URL` to your PC LAN/host-only IP (e.g. `http://192.168.56.1:8787`), package, then restore the HTTPS placeholder before store upload.

## Notes

- Large playlists (100k channels) use async M3U parsing + IndexedDB; search index is deferred for huge lists.
- Do not commit IPTV credentials. Prefer local M3U files when sharing bug reports.
