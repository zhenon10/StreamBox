# IvPlayer Automatic Payment — Production Validation Checklist

Bu belge **yeni özellik geliştirme değildir**. Mevcut payment/license koduna dokunulmaz.
`/v1/activate` · `/v1/validate` · `/v1/deactivate` · `/v1/claim` değiştirilmez.

Amaç: canlıya çıkmadan önce PayTR sandbox + sunucu + TV akışını doğrulamak.

---

## KAPILAR (zorunlu)

1. **`PAYTR_TEST_MODE=0` YASAK** — Adım 1–11 (özellikle **11: gerçek PayTR sandbox ödeme + gerçek callback**) yeşil olmadan canlı moda geçilmez.
2. **Sahte başarı yok** — `hash` uydurup `status=success` POST etmek lisans **ACTIVE** yapmaz / yapılmamalı. Pozitif HMAC kanıtı yalnız **PayTR’nin gönderdiği** bildirimdir.
3. **Tarayıcı dönüşü kanıt değil** — `order-status.html` / `merchant_ok_url` lisans açmaz. Yalnızca imzalı callback.
4. **Ödeme PAID olmadan lisans ACTIVE olmaz.** Admin’de “PAID işaretle” yoktur; kullanma.
5. Test cihazı: müşteri kodu kullanma. Ayrı `XXXX-XXXX-XXXX` ayır.

**Canlı moda geçiş izni:** Adım 1–20 yeşil **ve** Adım 11’de PayTR panelde işlem **Başarılı** + Bildirim URL yanıtı **OK** + sipariş `PAID` + lisans `ACTIVE`.

---

## Ortam

| | |
|---|---|
| Site | `https://ivplayer.tr` |
| API | `https://license.ivplayer.tr` |
| Callback | `https://license.ivplayer.tr/v1/payments/paytr/callback` |
| ENV (VPS) | `/etc/ivplayer-license.env` |
| DB | `/opt/ivplayer/license-server/data/licenses.json` |
| Nginx (license) | `/etc/nginx/sites-enabled/` içinde `license.ivplayer.tr` |
| Servis | `ivplayer-license` |

VPS komutları Ubuntu. Repo komutları proje kökünden (`iptvpayer`).

Her adımdan önce (VPS, geri dönüşsüz DB işlemi yok):

```bash
sudo cp -a /opt/ivplayer/license-server/data/licenses.json \
  /opt/ivplayer/license-server/data/licenses.json.bak.$(date +%Y%m%d%H%M%S)
```

---

## 1. PayTR ENV kontrolü

**KOMUT** (VPS):

```bash
sudo grep -E '^(PAYMENT_PROVIDER|PAYTR_|IVPLAYER_|PUBLIC_SITE_URL|LICENSE_PUBLIC_URL)=' /etc/ivplayer-license.env
curl -sS https://license.ivplayer.tr/v1/health
```

**BEKLENEN SONUÇ**

- `PAYMENT_PROVIDER=paytr`
- `PAYTR_MERCHANT_ID` dolu (boş değil)
- `PAYTR_MERCHANT_KEY` / `PAYTR_MERCHANT_SALT` dosyada **var** (değerleri ekrana yapıştırma / loglama)
- `PAYTR_TEST_MODE=1`
- `IVPLAYER_ONE_YEAR_PRICE` ve `IVPLAYER_LIFETIME_PRICE` ≥ 100 (kuruş)
- `PUBLIC_SITE_URL=https://ivplayer.tr`
- Health JSON: `"ok":true`, `"paymentProvider":"paytr"`, `"paymentConfigured":true`
- Health gövdesinde `merchant_key` / `salt` / admin key **yok**

**BAŞARISIZLIK DURUMUNDA**

- `paymentConfigured:false` → `/etc/ivplayer-license.env` doldur, `sudo systemctl restart ivplayer-license`, health’i tekrar çek.
- `TEST_MODE=0` ise **hemen `1` yap**, restart. Canlı moda bu checklist bitmeden dönme.
- Health secret sızdırıyorsa **deploy etme**; kod düzeltmesi gerekir (bu checklist’te kod değiştirme).

---

## 2. PayTR sandbox credentials kontrolü

**KOMUT**

PayTR Mağaza Paneli (Destek & Kurulum → Ayarlar):

