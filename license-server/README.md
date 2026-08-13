# IvPlayer License Server

Minimal HTTP API + admin panel (no framework).

```bash
npm run license:server
# API:   http://127.0.0.1:8787
# Admin: http://127.0.0.1:8787/admin
# Web:   http://127.0.0.1:8787/app/   (local) · production: https://ivplayer.tr/app/
```

Set `LICENSE_ADMIN_KEY` to a long random secret (required in production). Local default is `ivplayer-admin`.

## Admin panel

Open `/admin` → login with the admin key (session cookie, 12 hours). The panel HTML is not served until login succeeds. Then:

- Add / edit activation codes
- Set **playlist URL** per code
- Set device limit + expiry
- View / revoke activated devices
- Delete codes

## Public endpoints

| Method | Path | Body |
|--------|------|------|
| GET | `/v1/health` | — |
| GET | `/v1/plans` | server prices (no secrets) |
| POST | `/v1/orders` | `{ deviceCode, plan, email }` — amount is **not** taken from client |
| GET | `/v1/orders/:orderNo` | public status (PENDING / PAID / FAILED) |
| POST | `/v1/payments/paytr/callback` | PayTR form POST; respond `OK` |
| POST | `/v1/activate` | `{ code, deviceId, deviceLabel? }` |
| POST | `/v1/validate` | `{ token, deviceId }` |
| POST | `/v1/deactivate` | `{ token, deviceId }` |

PayTR Bildirim URL (merchant panel): `https://license.ivplayer.tr/v1/payments/paytr/callback`

License is activated only after a verified PayTR callback (HMAC), not after the browser return URL.

```bash
node --test license-server/payments/payments.test.mjs
```

## Admin API

Cookie session after `/admin/login`, or header `X-Admin-Key: <LICENSE_ADMIN_KEY>`.

| Method | Path |
|--------|------|
| GET | `/v1/admin/codes` |
| POST | `/v1/admin/codes` — body `{ code, planName, playlistUrl, maxDevices, expiresAt }` |
| DELETE | `/v1/admin/codes/:code` |
| DELETE | `/v1/admin/activations/:token` |

Seed code: **`DEMO-2026`**. Override playlist:

```bash
set LICENSE_DEMO_PLAYLIST_URL=http://your-panel/playlist.m3u
npm run license:server
```

## webOS emulator

The TV emulator cannot reach `127.0.0.1` on your PC. Set the app env to your LAN IP:

```
VITE_LICENSE_API_URL=http://192.168.x.x:8787
```

Then rebuild (`npm run tv:package`).
