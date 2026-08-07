# AeroDrop.io

> A single-player (bot simulation) browser game that modernizes classic cell-growing (Agar.io) mechanics with water physics, a risk-reward based **Jet Boost** system, and the iconic **Frutiger Eco / Helvetica Aqua Aero** skeuomorphic aesthetic of the 2000s.

---

## 🎮 Proje Hakkında

**AeroDrop.io**, kısa oturumlarda (3–5 dakika) oynanabilen, refleks ve karar verme odaklı bir **casual .io aksiyon** oyunudur.  
Oyuncu, hücresini büyütmeye çalışırken su fiziğinin getirdiği sürüklenme ve momentum etkileriyle mücadele eder; doğru anda kullanılan **Jet Boost** ile yüksek riskli ama yüksek ödüllü hamleler yapar.

Bu proje, klasik hücre büyütme deneyimini nostaljik bir 2000’ler görsel diliyle yeniden yorumlar:
- Frutiger Eco etkili arayüz yaklaşımı
- Helvetica Aqua Aero skeuomorfik detaylar
- Yumuşak, parlak, “cam/plastik” hissi veren UI

---

## 🧠 Executive Summary

- **Oyun İsmi:** AeroDrop.io  
- **Tür:** Casual .io / Gerçek Zamanlı Aksiyon (Kütle Büyütme)  
- **Platform:** Tarayıcı (WebGL tabanlı, CrazyGames odaklı)  
- **Mod:** Tek oyunculu (bot simülasyonlu)  
- **Hedef Kitle:**  
  - 2000’ler nostaljik estetiğini sevenler  
  - Rahatlatıcı ama refleks gerektiren oyunlardan hoşlananlar  
  - Kısa süreli (3–5 dk) oyun oturumu arayanlar  

**Temel Vizyon:**  
Klasik Agar.io benzeri büyüme mekaniğini; su fiziği, risk-ödül odaklı Jet Boost ve retro-fütüristik Aero estetikle modern bir tarayıcı deneyimine dönüştürmek.

---

## ✨ Öne Çıkan Mekanikler

### 1) Kütle Büyütme Döngüsü
- Haritadaki kaynakları topla
- Daha küçük hedeflere baskı kur
- Kütleni artırarak kontrol alanını genişlet

### 2) Su Fiziği
- Hareket yalnızca “yön + hız” değil, **momentum** ve **sürüklenme** içerir
- Pozisyon alma, klasik .io oyunlarına göre daha taktiksel hale gelir

### 3) Jet Boost (Risk-Ödül)
- Anlık hız/patlama avantajı sağlar
- Yanlış kullanımda savunmasız bırakabilir
- Doğru zamanlama, oyunun skill ceiling’ini yükseltir

### 4) Bot Simülasyonu (Single-Player)
- Gerçek oyuncu baskısını simüle eden bot davranışları
- Akıcı, hızlı ve erişilebilir tek oyunculu deneyim

---

## 🎯 Tasarım Hedefleri

- **Öğrenmesi kolay**, ustalaşması tatmin edici bir kontrol hissi
- 3–5 dakikalık oturumlarda net “bir tur daha” motivasyonu
- Görsel ve işitsel olarak sakin ama oyun temposunda dinamik deneyim
- Klasik .io hissini korurken modern fizik ve estetikle ayrışma

---

## 🖼️ Sanat Yönetimi / Estetik

AeroDrop.io’nun kimliği:
- 2000’ler web estetiği
- Parlak yüzeyler, yumuşak gradient’ler, aqua tonlar
- Skeuomorfik butonlar ve “cam panel” UI yaklaşımı
- Retro nostalji + modern okunabilirlik dengesi

---

## 🕹️ Hedef Platform & Dağıtım

- **Ana Platform:** Web (WebGL)
- **Hedef Yayın Kanalı:** CrazyGames odaklı dağıtım
- **Oynanış Modeli:** Kısa, tekrar oynanabilir tekli oturumlar

---

## 🚀 Kurulum ve Çalıştırma

Gereksinim: Node.js 20+

```bash
npm install
npm run dev        # http://localhost:5173 - hot reload
npm run build      # tip kontrolü + dist/ üretimi
npm run preview    # dist/ klasörünü yerelde servis eder
npm run typecheck  # sadece tsc --noEmit
```