- Mağaza durumu: **test / sandbox** (canlı onay bekleniyorsa test mağaza)
- `merchant_id` = ENV `PAYTR_MERCHANT_ID`
- Bildirim URL = `https://license.ivplayer.tr/v1/payments/paytr/callback`
- Protokol: **HTTPS**
- Test kartları paneldeki güncel listeden (dokümanda uydurma kart yazma)

Repo (değer basmadan):

```bash
# VPS — uzunluk kontrolü; değerleri yazdırma
sudo awk -F= '
  $1=="PAYTR_MERCHANT_ID" {print "ID_LEN", length($2)}
  $1=="PAYTR_MERCHANT_KEY" {print "KEY_LEN", length($2)}
  $1=="PAYTR_MERCHANT_SALT" {print "SALT_LEN", length($2)}
  $1=="PAYTR_TEST_MODE" {print "TEST_MODE", $2}
' /etc/ivplayer-license.env
```

**BEKLENEN SONUÇ**

- `ID_LEN` > 0, `KEY_LEN` ≥ 16, `SALT_LEN` ≥ 16, `TEST_MODE 1`
- Panel Bildirim URL birebir callback path
- Test mağaza anahtarları **production canlı** anahtarlarından ayrı (karıştıysa dur)

**BAŞARISIZLIK DURUMUNDA**

- Panel URL yanlış / HTTP → HTTPS + path düzelt, kaydet. Adım 11’e geçme.
- KEY/SALT boş veya çok kısa → PayTR’den tekrar kopyala; git’e koyma.
- Canlı mağaza anahtarı sandbox’ta duruyorsa test mağazaya dön.

---

## 3. nginx callback location kontrolü

**KOMUT** (VPS):

```bash
sudo nginx -T 2>/dev/null | grep -n 'server_name license.ivplayer.tr\|location /v1/payments\|ssl_certificate' | head -80
```

**BEKLENEN SONUÇ**

- `server_name license.ivplayer.tr` **443 ssl** bloğunda da var (yalnızca port 80 yetmez)
- `location /v1/payments/` (veya tam callback path) `proxy_pass http://127.0.0.1:8787`
- Bu location’da `auth_basic` / IP allow-list / WAF challenge **yok**
- `access_log off` tercih
- `X-Forwarded-Proto` iletiliyor

**BAŞARISIZLIK DURUMUNDA**

- HTTPS vhost’ta location yoksa şablonu uygula: `license-server/deploy/nginx-license.ivplayer.tr.conf` → **Certbot’lu canlı dosyaya elle birleştir** (ssl satırlarını silme).
- Basic-auth varsa callback için kaldır. Adım 4–5 kırmızıysa 11’e geçme.
- `nginx -t` fail → reload yok.

---

## 4. HTTPS callback erişilebilirlik testi

**KOMUT**

```bash
curl -sS -o /dev/null -w 'https_code=%{http_code} ssl=%{ssl_verify_result}\n' \
  https://license.ivplayer.tr/v1/payments/paytr/callback

curl -sS -o /dev/null -w 'http_code=%{http_code} redirect=%{redirect_url}\n' \
  http://license.ivplayer.tr/v1/payments/paytr/callback
```

**BEKLENEN SONUÇ**

- HTTPS: TLS doğrulanır (`ssl=0`), HTTP kod **401/403/404 değil** (POST bekleyen endpoint GET’te 400/404/405 olabilir; **connection + cert OK**)
- HTTP: 301/302 → `https://license.ivplayer.tr/...`
- Sertifika `license.ivplayer.tr` için geçerli

**BAŞARISIZLIK DURUMUNDA**

- Cert hatası → `sudo certbot certificates` / yenile; PayTR HTTPS ister.
- 401/403 → auth/firewall. PayTR bildirimi gelmez; panelde sipariş “Devam Ediyor” kalır.
- Timeout → `systemctl status ivplayer-license`, `curl -sS http://127.0.0.1:8787/v1/health`

---

## 5. POST callback kabul testi

Bu adım **geçersiz** (imzasız) POST’tur. Lisans açmamalı.

**KOMUT**

```bash
curl -sS -D - -o /tmp/paytr-cb-body.txt -X POST \
  'https://license.ivplayer.tr/v1/payments/paytr/callback' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'merchant_oid=IVPINVALIDTEST&status=success&total_amount=1&hash=invalid'

echo
echo 'BODY:'
cat /tmp/paytr-cb-body.txt
echo
```

