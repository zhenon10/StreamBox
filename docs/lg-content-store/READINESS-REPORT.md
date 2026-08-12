# IvPlayer LG Seller Lounge Readiness Report

**Date:** 12 August 2026  
**App ID:** `com.ivplayer.iptv` · **Version:** `1.0.0`  
**Seller type:** Individual  
**Canonical privacy URL:** https://ivplayer.tr/privacy.html  
**Support URL:** https://ivplayer.tr/support.html  
**License API:** https://license.ivplayer.tr

## 1. Genel durum

**NOT READY** — apex HTTPS privacy/support **canlı**; nginx stream-proxy nolog + gerçek TV QA + mağaza IPK hâlâ eksik.

## 2. Kritik güvenlik sorunları

| Konu | Durum |
|------|--------|
| Nginx `access_log` + `/v1/stream-proxy?url=` (credential query) | **Düzeltme hazır** — canlıya `sudo` ile `patch-license-nginx-nolog.sh` uygulanmalı |
| Stream-proxy SSRF (localhost / private IP / metadata) | **Düzeltildi** (Node `assertSafeProxyTarget`) — canlıya yüklendi, 127.0.0.1 → 400 `blocked_ip` |
| Proxy lisanssız herkese açık | **Kalan risk** — MSE/HLS’yi bozmamak için token zorunlu yapılmadı; SSRF sertleştirildi |
| Rate limit yok | **Kalan risk** (bilinçli; canlı segment trafiği yüksek) |

## 3. Privacy sorunları

| Konu | Durum |
|------|--------|
| Şirket dili | Kaldırıldı (individual seller) |
| clearLicense kapsamı abartılıydı | privacy.html gerçek davranışa çekildi |
| Stream-proxy disclosure | Eklendi |
| Nginx log iddiası | Deploy betiği + privacy metni güncellendi; **canlı nginx patch kullanıcı sudo’su bekliyor** |

## 4. KVKK sorunları

- Genel haklar + `destek@ivplayer.tr` — uydurma şirket adresi / süre / KEP yok.
- Resmi başvuru prosedürü dokümante edilmedi (bilinçli).

## 5. Nginx

- Diğer sitelere dokunulmadı.
- Repo: `license-server/deploy/nginx-license.ivplayer.tr.conf` + `patch-license-nginx-nolog.sh`
- Canlı uygulama: sunucuda `bash ~/ivplayer/license-server/deploy/patch-license-nginx-nolog.sh` (sudo ister) → `nginx -t` → reload

## 6. Stream Proxy

- `?url=` http/https only
- DNS resolve + private/link-local/metadata IP block (redirect hop’larda da)
- Range allowlist
- Upstream `Set-Cookie` iletilmez
- Hata cevaplarında URL yok
- Connect timeout 20s
- Node URL loglamaz

## 7. Database / Credential güvenliği

- `codes[].playlistUrl` plaintext JSON (mevcut mimari) — **migration yapılmadı** (lisansları bozmamak için)
- Admin listede URL maskelenir; düzenlemede tam URL (admin oturumu gerekir)
- Activate/validate yanıtında playlistUrl cihaz için gerekli — API sözleşmesi değiştirilmedi

## 8. webOS uygulaması

- `appinfo.json` OK; store-check **0 uyarı**
- Client’ta admin secret / private key yok; yalnızca public `VITE_LICENSE_API_URL`
- Emülatör IPK `.env.production.local` → `10.0.2.2` kullanır — **mağaza IPK’si bu dosya olmadan HTTPS ile üretilmeli**

## 9. LG Seller Lounge

Hazır dokümanlar: CHECKLIST, UX-SCENARIO, SUPPORT/PRIVACY şablonları.  
Eksik: Seller hesabı, ekran görüntüleri, gerçek TV QA, apex HTTPS, QA test kodu.

## 10. Yapılan değişiklikler

| Dosya | Neden |
|-------|--------|
| `license-server/index.mjs` | SSRF koruması, Range allowlist, güvenli hata, redirect re-check |
| `license-server/admin.html` | Playlist URL listede maskeleme |
| `license-server/deploy/nginx-license.ivplayer.tr.conf` | stream-proxy `access_log off` şablonu |
| `license-server/deploy/patch-license-nginx-nolog.sh` | Canlı nginx patch (yalnız license vhost) |
| `public-site/privacy.html` | Gerçek davranış + individual seller + proxy/KVKK |
| `docs/lg-content-store/PRIVACY-TEMPLATE.md` | Canonical URL işaretlendi (önceki tur) |

## 11. Test sonuçları

- `node --check license-server/index.mjs` OK
- `npm run tv:store-check` OK (0 warning)
- Canlı restart + `/v1/health` 200
- SSRF: `url=http://127.0.0.1/` → 400 `blocked_ip`
- SSRF: `url=http://169.254.169.254/` → 400
- nginx patch: **sudo TTY gerekli — bu oturumda uygulanamadı**

## 12. Kalan işler

1. DNS: `ivplayer.tr` yalnızca `78.189.53.159` (eski A sil)
2. `enable-ivplayer-https.sh` (apex HTTPS)
3. `patch-license-nginx-nolog.sh` (sudo)
4. Gerçek TV QA (oynatma + Ch±)
5. Mağaza IPK: HTTPS env, `.env.production.local` yok
6. Seller listing + ekran görüntüleri + QA aktivasyon kodu

## 13. LG’ye göndermeden önce mutlaka

- [x] Apex DNS temiz + `https://ivplayer.tr/privacy.html` ve `/support.html` 200 (2026-08-12)
- [x] nginx stream-proxy `access_log off` canlıda (doğrulandı: `access_log off;` location /v1/stream-proxy)
- [ ] Gerçek webOS TV’de A–E senaryoları
- [ ] Mağaza IPK (`VITE_LICENSE_API_URL=https://license.ivplayer.tr`, store build)
- [ ] Seller’da Privacy/Support URL’leri HTTPS
- [ ] Test aktivasyon kodu (müşteri kodu değil)

## 14. LG’ye göndermeye hazır mı?

**HAYIR**

Önem sırası:
1. Gerçek TV QA yok
2. Mağaza IPK henüz HTTPS-only paket olarak doğrulanmadı
3. Seller listing / ekran görüntüleri eksik
