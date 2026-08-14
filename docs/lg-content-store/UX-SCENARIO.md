# UX scenario — IvPlayer (LG tester reference)

**Seller Lounge file:** [IvPlayer-UX-Scenario-4.4.ppt](./IvPlayer-UX-Scenario-4.4.ppt) (official template 4.4, filled).

**App ID:** `com.ivplayer.iptv`  
**Title:** IvPlayer  
**Type:** web app (FHD 1920×1080)  
**Primary input:** TV remote (D-pad + OK + Back)

## Purpose

IvPlayer is a **free** LG webOS media player. It does not provide TV channels, IPTV subscriptions, or channel packages. Users buy a 1-year or lifetime **player license** on https://ivplayer.tr using the on-screen **device code**, then load their own M3U/M3U8 playlist.

Until licensed: Home shows device code, Check license, Settings. No playlist URL/file.

After license: Open URL / Open File are available. Content is user-supplied.

## Preconditions

1. Device online.
2. License API reachable (HTTPS).
3. Valid test activation code provided by seller (e.g. demo code in test notes).

## Scenario A — First launch & activate

1. Launch IvPlayer from Launcher.
2. Splash appears, then **Home**.
3. Home shows a 12-character **device code** and the buy URL (ivplayer.tr).
4. After the seller binds that code on the website, focus **Lisansı kontrol et** → OK.
5. Expect: license active → user can **Open playlist URL** and load their own M3U.

**Fail if:** crash, infinite spinner, blank screen, or URL/file pickers appear **before** license.

## Scenario B — Browse & play

1. On Channels, select a category (e.g. Live).
2. Select a channel → Player.
3. OK / Play Pause toggles playback when available.
4. Channel Up / Down (or on-screen Ch±) changes channel in context.
5. Back → channel list. Back again → Home (or previous).

**Fail if:** Back exits TV to Launcher unexpectedly from nested screens without confirmation path, or remote keys ignored.

## Scenario C — License info & revoke

1. Home → Settings.
2. Verify device ID short code, plan name, expiry (if licensed).
3. **Lisansı kaldır** → confirm license cleared.
4. Home no longer shows licensed playlist shortcut until re-activated.

## Scenario D — Offline / bad code

1. Enter invalid code → Turkish error message, stay on dialog.
2. Disconnect network, try activate → network error message, no crash.
3. Reconnect and activate successfully.

## Scenario E — Relaunch

1. While on Channels or Player, press Home (TV).
2. Re-open IvPlayer from Recent / Launcher.
3. App returns usable (Home or previous content) without permanent black screen.

## Notes for testers

- Large playlists may take time to index categories; wait for category grid.
- Content quality depends on the licensed playlist CDN, not the app shell.
- Magic Remote: D-pad navigation is primary; pointer is optional.