**BEKLENEN SONUÇ**

- Yanıt gövdesi **`OK` değil** (imza yok/yanlış → `FAIL` veya 400)
- Gövde HTML değil, kart alanı yok
- `licenses.json` değişmedi (yeni `deviceLicenses` / `PAID` yok)

Kontrol:

```bash
sudo grep -n 'IVPINVALIDTEST' /opt/ivplayer/license-server/data/licenses.json || true
```

**BAŞARISIZLIK DURUMUNDA**

- `OK` dönüyorsa imza atlanıyor demektir → **canlı ödeme açma**, kod incelemesi.
- 401/404/502 → nginx/servis (adım 3–4).
- `IVPINVALIDTEST` sipariş/lisans yazdıysa **hemen dur**; DB backup’tan bak, sahte success akışı var.

---

## 6. HMAC signature doğrulama testi

Pozitif HMAC = birim test + Adım 11’deki **gerçek PayTR** bildirimi. Production’a kendi ürettiğin `success` hash’i **atma**.

**KOMUT** (repo, local):

```bash
npm run license:test
```

Beklenen satırlar: `TEST 7 invalid callback signature rejected`, `PayTR token hash matches official formula`.

**KOMUT** (VPS, negatif — canlıya bozuk hash):

Adım 5 ile aynı bozuk `hash`. Ek: PayTR panel **test işlemi** sonrası “Detay” → Bildirim URL yanıtı.

**BEKLENEN SONUÇ**

- Unit: TEST 7 PASS (kötü hash `bad_hash`, lisans yok)
- Canlı negatif: `OK` yok, lisans yok
- Adım 11’e kadar pozitif HMAC için **kendi imzanı production’a gönderme**

**BAŞARISIZLIK DURUMUNDA**

- TEST 7 fail → `PayTRPaymentProvider` / resmi formül; payment kodunu bu planda “düzeltme” — ayrı iş.
- Panel “hash hatalı” / tekrar deniyor → `PAYTR_MERCHANT_KEY`/`SALT` panel ile aynı mı, restart edildi mi kontrol et.
- Bozuk hash’e `OK` + lisans → **TEST_MODE=0 yok**, olayı durdur.

---

## 7. Order amount doğrulama

Client tutarı yok sayılır; callback tutarı siparişle eşleşmezse lisans yok.

**KOMUT** (repo):

```bash
npm run license:test
```

`TEST 3`, `TEST 4`, `TEST 5`, `TEST 9`.

**KOMUT** (canlı fiyat kaynağı):

```bash
curl -sS https://license.ivplayer.tr/v1/plans
```

**KOMUT** (manipülasyon — lisans açmamalı):

```bash
curl -sS -X POST https://license.ivplayer.tr/v1/orders \
  -H 'Content-Type: application/json' \
  -d '{"deviceCode":"AAAA-BBBB-CCCC","plan":"ONE_YEAR","email":"test@invalid.example","amount":1,"currency":"USD","paymentStatus":"PAID"}'
```

**BEKLENEN SONUÇ**

- `/v1/plans` tutarları ENV kuruş değerleri (`29900` → `299.00 TL` gibi); frontend fiyat dayatmaz
- `amount:1` ile gelen POST: sipariş oluşursa bile tutar **1 değil**, sunucu fiyatı. `paymentStatus` client’tan `PAID` olmaz
- Merchant yoksa: `provider_not_configured` (503), lisans yok
- TEST 9: callback 1 TL vs sipariş tutarı → `FAILED` / lisans yok

**BAŞARISIZLIK DURUMUNDA**

- Plans’daki fiyat ENV ile uyuşmuyorsa servisi restart et, ENV kuruş mu kontrol et (299 ≠ 29900).
- Client `amount:1` kabul edilip ödeme 1 kuruşa inerse **dur** — sunucu fiyatı kullanılmıyor.
- Yanlış tutarlı callback lisans açtıysa Adım 11’e geçme.

---

## 8. deviceCode → order → deviceLicense eşleşmesi

**KOMUT** (sandbox ödeme **sonrası**, Adım 11 ile birlikte)

Admin sipariş satırına bak. VPS’te (müşteri kodu kullanma; `ORDER` = Adım 11 `orderNo`):

