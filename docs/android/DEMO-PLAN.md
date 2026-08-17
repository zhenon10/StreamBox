# Android demo planı — IvPlayer

Hedef: **telefon yatay** ve isteğe bağlı **Android TV kutusu** üzerinde, 8–10 dakikada oynatıcıyı göstermek.  
Paket: `tr.ivplayer.android` · siteden sideload APK (`IvPlayer-1.0.0.apk`). Play AAB bu demoda yok.

Uygulama **TV kanalı / IPTV paketi satmaz**. Kullanıcı kendi M3U/M3U8 listesini yükler; sarı kabuk (ana sayfa + kategori + poster) gösterilir.

---

## Kim için

| Kanal | Süre | Cihaz |
|--------|------|--------|
| Satış / bayi | 8–10 dk | Telefon yatay (zorunlu) |
| İç QA / hata tarama | 15 dk | Telefon + TV kutusu |
| Play listing görselleri | 20 dk çekim | Telefon yatay + TV |

---

## Hazırlık (demo’dan 15 dk önce)

1. Siteden güncel APK: https://ivplayer.tr/downloads/IvPlayer-1.0.0.apk  
   Eski sürüm yüklüyse kaldır, yenisini kur.
2. Cihaz **yatay kilitli**, internet açık, otomatik döndürme kapalı.
3. Test lisansı: ilk açılışta **7 günlük deneme** otomatik başlar. Satın alma demosu için ayrıca siteden bu cihaz koduna bağlı lisans kullanın.
4. Test listesi: **senin yetkili olduğun** kısa M3U URL (canlı + en az bir film/dizi grubu). Büyük 9k dizi listesi demoyu yavaşlatır — yedek olarak küçük liste tut.
5. Yedek: aynı URL yazılı kâğıt / not; kod girişi için klavye.
6. Söylenecek cümle: “Ücretsiz oynatıcı + cihaz lisansını siteden alıyorsunuz, yayın sizin listeniz.”

**Yapılmayacak:** Play Store’da var demek; kanal paketi satmak; başkasının listesini “bizim içerik” diye göstermek.

---

## Senaryo A — Telefon (ana demo, ~8 dk)

Zamanlar yaklaşık; takılırsa B’ye atlama.

| Dk | Ekran | Ne göster | Beklenen |
|----|--------|-----------|----------|
| 0:00 | Kurulum / açılış | İkon, yatay tam ekran | Sarı **IvPlayer**, sürüm 1.0.0 |
| 0:20 | Ana sayfa | Cihaz kodu, **Deneme (7 gün)** | Canlı/Film/Dizi açılır; lisans satın almaya gerek yok |
| 1:20 | Liste | **Liste değiştir** → URL yapıştır → yükle | İlerleme sayısı, sonra ana sayfada liste adı |
| 2:00 | Canlı | **Canlı** kutusu | Sol kategoriler kayar, sağda kanal satırları + önizleme |
| 2:40 | Oynat | Bir kanal seç | Tam ekran oynatma, geri ile liste |
| 3:20 | Filmler | Ana sayfa / ray **Filmler** | Poster ızgarası **üst üste binmez**, kaydırılır |
| 4:20 | Diziler | **Diziler** + kategori değiştir | Altta sayfa okları (çok başlıkta `1 / N`) |
| 5:20 | Kalıcılık | Uygulamayı **kapat**, yeniden aç | Lisans Aktif, son liste adı durur (yeniden URL yok) |
| 6:20 | Ayarlar | ⚙ | Cihaz kodu, dil, lisans özeti |
| 7:00 | Kapanış | Ana sayfa, cihaz kodu | “Lisans siteden, içerik sizin listeniz” |

**Kesilirse:** liste yüklenmiyorsa yedek URL. Poster kaymıyorsa kategori değiştirip tekrar dene. Lisans düşerse **Yenile** (sunucu kısa kesinti).

---

## Senaryo B — Android TV kutusu (~5 dk, isteğe bağlı)

Aynı APK. Kumanda: D-pad + OK + Geri.

1. Launcher’dan IvPlayer.
2. Odak sarı çerçeve; **Canlı / Filmler / Diziler** OK.
3. Kategori listesinde aşağı; kanal/poster OK → oynatıcı.
4. Geri → liste; Geri → ana sayfa (Launcher’a düşmesin).
5. Parmak kaydırma yok; her şey D-pad.

**Fail:** Geri uygulamayı ilk ekrandan hemen kapatır; odak kaybolur; sarı kabuk yerine eski 10-ayak webOS menüsü çıkar (bu APK’da olmamalı).

---

## Senaryo C — Bilerek boz (QA, 5 dk)

1. Yanlış aktivasyon kodu → Türkçe hata, diyalog kapanmasın.
2. Uçağa al → **Yenile** → ağ hatası, çökme yok.
3. Uçak kapat, **Yenile** → lisans geri gelir (süre dolmamışsa).
4. Uygulamayı silmeden kapat/aç → lisans + liste durur.  
   **Sil-yükle** lisansı ve listeyi siler; bunu demoda “normal kapatma” diye gösterme.

---

## Ekran görüntüsü listesi (Play / site)

Yatay telefon, durum çubuğu sade, gerçek test listesi (marka logolarını kırpmadan yayınlama kararı sende).

1. Ana sayfa — Aktif lisans + liste adı + üç kutu  
2. Canlı — kategori + kanal listesi + önizleme  
3. Filmler — poster ızgarası, üst üste binmeden  
4. Diziler — kategori sarı seçili, sayfalama  
5. Oynatıcı — tek kanal, sade chrome  
6. (TV) Aynı ana sayfa + canlı, 16:9 kutu

---

## Konuşma metni (30 sn)

> IvPlayer ücretsiz bir medya oynatıcı. İlk 7 gün deneme lisansı otomatik açılır; kanalları biz vermiyoruz. Kendi M3U listenizi yükleyince Canlı, Film ve Dizi aynı sarı arayüzde açılır. Süre bitince lisans siteden alınır.

---

## Demo günü kontrol

- [ ] APK 1.0.0 siteden, eski sürüm silindi  
- [ ] Telefon yatay, internet var  
- [ ] Lisans bu cihaza bağlı  
- [ ] Küçük test M3U + yedek URL  
- [ ] Film/dizi posterleri kayıyor, üst üste binmiyor  
- [ ] Kapat-aç: lisans ve liste duruyor  
- [ ] “IPTV paketi / kanal satışı” cümlesi yok  
- [ ] Play Store’da canlıyız iddiası yok  

Bitti sayılır: bir izleyici 8 dakikada lisans → liste → canlı → film → kapat-aç döngüsünü görür, çökme olmaz.
