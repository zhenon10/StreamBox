# LG Content Store — Self checklist (StreamBox TV)

Use this together with the official **App Self Checklist** form from [LG Seller Lounge](https://seller.lgappstv.com/). Fill the official spreadsheet with your test results before upload.

## Package / metadata

- [ ] `npm run tv:store-check` passes (no failures)
- [ ] `webos/icon.png` 80×80, `icon-large.png` 130×130, `splash.png` 1920×1080
- [ ] Seller Lounge icon uploaded: `webos/store/store-icon-400.png` (400×400)
- [ ] `appinfo.json`: id, title, version, type=web, icon, splashBackground, appDescription ≤60
- [ ] Version bumped if re-uploading (same version cannot be uploaded twice)
- [ ] `VITE_LICENSE_API_URL` is public **HTTPS** (not localhost / LAN / YOUR-LICENSE-HOST)
- [ ] `VITE_STORE_BUILD=true` (no Open URL / Open File in store build)

## Remote / navigation

- [ ] Arrow keys move focus between actionable items
- [ ] Enter / OK activates focused item
- [ ] Back returns: Player → Channels → Home (app handles Back; `disableBackHistoryAPI: true`)
- [ ] No dead-end screens without Back / exit path
- [ ] Magic Remote pointer (if used) does not break focus UI

## Launch / lifecycle

- [ ] Cold start shows splash then Home
- [ ] Re-launch from Home / Recent Apps restores app (`handlesRelaunch: true`)
- [ ] App survives TV sleep / wake without black screen (spot-check on target webOS)

## License / content flow

- [ ] Home shows **Aktive et** (no free M3U URL/file entry in store build)
- [ ] Invalid code shows clear Turkish error
- [ ] Valid code loads playlist and opens Channels
- [ ] Network failure to license API shows friendly error (not crash)
- [ ] Settings shows device ID, plan, expiry; “Lisansı kaldır” works

## Playback

- [ ] Select channel → Player starts (or clear error)
- [ ] Play / Pause / Ch± / Back work on remote
- [ ] Exit player returns to channel list
- [ ] Long playlist (~10k+) does not freeze UI indefinitely (progress / category first)

## Network / errors

- [ ] Airplane / unplug network → graceful message
- [ ] Restore network → retry / re-activate works
- [ ] No uncaught white/black crash screens

## Memory / stability

- [ ] `requiredMemory` set (256 MB) — spot-check on mid-range TV if possible
- [ ] Open/close player repeatedly without crash
- [ ] No continuous CPU spin on idle Home

## Store listing (Seller Lounge)

- [ ] Screenshots (FHD) prepared — Home, Activate, Channels, Player
- [ ] Privacy policy URL live (see PRIVACY-TEMPLATE.md)
- [ ] Support contact ready (see SUPPORT-TEMPLATE.md)
- [ ] UX scenario document attached (see UX-SCENARIO.md)
- [ ] Official self-checklist filled and uploaded

## Legal / content (seller responsibility)

- [ ] You have rights to distribute the app and licensed streams
- [ ] App does not promote piracy; activation is for authorized subscribers only
- [ ] Age rating / content category selected correctly in Seller Lounge
