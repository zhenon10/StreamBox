# Play Store yol haritası — IvPlayer

Hedef: Google Play’de **ücretsiz medya oynatıcı** + **uygulama içi yazılım lisansı**.  
Paket: `tr.ivplayer.android` · Telefon + Android TV (tek AAB).

Site sideload APK’sı Play paketi değildir. Play’e yalnız **imzalı AAB** gider.

`/v1/activate` · `/v1/validate` · `/v1/deactivate` · `/v1/claim` **değiştirilmez**.  
PayTR web / Windows / LG / sideload için kalır.

---

## Karar (kilit)

Play’de dijital lisans satışı **Play Billing** ile yapılır. Android Play yapısından siteye ödeme yönlendirmesi (activation.html, “Siteden satın al”, fiyat) **yasak**.

| Kanal | Ödeme | Lisans |
|-------|--------|--------|
| Play (telefon / Android TV) | Google Play Billing | Cihaz koduna bağlanır (yeni Play doğrulama yolu) |
| Web / Windows / LG / siteden APK | PayTR (mevcut) | Mevcut claim / cihaz kodu |
| Play uygulamasında “Lisansı kontrol et” | Satın alma yok | Siteden alınmış lisansı **geri yükler** (yönlendirme yok) |

Play, yeni uygulamalarda **Play App Signing** zorunlu. Sitedeki APK farklı imza taşır; Play kurulumu üzerine yazılmaz. İki kanal ayrı kalır.

---

## Şu an neredeyiz

| Alan | Durum |
|------|--------|
| Sideload debug APK | Var (`npm run android:build`) |
| Release keystore / `signingConfig` | İskelet hazır — `npm run android:upload-key` |
| `bundleRelease` / AAB | İskelet hazır — `npm run android:play` (`--mode play`) |
| Play Billing | Yok (sonraki faz) |
| Play APK’da siteye satın al CTA | Play build’de kesildi (`VITE_PLAY_STORE`) |
| `targetSdk` 36, TV banner 320×180 | Hazır |
| Gizlilik / destek URL | Hazır |
| Play Console uygulama kaydı | Hesap sende |

Sıra: karar uygulaması (CTA kes) → imza + AAB → Play Billing + sunucu doğrulama → listing → kapalı test.

---

## Faz 0 — Play Console (paralel)

Teknik işi bekletmez; erken başla.

1. Bireysel Play Console hesabı (bir kerelik kayıt ücreti) + kimlik doğrulama.
2. Uygulama oluştur: `tr.ivplayer.android`, kategori Video oynatıcı / medya.
3. Yeni bireysel hesap kuralı: kapalı test (testeri sayısı + süre Play Console’daki güncel forma göre).
4. Satıcı: Mehmet Burak Fırat, İvrindi / Balıkesir; destek `destek@ivplayer.tr`.
5. Hedef ülkeler (TR önce), IARC içerik derecesi, Data safety taslağı.

**Bitti sayılır:** Console’da uygulama taslağı var; kapalı test track’i açık.

---

## Faz 1 — İmza zinciri + AAB (bloklayıcı)

1. Upload keystore üret (repo ve yedek **dışında**; şifreyi Password Manager’da tut).
2. `android/keystore.properties` gitignore; `signingConfigs.release` yalnız release.
3. `versionCode` / `versionName` (ilk yükleme: 1 / 1.0.0).
4. `scripts/package-android.mjs` yanına store hedefi: `bundleRelease` → `dist-android/IvPlayer-1.0.0.aab`. Sideload `assembleDebug` ayrı kalsın.
5. Play App Signing: ilk AAB’yi upload key ile yükle; Google app signing key’i tutar.
6. 16 KB native hizalama: AAB Analyzer / Play ön kontrol. AGP 8.13 var; `.so` varsa doğrula.
7. `usesCleartextTraffic` Play incelemesinde açıklanır (kullanıcı HTTP M3U’su); mümkünse `networkSecurityConfig` ile sınırla.