Oyun tamamen istemci taraflıdır: sunucu, backend veya harici asset yoktur.
`dist/` klasörü doğrudan statik hosting'e (veya CrazyGames zip'ine) konulabilir.
`vite.config.ts` içinde `base: './'` ayarlıdır, bu yüzden alt klasörden servis
edilmesi sorun çıkarmaz.

---

## 🎮 Kontroller

| Aksiyon | Masaüstü | Mobil |
| --- | --- | --- |
| Hareket | Fare imleci (veya WASD / ok tuşları) | Ekrana dokun ve sürükle |
| Jet Boost | `Space` veya sağ tık | `BOOST` düğmesi veya çift dokunuş |

İmlecin damlaya olan uzaklığı gaz pedalı gibi çalışır: küçük hareketler hassas
kontrol, ekranın öbür ucuna atılan bir hamle tam hız verir.

---

## 🗂️ Proje Yapısı

```
index.html            Oyun kabuğu + tüm UI markup'ı (lobi, HUD, mağaza, ölüm, sonuç)
src/
  main.ts             Boot: SDK + WebGL başlatma, UI callback'lerini bağlama, ticker
  style.css           Frutiger Aqua / skeuomorfik arayüz
  core/
    config.ts         TÜM denge sayıları tek dosyada (dünya, kütle, hız, boost, bot, reklam)
    math.ts           clamp / lerp / frame-rate bağımsız damp / format yardımcıları
    rng.ts            Deterministik mulberry32 PRNG
  game/
    world.ts          Simülasyon: fizik, çarpışma, yem grid'i, spawn, leaderboard
    entities.ts       Drop / Pellet veri modelleri
    bot.ts            Steering AI (yem ara / kaç / boost ile saldır)
    game.ts           Maç akışı; simülasyon, render, UI ve reklamlar arasındaki tutkal
    input.ts          Fare + klavye + dokunmatik, tek bir boost mandalında birleşir
    cosmetics.ts      Renk ve çekirdek eşya kataloğu
    names.ts          Retro bot isimleri + oyuncu ismi temizleme
  render/
    renderer.ts       PixiJS uygulaması ve hibrit sıvı render hattı
    metaballFilter.ts Renk koruyan alpha threshold shader'ı (metaball birleşmesi)
    dropView.ts       Damla görseli: silüet + specular + çekirdek eşya + isim etiketi
    textures.ts       Tüm dokular runtime'da canvas ile üretilir (harici PNG yok)
    innerItems.ts     Çekirdek eşya ikonları (vektörden dokuya bake edilir)
    background.ts     Derinlik gradyanı, caustics, grid, yükselen baloncuklar
    camera.ts         Kütleye göre yumuşak zoom-out
    fx.ts             Havuzlanmış additive partiküller
    labels.ts         Piksel görünümlü isim etiketleri (nearest-neighbour upscale)
  ui/
    ui.ts             Tüm DOM etkileşimi; simülasyon hiçbir elemente dokunmaz
    minimap.ts        2D canvas radar
  audio/sfx.ts        WebAudio ile sentezlenen sesler (ses dosyası yok)
  platform/crazygames.ts  CrazyGames SDK v3 sarmalayıcısı + yerel yedek
  save.ts             localStorage profili (kozmetikler, rekorlar, ses tercihi)
```

---

## 🧪 Teknik Mimari

### Hibrit sıvı render (3 katman)

Damlalar iki ayrı katmanda çizilir:

1. **Metaball katmanı** — her damlanın silüeti tek bir `Container` içinde toplanır
   ve sırayla `DisplacementFilter` (jöle titremesi) → `BlurFilter` → alpha
   threshold uygulanır. Damlalar yaklaştığında bulanık alfa alanları toplanır ve
   eşiği aştığı yerde **sıvı köprüsü** oluşur.
2. **Keskin katman** — specular highlight, iç gölge, çekirdek eşya ve isim
   etiketi filtresiz olarak üstte çizilir. Işık yönü sabit kalır; damla hız
   yönünde esnerken bile cam hissi bozulmaz.

Threshold için PixiJS'in hazır `ColorMatrixFilter`'ı kullanılmadı: o shader
sonucu yükseltilmiş alfa ile yeniden premultiply ettiği için her damlayı beyaza
patlatıyor. Bunun yerine `metaballFilter.ts` içinde rengi bozmayan küçük bir
GLSL geçişi var (`smoothstep` ile eşikleme, renk aynen korunur).