```bash
ORDER='IVP........'
sudo python3 -c "
import json
db=json.load(open('/opt/ivplayer/license-server/data/licenses.json'))
o=next(x for x in db.get('orders',[]) if x['orderNo']=='$ORDER')
print('order.deviceCode', o.get('deviceCode'))
print('order.plan', o.get('plan'))
print('order.amount', o.get('amount'))
print('paymentStatus', o.get('paymentStatus'))
print('licenseStatus', o.get('licenseStatus'))
lic=(db.get('deviceLicenses') or {}).get(o['deviceCode'])
print('deviceLicense', 'YES' if lic else 'NO')
if lic:
    print('planName', lic.get('planName'))
    print('expiresAt', lic.get('expiresAt'))
"
```

**BEKLENEN SONUÇ**

- `order.deviceCode` == lisans anahtarı (12 hane)
- Başka `deviceCode` için lisans yok
- `paymentStatus=PAID` iken `licenseStatus=ACTIVE` (veya mevcut aktif lisans varsa `REVIEW_REQUIRED` — üzerine yazma)
- Lisans token URL’de yok

**BAŞARISIZLIK DURUMUNDA**

- PAID ama başka cihaza lisans → **dur**, o lisansı admin’den kaldır, ödeme incelemesi.
- PAID + `REVIEW_REQUIRED` + zaten aktif lisans → beklenen güvenli kural; yeni lisans yazma.
- PENDING iken `deviceLicenses` dolmuşsa callback atlanmış / elle yazılmış → geri al.

---

## 9. Duplicate callback testi

**KOMUT** (repo):

```bash
npm run license:test
```

`TEST 8 duplicate callback does not duplicate license`

**KOMUT** (sandbox, Adım 11 sonrası)

PayTR aynı `merchant_oid` için bildirimi tekrar gönderebilir. Panelden tekrar tetikleme varsa bir kez daha bekle **veya** aynı siparişi ikinci kez ödeme.

**BEKLENEN SONUÇ**

- İkinci bildirim yanıtı: `OK`
- Yeni `deviceLicenses` satırı yok
- `expiresAt` sıfırdan başlamaz
- `orders` içinde aynı `orderNo` tek kayıt, `paymentStatus` hâlâ tek `PAID`

**BAŞARISIZLIK DURUMUNDA**

- Süre uzadı / ikinci lisans → idempotency kırık. `TEST_MODE=0` yok.
- İkinci `OK` alınmazsa panel “Devam Ediyor” kalabilir; lisans zaten ACTIVE ise yalnızca yanıt formatını incele (HTML/`OK` karışması).

---

## 10. Başarısız ödeme testi

Gerçek sandbox: ödemeyi iptal et / yanlış 3D / test kartı “fail” (panel dokümanındaki kart).

**KOMUT** (sonra status):

```bash
curl -sS "https://license.ivplayer.tr/v1/orders/ORDERNO"
```

**BEKLENEN SONUÇ**

- `paymentStatus`: `FAILED` veya `PENDING`/`PROCESSING` (iptalde PayTR `status=failed` callback’i)
- `licenseStatus`: `ACTIVE` **değil** (`REJECTED` / `PENDING`)
- `deviceLicenses` bu kod için yeni kayıt yok
- `order-status.html` **“Ödeme başarılı” göstermez** (yalnızca “doğrulanıyor” / alınamadı)

**BAŞARISIZLIK DURUMUNDA**

- Fail ödeme ACTIVE yaptıysa **hemen lisans kaldır** (admin cihaz lisansı sil), `TEST_MODE=0` yok.
- Sayfa redirect ile “başarılı” diyorsa kopya hatası; kanıt callback’dir.

---

## 11. Başarılı sandbox ödeme testi  ← canlı mod kapısı

`PAYTR_TEST_MODE` hâlâ `1`. PayTR **test kartı** ile `https://ivplayer.tr/activation.html` (deploy edilmiş kopya).

Akış:

1. TV/web’den test cihaz kodu
2. Plan seç, e-posta (PayTR zorunlu), öde
3. 3D Secure tamamla
4. PayTR → `POST /v1/payments/paytr/callback`
5. Panel: işlem **Başarılı**, Bildirim **OK**
6. `GET /v1/orders/{orderNo}` → `PAID` + `ACTIVE`

**KOMUT**

