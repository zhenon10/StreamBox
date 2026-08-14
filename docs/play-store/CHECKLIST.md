# Google Play — Self checklist (IvPlayer)

Sıralı plan: **[ROADMAP.md](./ROADMAP.md)**.

Paket: `tr.ivplayer.android` · Play’e **AAB** · sideload APK ayrı kanal.

---

## 0. Politika kararı

- [x] Android Play yapısında lisans satışı yalnız **Play Billing** (karar; Billing kodu sonraki faz)
- [x] Play AAB’de `https://ivplayer.tr/activation.html` açılmıyor (`VITE_PLAY_STORE`)
- [x] Play AAB’de “Siteden satın al” / site fiyatı yok
- [x] “Lisansı kontrol et” siteden alınmış lisansı geri yükler (satın almaya yönlendirmez)
- [x] PayTR web / Windows / LG / siteden APK’da durur
- [ ] Listing: medya oynatıcı + kendi M3U; IPTV / kanal paketi yok

## 1. Play Console

- [ ] Geliştirici hesabı açık, kimlik doğrulandı
- [ ] Uygulama `tr.ivplayer.android` taslağı var
- [ ] Kapalı test track’i + güncel tester kuralı okundu
- [ ] IARC içerik derecesi
- [ ] Data safety taslağı
- [ ] Destek e-posta `destek@ivplayer.tr`

## 2. İmza + AAB

- [x] Upload keystore üretildi (git dışı, yedekli) — `npm run android:upload-key`
- [x] `keystore.properties` gitignore
- [x] `signingConfigs.release` bağlı
- [x] `bundleRelease` AAB üretiyor (`npm run android:play`)
- [x] Sideload hâlâ ayrı `assembleDebug` / siteden APK
- [ ] Play App Signing açık; ilk AAB upload key ile yüklendi
- [ ] `versionCode` / `versionName` tutarlı
- [ ] 16 KB sayfa hizalama (AAB / Play ön kontrol) yeşil
- [ ] Debug imzalı paket Play’e yüklenmedi

## 3. Play Billing — istemci

- [ ] Play Console’da `ivplayer_one_year` ve `ivplayer_lifetime` (one-time)
- [ ] Native Play Billing (test satın alma)
- [ ] Play build: satın al = Billing; site URL yok
- [ ] `purchaseToken` + cihaz kodu sunucuya gidiyor
- [ ] Aynı token ikinci kez lisans açmıyor
- [ ] Restore / queryPurchases çalışıyor
- [ ] Lisanssız store build’de URL/dosya/playlist yok (mevcut `VITE_STORE_BUILD`)

## 4. Play Billing — sunucu

- [ ] Play Developer API servis hesabı (VPS env, git yok)
- [ ] `POST /v1/payments/play/verify` (veya eşdeğeri) — **claim/activate değişmez**
- [ ] Google token doğrulaması başarısızsa lisans **ACTIVE olmaz**
- [ ] Plan map: one_year / lifetime = mevcut süreler
- [ ] İade/iptal (RTDN veya voided purchases) lisansı düşürür
- [ ] PayTR kayıtları ile Play token’ları ayrı

## 5. Yasal / metin

- [ ] `privacy.html`: Play Billing + artık Play dağıtımı (eski “Play kullanılmaz” kalkar)
- [ ] Data safety: cihaz kodu, lisans, satın alma, ağ
- [ ] Play kısa/uzun açıklama = sitedeki satış çizgisi (içerik satılmaz)
- [ ] Play fiyatı Console’dan; 299/799 TL Play metninde yok

## 6. Listing varlıkları

- [ ] 512×512 yüksek çözünürlük ikon
- [ ] 1024×500 feature graphic
- [ ] Telefon ekran görüntüleri (Home, lisans, kanallar, oynatıcı)
- [ ] Android TV form faktörü + ekran görüntüleri
- [ ] TV banner 320×180 (mevcut `tv_banner.png`)
- [ ] Gizlilik URL `https://ivplayer.tr/privacy.html`
- [ ] Destek URL `https://ivplayer.tr/support.html`

## 7. QA

- [ ] Internal/kapalı test: gerçek Play test satın alması → lisans açılır
- [ ] Siteden alınmış lisans: Play uygulamasında “Lisansı kontrol et”
- [ ] Telefon yatay arama / silme
- [ ] Android TV D-pad + Back
- [ ] Ağ yok / lisans API hata mesajı (çökme yok)
- [ ] İnceleme gönderildi; canlı olmadan sitede Play linki yok