Blur ve displacement ekran uzayında çalıştığı için her karede kamera zoom'una
göre yeniden ölçeklenir — böylece efekt dünya birimlerinde sabit görünür.

### Sıfır harici asset

Tüm dokular (damla silüeti, specular PNG karşılığı, caustics, perlin noise,
yem, baloncuk) açılışta canvas ile üretilir; sesler WebAudio ile sentezlenir;
isim etiketleri küçük çizilip nearest-neighbour ile büyütülerek piksel font
görünümü elde eder. Bu sayede oyun tek bir JS+CSS paketi olarak dağıtılır.

### Bot yapay zekası

Her bot her karede üç kurala göre karar verir (tasarım dokümanındaki sırayla):
yakındaki yemlere yönel, görüş alanına giren **%10 daha büyük** bir düşmandan
kaç, yutabileceği bir kurban görürse **Jet Boost** ile saldır. Tehdit her zaman
açlığın önüne geçer; harita kenarı da hafif bir tehdit olarak sayılır, böylece
botlar duvara sıkışmaz. Her botun kendi saldırganlık/temkinlilik katsayısı
vardır.

### Denge ayarları

Oynanışa dair bütün sayılar `src/core/config.ts` içindedir — dünya boyutu, yem
sayısı, kütle→yarıçap ve kütle→hız eğrileri, boost bedeli/itkisi/bekleme süresi,
bot görüş mesafesi, kamera zoom eğrisi ve reklam kuralları. Denge çalışması için
başka dosyaya dokunmak gerekmez.

---

## 💰 CrazyGames Entegrasyonu

`src/platform/crazygames.ts` SDK v3'ü sarmalar ve **SDK yokken de çalışır**:
yerel geliştirmede ödüllü reklam yerine kısa bir geri sayım overlay'i gösterilir
ve ödül yine verilir, böylece tüm ödül akışları platform dışında da test
edilebilir.

| Konum | Tür | Ödül |
| --- | --- | --- |
| Ölüm ekranı | Rewarded | İkinci şans: ölüm anındaki kütlenin %50'si ile dön (maç başı 1) |
| Lobi | Rewarded | Aero Drop Boost: sonraki maça 2x kütle ile başla |
| Mağaza | Rewarded | Kilitli renk veya çekirdek eşyayı kalıcı olarak aç |
| Maç sonu → lobi | Interstitial | Platform kurallarına uygun bekleme süresiyle |

Ödül yalnızca reklam gerçekten tamamlandığında verilir (`adFinished`); hata veya
iptal durumunda oyuncuya bilgi mesajı gösterilir. Reklam süresince oyun sesi
tamamen kısılır ve `gameplayStart` / `gameplayStop` sinyalleri gönderilir.

---

## 🚧 Proje Durumu

Çekirdek oyun döngüsü oynanabilir durumda: su fiziği, Jet Boost, bot simülasyonu,
metaball sıvı render'ı, kozmetikler, 5 dakikalık maç akışı ve reklam entegrasyonu
uçtan uca çalışıyor.

- [x] Çekirdek hareket + su fiziği
- [x] Jet Boost (kütle bedeli, itki, cooldown)
- [x] Bot AI (yem arama / kaçma / boost ile saldırı, kişilik dağılımı)
- [x] Metaball sıvı render + Frutiger Aqua UI
- [x] Kozmetikler (renk + çekirdek eşya) ve localStorage profili
- [x] CrazyGames SDK entegrasyonu (rewarded + interstitial, yerel yedek)
- [ ] Ek denge turu (uzun oturum verisiyle kütle eğrisi)
- [ ] Daha fazla çekirdek eşya ve sezonluk kozmetik
- [ ] Düşük donanım profili (filtresiz "performance" modu)

---

## 🤝 Katkı

Katkı sağlamak istersen:
1. Issue açarak önerini paylaş
2. Fork al ve branch oluştur
3. Pull Request gönder

Kod değişikliklerinden önce `npm run build` çalıştır: tip kontrolü ve derleme
aynı komutta yapılır.

---

## 📄 Lisans

Lisans bilgisi için repo içindeki `LICENSE` dosyasına bakın.  
(Eğer henüz eklenmediyse lisans türü ayrıca tanımlanmalıdır.)