```bash
curl -sS "https://license.ivplayer.tr/v1/orders/ORDERNO"
# Panel: Mağaza → İşlemler → ilgili merchant_oid
```

**BEKLENEN SONUÇ**

- `get-token` hatası yok (sipariş `paymentUrl` verdi)
- Panel tutarı = `/v1/plans` sunucu fiyatı (1 TL manipülasyonu yok)
- Callback sunucu log/panel: `OK` (HTML yok)
- JSON: `"paymentStatus":"PAID"`, `"licenseStatus":"ACTIVE"`
- Admin sipariş listesi: PAID / ACTIVE, payment reference dolu
- **Bu adım yeşil olmadan `PAYTR_TEST_MODE=0` yapılmaz**

**BAŞARISIZLIK DURUMUNDA**

| Belirti | Ne yapılır |
|---|---|
| `provider_not_configured` | Adım 1–2 |
| `get-token` / 502 | KEY/SALT, `user_ip`, test_mode, PayTR hata `reason` (secret loglama) |
| Panel “Devam Ediyor” | Callback URL, HTTPS, `OK` gövdesi, nginx 401 |
| PAID değil | Hash/tutar; Adım 6–7 |
| PAID ama ACTIVE değil | `REVIEW_REQUIRED` / zaten lisans; Adım 8 |
| Lisans redirect ile açıldı, panel başarısız | **kapat**, sahte success |

Tekrar: kendi HMAC’inle `status=success` basarak bu adımı “geçme”.

---

## 12. TV `/v1/claim` testi

Mevcut endpoint. Kod değiştirme.

**KOMUT** (Adım 11’deki cihazın **tam** `deviceId` — 12 haneli kod değil, uygulamadaki kimlik):

```bash
curl -sS -X POST https://license.ivplayer.tr/v1/claim \
  -H 'Content-Type: application/json' \
  -d '{"deviceId":"FULL_DEVICE_ID_FROM_TV"}'
```

TV: Home → **Lisansı kontrol et**.

**BEKLENEN SONUÇ**

- HTTP 200, `"ok":true`, `token`, `expiresAt`, `planName`
- `playlistUrl` boş olabilir (müşteri kendi M3U)
- Yanlış `deviceId` → 404 `not_found` (başka cihazın lisansı açılmaz)
- Store build: lisans sonrası Open URL açılır; kanalsız

**BAŞARISIZLIK DURUMUNDA**

- 404: kod/ID eşleşmesi (12 hane = ID’nin son 12 alnum). Sipariş başka koda yazılmışsa Adım 8.
- 403 `expired` / `device_mismatch` → süre veya kilit; lisans endpointini “geçici kapatma”.
- Claim çalışıp ödeme PAID değilse Adım 11 bitmemiş demektir — ACTIVE varsayma.

---

## 13. TV `/v1/validate` testi

**KOMUT**

```bash
curl -sS -X POST https://license.ivplayer.tr/v1/validate \
  -H 'Content-Type: application/json' \
  -d '{"token":"tok_FROM_CLAIM","deviceId":"FULL_DEVICE_ID_FROM_TV"}'
```

**BEKLENEN SONUÇ**

- 200 `"ok":true`, aynı cihaz
- Yanlış cihaz: `device_mismatch`
- Yok token: `not_found`
- Uygulama yeniden açılışta lisans düşmez

**BAŞARISIZLIK DURUMUNDA**

- Validate kırıldıysa ödeme koduna değil mevcut license handler’a bak (bu planda dokunma).
- Token’ı URL/query’de görme; görürsen site kopyasını düzelt.

---

## 14. ONE_YEAR expiration testi

**KOMUT** (Adım 11’de `ONE_YEAR` siparişi)

```bash
# expiresAt ≈ now+1y (ms). 2099 olmamalı.
sudo python3 -c "
import json,time
db=json.load(open('/opt/ivplayer/license-server/data/licenses.json'))
code='DEVICE12CHARS'
lic=db['deviceLicenses'][code]
now=time.time()*1000
delta_days=(lic['expiresAt']-now)/86400000
print('plan', lic.get('planName'))
print('expiresAt', lic['expiresAt'])
print('days', round(delta_days,1))
"
```

Unit: `npm run license:test` (ONE_YEAR sunucu fiyatı / activate).

**BEKLENEN SONUÇ**

