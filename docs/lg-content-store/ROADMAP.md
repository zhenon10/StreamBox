# Seller Lounge yol haritası — IvPlayer

Hedef: [LG Seller Lounge](https://seller.lgappstv.com/) üzerinden **LG Content Store** yüklemesi.  
App ID: `com.ivplayer.iptv` · Store build: `VITE_STORE_BUILD=true`

Emülatör IPK’si (`10.0.2.2`) **mağaza paketi değildir**. Mağaza IPK’si public HTTPS lisans API ile üretilir.

---

## Şu an neredeyiz

| Alan | Durum |
|------|--------|
| IPK iskeleti, ikonlar, splash, `appinfo.json` | Hazır |
| `npm run tv:store-check` | Geçiyor |
| Store build (URL/dosya ile playlist yok) | Kodda hazır |
| Lisans API public HTTPS | **Hazır** — `https://license.ivplayer.tr` |
| Canlı gizlilik / destek URL | HTTP canlı (`http://ivplayer.tr/…`); **HTTPS + eski DNS A kaydı temizliği bekleniyor** |
| Gerçek TV QA | **Eksik** |
| Seller Lounge hesap / listing | **Eksik** |

Sıra: apex DNS temizle + HTTPS site → gerçek TV → listing → yükleme.

---

## Faz 0 — Seller hesabı (paralel, 1–3 gün)

Bunlar teknik işi bekletmez; erken başla.

1. Seller Lounge şirket hesabı (tüzel kişi, vergi/adres).
2. Geliştirici sözleşmesi ve ödeme / vergi bilgisi.
3. Hedef ülkeler ve yaş derecesi (genel izleyici / TV).
4. Destek e-posta kutusu: örn. `destek@…` (Seller’da görünecek).

**Bitti sayılır:** hesaba giriş var, şirket profili kaydedildi.

---

## Faz 1 — Üretim lisans sunucusu (bloklayıcı)

Mağaza IPK’si TV’den `https://…` adresine gidecek. LAN / `10.0.2.2` / localhost kabul edilmez.

1. `license-server`’ı VPS’e koy (HTTPS). Hedef: `https://license.ivplayer.tr`.
2. TLS sertifikası (Let’s Encrypt veya sağlayıcı).
3. `LICENSE_ADMIN_KEY`’i güçlü bir sır yap; default `ivplayer-admin` kullanma.
4. Admin paneli sadece senin erişimine (VPN / IP kısıtı önerilir).
5. CORS zaten `*`; TV’den `POST /v1/activate` ve `GET /v1/stream-proxy` dene.
6. `.env.production` içine yaz:

   ```
   VITE_STORE_BUILD=true
   VITE_LICENSE_API_URL=https://license.ivplayer.tr
   ```

   `.env.production.local` emülatör içindir; **mağaza paketinde olmamalı** (veya aynı HTTPS’i göstermeli).

7. `npm run tv:store-check` — lisans URL uyarısı kaybolmalı.

**Bitti sayılır:** telefondan/PC’den `https://…/v1/health` → `{"ok":true}`; TV veya emülatör bu host’a activate edebiliyor.

---

## Faz 2 — Yasal ve listing metinleri (bloklayıcı)

Şablonlar: `PRIVACY-TEMPLATE.md`, `SUPPORT-TEMPLATE.md`.

1. Gizlilik politikasını HTTPS sitede yayınla (şablonu doldur, avukat bakışı önerilir).
2. Destek sayfası: e-posta, saat, dil (TR/EN).
3. Seller’da Privacy URL + Support URL aynı canlı linkler.
4. Uygulama kısa açıklama (appinfo 60 karakter) + mağaza uzun açıklama (TR, gerekirse EN).
5. Kategori: Media / Video player. Korsan / “ücretsiz IPTV listesi” vaadi yok.
6. Yayın hakları: sadece abonelik kodu olan kullanıcının kendi kaynağı; uygulamada açık M3U yok (store build bunu zaten kapatıyor).

**Bitti sayılır:** iki URL tarayıcıda açılıyor; `SUPPORT-TEMPLATE.md` tabloları gerçek değerlerle dolu.

---

## Faz 3 — Gerçek LG TV QA (bloklayıcı)

Emülatörde ses+siyah ekran **QA fail** riski. Asıl kanıt gerçek webOS TV.

Cihaz: mümkünse webOS 6 ve daha yeni bir model. Developer Mode + `ares-install`.

Komut (TV adı Seller/CLI’deki device id):

```bash
npm run tv:store-check
npm run tv -- all --device <tv-adi>
```

`CHECKLIST.md` ve `UX-SCENARIO.md` senaryolarını **kumanda ile** işaretle:

| Senaryo | Beklenen |
|---------|----------|
| A İlk açılış + aktive | Splash → Home → Aktive et → kanallar. URL/dosya yok. |
| B Oynatma | Kanal → görüntü+ses veya net hata. Back listeye döner. Ch± / Pause. |
| C Lisans kaldır | Settings → lisans kalkar, içerik gizlenir. |
| D Hatalar | Yanlış kod TR mesaj. Ağ kesilince çökme yok. |
| E Relaunch | Home’dan geri açılınca siyah kilit yok. |
| Stabilite | Player’ı 10 kez aç/kapa. Büyük playlist’te kategori grid’i donmasın. |

**Bitti sayılır:** senaryo A–E gerçek TV’de geçti; oynatma en az birkaç H.264 kanalda görüntülü.

---

## Faz 4 — Mağaza görselleri

Seller Lounge genelde FHD ekran görüntüsü ister (1920×1080).

Çekilecek kareler (TV’den, overlay temiz):

1. Home — **Aktive et** odaklı
2. Aktivasyon diyaloğu
3. Kanallar (kategori veya liste)
4. Player (görüntü varken)

İkon: `webos/store/store-icon-400.png` (400×400) — Seller’a ayrıca yüklenir.

**Bitti sayılır:** 4 ekran görüntüsü + 400px ikon klasörde / Seller formunda.

---

## Faz 5 — Store IPK ve yükleme paketi

1. Sürüm: ilk yükleme `1.0.0`. Red sonrası **mutlaka bump** (`1.0.1`) — aynı sürüm iki kez yüklenmez.
2. `.env.production` HTTPS + `VITE_STORE_BUILD=true` iken:

   ```bash
   npm run tv:store-check
   npm run tv:package
   ```

3. Çıkan `com.ivplayer.iptv_<sürüm>_all.ipk` — emülatör local env ile karıştırma.
4. LG’nin resmi **App Self Checklist** Excel’ini `CHECKLIST.md` sonuçlarıyla doldur.
5. `UX-SCENARIO.md` + **QA için ayrı aktivasyon kodu** (müşteri kodu değil, cihaz limiti yeterli).

**Yükleme klasörü (Seller’a):**

- IPK
- 400×400 ikon
- Ekran görüntüleri
- Privacy URL, Support URL
- Self-checklist
- UX senaryosu
- Test kodu (gizli not / test account alanı)

**Bitti sayılır:** Seller’da “submit” basıldı, durum *In Review* / eşdeğeri.

---

## Faz 6 — LG incelemesi ve red döngüsü

Tipik red nedenleri bu projede:

- Oynatma siyah / sürekli hata
- Back tuşu uygulamadan beklenmedik çıkış
- Lisans API’ye TV’den erişilememesi (HTTP, yanlış host, timeout)
- Gizlilik URL 404
- Store build’de URL/file picker görünmesi
- Açıklamada korsan ima

Red gelirse: düzelt → `appinfo.json` version +1 → yeni IPK → aynı paketle tekrar.

---

## Önerilen takvim (tek kişi)

| Hafta | İş |
|-------|-----|
| 1 | Faz 0 hesap + Faz 1 sunucu/HTTPS |
| 1–2 | Faz 2 site metinleri |
| 2 | Faz 3 gerçek TV QA (oynatma kilit ise burada dur) |
| 3 | Faz 4 görseller + Faz 5 yükleme |
| 3+ | Faz 6 inceleme (LG süresine bağlı) |

Oynatma TV’de geçmeden Faz 5’e geçme.

---

## Hızlı komutlar

| Amaç | Komut |
|------|--------|
| Store ön kontrol | `npm run tv:store-check` |
| Emülatör (local lisans) | `.env.production.local` + `npm run tv -- all` |
| Mağaza IPK | HTTPS `.env.production` + `npm run tv:package` |
| TV’ye kur | `npm run tv -- all --device <ad>` |

---

## Karar kapıları

1. **HTTPS lisans yok** → IPK yükleme yok.  
2. **Gerçek TV’de görüntüsüz oynatma** → inceleme fail; önce codec/player.  
3. **Privacy/support 404** → listing reddi.  
4. Hepsi yeşil → Seller submit.
