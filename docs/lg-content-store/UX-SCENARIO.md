# UX scenario — StreamBox TV (LG tester reference)

**App ID:** `com.streambox.iptv`  
**Title:** StreamBox TV  
**Type:** web app (FHD 1920×1080)  
**Primary input:** TV remote (D-pad + OK + Back)

## Purpose

StreamBox TV is a licensed IPTV player for LG webOS. Users activate with a subscription code; the app loads their playlist and plays live TV / VOD categories.

Store build does **not** allow arbitrary M3U URL or local file open.

## Preconditions

1. Device online.
2. License API reachable (HTTPS).
3. Valid test activation code provided by seller (e.g. demo code in test notes).

## Scenario A — First launch & activate

1. Launch StreamBox TV from Launcher.
2. Splash appears, then **Home**.
3. Focus **Aktive et** → OK.
4. Enter activation code → **Aktive et**.
5. Expect: loading progress → **Channels** (Canlı TV / Filmler / Diziler as available).

**Fail if:** crash, infinite spinner, blank screen, or URL/file pickers appear.

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
2. Re-open StreamBox from Recent / Launcher.
3. App returns usable (Home or previous content) without permanent black screen.

## Notes for testers

- Large playlists may take time to index categories; wait for category grid.
- Content quality depends on the licensed playlist CDN, not the app shell.
- Magic Remote: D-pad navigation is primary; pointer is optional.