- `planName` 1 Yıl
- `days` ≈ 365 (364–367)
- `expiresAt` 2099 değil
- Süre dolunca (ileride) claim/validate `expired`; şimdi test cihazında tarihi elle 2099’a çekme

**BAŞARISIZLIK DURUMUNDA**

- Lifetime tarihi yazılmışsa plan karışmış — sipariş `plan` alanına bak.
- `days` 0 veya çok küçük → `activatedAt` yeniden basılmış (duplicate callback, Adım 9).

---

## 15. LIFETIME expiration testi

Ayrı test cihazı + sandbox **LIFETIME** siparişi (Adım 11 tekrarı, `PAYTR_TEST_MODE=1`).

**KOMUT** — Adım 14 ile aynı python, LIFETIME kodu.

**BEKLENEN SONUÇ**

- Mevcut sistem: `expiresAt` **2099-12-31** civarı (ms)
- `planName` Ömür Boyu
- `null` değilse bu temsil doğrudur; `claim` `expired` dönmemeli
- ONE_YEAR kaydının üzerine yazılmamalı (ayrı cihaz)

**BAŞARISIZLIK DURUMUNDA**

- +1 yıl yazılmışsa plan/fiyat karışması.
- Aynı cihazda year→lifetime üzerine yazma: `already_licensed` / `REVIEW_REQUIRED` beklenir; zorla overwrite yok.

---

## 16. Production secret scan

**KOMUT** (repo kökü; gerçek secret’ı komuta yapıştırma):

```bash
git ls-files | findstr /i "env json html js mjs ts tsx md" 
```

Windows (repo):

```powershell
git grep -i -E "PAYTR_MERCHANT_KEY|PAYTR_MERCHANT_SALT|merchant_salt|LICENSE_ADMIN_KEY" -- ':!.env.example' ':!license-server/.env.example' ':!license-server/deploy/ivplayer-license.env.example' ':!docs/payment/PRODUCTION-VALIDATION.md'
```

```powershell
git check-ignore -v license-server/data/licenses.json
git ls-files "*.env" ".env.production" "license-server/data/licenses.json"
```

**BEKLENEN SONUÇ**

- `licenses.json` tracked değil (`git check-ignore` ignore der)
- Git’te gerçek KEY/SALT/admin key **yok** (yalnızca boş example)
- `/etc/ivplayer-license.env` git’te değil
- `git ls-files` içinde `PayTR` canlı değer yok

**BAŞARISIZLIK DURUMUNDA**

- Secret commit’liyse **rotate** (PayTR + `LICENSE_ADMIN_KEY`), git geçmişinden temizleme ayrı prosedür.
- `licenses.json` tracked ise untrack et, commit etme (bu checklist’te payment koduna dokunma).

---

## 17. Frontend secret scan

**KOMUT** (repo):

```powershell
git grep -i -E "PAYTR_MERCHANT|merchant_key|merchant_salt|LICENSE_ADMIN_KEY|paytr_token" -- public-site src
Select-String -Path public-site\*.html,public-site\*.css,src\**\*.ts,src\**\*.tsx -Pattern "PAYTR_MERCHANT|merchant_key|merchant_salt|LICENSE_ADMIN_KEY" -ErrorAction SilentlyContinue
```

Canlı site:

```bash
curl -sS https://ivplayer.tr/activation.html | grep -iE 'merchant_key|merchant_salt|PAYTR_MERCHANT|LICENSE_ADMIN'
curl -sS https://ivplayer.tr/pay.html | grep -iE 'merchant_key|merchant_salt|PAYTR_MERCHANT'
curl -sS https://ivplayer.tr/order-status.html | grep -iE 'merchant_key|merchant_salt|PAYTR_MERCHANT'
```

**BEKLENEN SONUÇ**

- Eşleşme **yok** (grep exit 1 / boş)
- `activation.html` fiyatı `/v1/plans` ile çeker; hardcoded merchant yok
- `pay.html` iframe yalnızca `https://www.paytr.com/odeme/guvenli/`

**BAŞARISIZLIK DURUMUNDA**

- Secret HTML’de → siteyi geri çek, key rotate, frontend’i temiz kopyayla deploy.
- `pay.html` rastgele URL iframe’e alıyorsa deploy etme.

---

## 18. `npm run license:test`

**KOMUT** (repo kökü):

```bash
npm run license:test
```

**BEKLENEN SONUÇ**