**Bitti sayılır:** imzalı AAB üretiliyor; Play “App signing” sayfasında upload key kayıtlı; debug APK Play’e yüklenmiyor.

---

## Faz 2 — Play Billing (bloklayıcı)

Mevcut PayTR / claim sözleşmesine dokunma. Play satın alması **yeni** sunucu yolu.

### Console ürünleri

- `ivplayer_one_year` — 1 yıl (Play fiyatı; komisyon Play’de)
- `ivplayer_lifetime` — ömür boyu
- Yönetilen ürün (one-time), abonelik değil (mevcut model tek seferlik)

### Android istemci

1. Play Billing Library (Capacitor native plugin veya ince Java köprüsü). Sahte satın alma yok.
2. Play yapısında: satın al → `purchaseToken` + `productId` + cihaz kodu sunucuya.
3. `window.open(activation.html)` ve “Siteden satın al” **yalnız Play build’de kalkar**.
4. Cihaz kartı: kod + “Lisansı kontrol et” + (Play’de) “Lisans satın al” = Billing akışı.
5. Satın alma geri yükleme: Play `queryPurchases` + sunucu doğrulama (aynı token iki kez lisans açmaz).

### Lisans sunucusu

1. Google Play Developer API (servis hesabı JSON; VPS env, git yok).
2. Yeni endpoint örn. `POST /v1/payments/play/verify` — token’ı Google’dan doğrula, planı map et, cihaz koduna lisans bağla. `activate` / `claim` gövdesi değişmez.
3. İade / iptal: Real-time developer notifications (Pub/Sub) veya periyodik `voidedPurchases`; lisans iptal.
4. PayTR siparişleri ve Play token’ları ayrı kayıtlarda; karıştırma.

**Bitti sayılır:** internal/kapalı test hesabıyla gerçek Play test satın alması → lisans `ACTIVE` + uygulamada “Lisansı kontrol et” yeşil. Sandbox/license-test sahte webhook yok.

---

## Faz 3 — Play APK politika yüzeyi

1. Play listing ve uygulama metni: medya oynatıcı, kullanıcının kendi M3U’su; IPTV / kanal paketi yok.
2. Gizlilik: Play Billing / Google hesap kimliği + mevcut cihaz kodu; `privacy.html` güncelle (şu an “Play Store kullanılmaz”).
3. Data safety formu: satın alma, cihaz kimliği, ağ.
4. Mağaza içi fiyat = Console fiyatı; sitedeki 299 / 799 TL Play metninde reklam edilmez.

**Bitti sayılır:** Play AAB’de site ödeme URL’si yok; gizlilik Play’i anlatıyor.

---

## Faz 4 — Listing varlıkları

1. 512×512 ikon (Play maskesi; köşeleri Play yuvarlar).
2. Feature graphic 1024×500.
3. Telefon yatay ekran görüntüleri: Home, lisans, kanallar, oynatıcı.
4. Android TV: TV banner (320×180 mevcut), TV ekran görüntüleri, TV form faktörü.
5. Kısa / uzun açıklama TR (gerekirse EN). Destek ve gizlilik URL.

**Bitti sayılır:** Console listing kırmızı zorunlu alan yok.

---

## Faz 5 — QA ve yayın

1. Telefon + ucuz Android TV kutusunda sideload **release** (Play internal track).
2. Lisanssız: playlist yok; Play satın alma veya claim sonrası URL/dosya açılır.
3. Geri / arama / yatay telefon / D-pad TV.
4. Kapalı test süresi dolunca üretim incelemesi.

**Bitti sayılır:** kapalı test yeşil + inceleme gönderildi. Canlı demeden sitede “Play Store’da” yazılmaz.

---

## Yapılmayacaklar

- Keystore / Play servis hesabı / `licenses.json` commit.
- Debug APK’yı Play’e yüklemek.
- Play AAB içinde PayTR veya `activation.html` satın alma.
- `activate` / `validate` / `deactivate` / `claim` kırılması.
- Play’de IPTV / kanal vaadi.
- Sitedeki sideload APK’yı durdurmak (ayrı kanal).
