# StreamBox License Server

Minimal HTTP API + admin panel (no framework).

```bash
npm run license:server
# API:   http://127.0.0.1:8787
# Admin: http://127.0.0.1:8787/admin
```

Admin key (default): **`streambox-admin`**  
Override: `set LICENSE_ADMIN_KEY=your-secret`

## Admin panel

Open `/admin` → enter the admin key →:

- Add / edit activation codes
- Set **playlist URL** per code
- Set device limit + expiry
- View / revoke activated devices
- Delete codes

## Public endpoints

| Method | Path | Body |
|--------|------|------|
| GET | `/v1/health` | — |
| POST | `/v1/activate` | `{ code, deviceId, deviceLabel? }` |
| POST | `/v1/validate` | `{ token, deviceId }` |
| POST | `/v1/deactivate` | `{ token, deviceId }` |

## Admin API

Header: `X-Admin-Key: <LICENSE_ADMIN_KEY>`

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