```
tests 18
pass 18
fail 0
```

Özellikle: TEST 1–13, duplicate, amount, bad hash, frontend secret, existing-license kuralı.

**BAŞARISIZLIK DURUMUNDA**

- Fail varsa production deploy / `TEST_MODE=0` yok.
- Payment/license kodunu bu checklist kapsamında “hızlıca” değiştirme; test çıktısını kaydet.

---

## 19. `npm run tv:store-check`

**KOMUT**

```bash
npm run tv:store-check
```

**BEKLENEN SONUÇ**

- `Result: OK` (failure 0)
- `VITE_LICENSE_API_URL` public HTTPS (`https://license.ivplayer.tr`)
- `VITE_STORE_BUILD=true`
- İkon boyutları OK
- Ödeme LG üzerinden değil; uygulama ücretsiz istemci

**BAŞARISIZLIK DURUMUNDA**

- Failure → Seller upload yok.
- License URL localhost / `production.local` → store IPK üretme.
- Bu adım ödeme sandbox’ının yerine geçmez.

---

## 20. `nginx -t`

**KOMUT** (VPS):

```bash
sudo nginx -t
sudo systemctl reload nginx   # yalnız -t success ise
curl -sS https://license.ivplayer.tr/v1/health
curl -sS https://ivplayer.tr/activation.html -o /dev/null -w '%{http_code}\n'
```

**BEKLENEN SONUÇ**

- `syntax is ok` / `test is successful`
- Reload sonrası health 200, `activation.html` 200
- Callback location hâlâ 443 bloğunda (adım 3’ü reload sonrası tekrarla)

**BAŞARISIZLIK DURUMUNDA**

- `-t` fail → **reload yok**; conf geri al.
- Reload health kırdıysa `systemctl status ivplayer-license` + nginx error log.
- Apex 404 (`pay.html` / `order-status.html` yok) → `public-site` senkron; Adım 11’e geçme.

---

## Canlı ödeme (`PAYTR_TEST_MODE=0`) — yalnızca hepsi yeşilse

Şablon (şimdi çalıştırma):

```bash
# YALNIZCA: 1–20 yeşil VE Adım 11 PayTR panel Başarılı+OK VE claim/validate yeşil
sudo sed -i 's/^PAYTR_TEST_MODE=.*/PAYTR_TEST_MODE=0/' /etc/ivplayer-license.env
grep '^PAYTR_TEST_MODE=' /etc/ivplayer-license.env   # 0 olmalı
sudo systemctl restart ivplayer-license
curl -sS https://license.ivplayer.tr/v1/health
```

Sonra PayTR panelde mağazayı **canlı** al, Bildirim URL’yi tekrar doğrula, **küçük tutarlı gerçek kart** ile bir kez daha Adım 11–13.

Adım 11 kırmızıysa:

```bash
sudo sed -i 's/^PAYTR_TEST_MODE=.*/PAYTR_TEST_MODE=1/' /etc/ivplayer-license.env
sudo systemctl restart ivplayer-license
```

---

## Özet işaret kutuları

- [ ] 1 ENV + health `paymentConfigured`
- [ ] 2 Sandbox credentials + Bildirim URL
- [ ] 3 nginx `/v1/payments/` HTTPS vhost
- [ ] 4 HTTPS callback erişilir
- [ ] 5 POST imzasız → `OK` yok, lisans yok
- [ ] 6 HMAC unit + negatif canlı
- [ ] 7 Sunucu fiyatı; client amount yok
- [ ] 8 deviceCode = order = deviceLicense
- [ ] 9 Duplicate callback lisans uzatmaz
- [ ] 10 Fail ödeme ACTIVE yapmaz
- [ ] 11 **Gerçek PayTR sandbox** PAID + ACTIVE + panel OK
- [ ] 12 `/v1/claim`
- [ ] 13 `/v1/validate`
- [ ] 14 ONE_YEAR ~365 gün
- [ ] 15 LIFETIME ~2099
- [ ] 16 Git secret scan
- [ ] 17 Frontend secret scan
- [ ] 18 `npm run license:test` 18/18
- [ ] 19 `npm run tv:store-check` OK
- [ ] 20 `nginx -t` + reload

**PAYTR_TEST_MODE=0 izni:** yalnız yukarıdakilerin tümü ve Adım 11 gerçek callback.
