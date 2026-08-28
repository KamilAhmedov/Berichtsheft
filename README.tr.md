<div align="center">

<img src="resources/icon.png" alt="Berichtsheft" width="96">

# Berichtsheft

**Almanya'daki Ausbildung raporu (Ausbildungsnachweis) için masaüstü uygulaması — çevrimdışı, hesapsız, PDF çıktılı.**

[Deutsch](README.md) · [English](README.en.md) · [Türkçe](README.tr.md)

</div>

---

> **Not:** Bu uygulama yapay zeka desteğiyle geliştirildi — tasarım, kod ve
> dokümantasyon Claude (Anthropic) ile birlikte hazırlandı.

## Bu nedir?

Almanya'da Ausbildung (mesleki eğitim) yapan herkes **Ausbildungsnachweis** tutmak
zorundadır — halk arasındaki adıyla *Berichtsheft*. Her hafta firmada ne yapıldığı ve
meslek okulunda ne öğrenildiği yazılır, eğitmen imzalar. Defter eksikse IHK sınavına
girme hakkı doğmaz.

Pratikte bu iş bir Word şablonuyla ya da kağıt defterle yürütülür. Haftalar birikir,
düzen bozulur, sonunda üç aylık kayıt bir gecede tamamlanmaya çalışılır.

Bu uygulama işi sadeleştiriyor: haftayı seç, yaz, bitti. Takvim haftası ve eğitim yılı
otomatik hesaplanır, eksik haftalar gösterilir, tek tuşla IHK tarzı PDF üretilir.

## Ekran görüntüleri

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/01-uebersicht.png" alt="Genel bakış: ilerleme ve açık haftalar"></td>
    <td width="50%"><img src="docs/screenshots/02-wochenliste.png" alt="Bütün haftalık raporların listesi, arama ve filtreler"></td>
  </tr>
  <tr>
    <td align="center"><sub>Genel bakış — ilerleme, bu hafta ve açık haftalar</sub></td>
    <td align="center"><sub>Haftalar — arama, filtre ve durum rozetleriyle bütün raporlar</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/03-wochenbericht.png" alt="Günlük kayıt biçiminde haftalık rapor"></td>
    <td width="50%"><img src="docs/screenshots/04-einstellungen.png" alt="Koyu temada ayarlar"></td>
  </tr>
  <tr>
    <td align="center"><sub>Haftalık rapor — hazır metinlerle günlük kayıt</sub></td>
    <td align="center"><sub>Ayarlar — koyu tema, dil, veri konumu</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/05-pdf-klassisch.png" alt="Klasik düzende PDF çıktısı"></td>
    <td width="50%"><img src="docs/screenshots/06-pdf-modern.png" alt="Modern düzende PDF çıktısı"></td>
  </tr>
  <tr>
    <td align="center"><sub>PDF — klasik düzen, IHK formunu esas alır</sub></td>
    <td align="center"><sub>PDF — modern düzen, net tipografi</sub></td>
  </tr>
</table>

## Özellikler

- **İki kayıt biçimi**: günlük (her iş günü için bir satır; izin/raporlu/resmi tatil işaretlenebilir) veya haftalık metin
- **Haftalık raporlar** — firmadaki çalışmalar, meslek okulu ve eğitimler, her biri saat bilgisiyle
- **ISO 8601 takvim haftası** — dönem ve eğitim yılı kendiliğinden hesaplanır
- **Eksik hafta uyarısı** — geçmişte kalan boş haftalar genel bakışta anında görünür
- **PDF çıktısı**, iki düzende: *Klasik* (basılı forma benzer) ve *Modern*
- **Hazır metinler** — tekrarlanan işleri bir kez yaz, tek tıkla ekle
- **Hafta durumu**: Taslak → Teslim edildi → İmzalandı
- **Üç dil**: Deutsch, English, Türkçe
- **Açık ve koyu tema**, istenirse Windows ayarını takip eder
- **Dışa/içe aktarma** tek JSON dosyasıyla — başka bilgisayara taşımak iki adım
- **Otomatik yedek** — son on hal; uygulama içinde listelenir, tek tıkla geri yüklenir
- **İstatistik** — aylara göre saat, günlerin dağılımı, duruma göre haftalar
- **Yazım denetimi** — arayüz dilinde, sağ tıkla düzeltme önerisi

## Verilerim nerede?

Uygulamanın **sunucusu, hesabı ve internet bağlantısı yoktur**. Her şey bilgisayarındaki
bir SQLite dosyasında durur:

```
%APPDATA%\Berichtsheft\
├── data\berichtsheft.db     ← bütün raporlar
└── backups\                 ← son on otomatik yedek
```

Bu klasörü uygulama içinden **Ayarlar → Veriler → Klasörü aç** ile açabilirsin.
Uygulamayı kaldırsan bile bu klasör silinmez.

Başka bir bilgisayara taşımak için: **Ayarlar → Verileri dışa aktar** ile JSON dosyasını
kaydet, diğer bilgisayarda **Verileri içe aktar** ile o dosyayı seç. Hepsi bu.

## Kurulum

### Hazır sürümü indir (önerilen)

[**Releases**](https://github.com/KamilAhmedov/Berichtsheft/releases) sayfasında iki dosya var:

| Dosya | Ne işe yarar |
| --- | --- |
| `Berichtsheft-Setup-1.1.0.exe` | Normal kurulum — Başlat menüsüne ve masaüstüne kısayol ekler |
| `Berichtsheft-1.1.0-portable.exe` | Kurulumsuz — çift tıkla çalışır, USB bellekten bile açılır |

> **Windows SmartScreen uyarısı hakkında**
> Dosyalar ücretli bir sertifikayla imzalanmadığı için Windows ilk açılışta
> „Windows bilgisayarınızı korudu" uyarısı gösterir. **Ek bilgi** yazısına, ardından
> **Yine de çalıştır** düğmesine tıklaman yeterli. Projenin kaynak kodu tamamen açık ve
> kurulum dosyaları GitHub Actions tarafından bu koddan üretiliyor.

### Kaynak koddan kendin derle

Programlama bilmeden de yapılabilir, adımların hepsi burada.

**1. Node.js kur**

Node.js, uygulamanın derlenmesini sağlayan ortamdır.
[nodejs.org](https://nodejs.org) adresinden **LTS** sürümünü indir ve kur (kurulumdaki
bütün varsayılan ayarlar olduğu gibi kalabilir). Sonra bilgisayarı yeniden başlat ya da
en azından açık bütün terminal pencerelerini kapat.

Kontrol etmek için yeni bir terminal açıp şunu yaz:

```bash
node -v
```

`v20.10.0` gibi bir sürüm numarası çıkıyorsa kurulum tamam.

**2. Kaynak kodu indir**

Git kuruluysa:

```bash
git clone https://github.com/KamilAhmedov/Berichtsheft.git
cd berichtsheft
```

Git yoksa: bu sayfanın üstündeki yeşil **Code** düğmesine → **Download ZIP** de,
dosyayı çıkart ve oluşan klasörü aç.

**3. O klasörde terminal aç**

Dosya Gezgini'nde proje klasörüne gir, klasörün boş bir yerine **Shift + sağ tık** yap ve
**PowerShell penceresini burada aç** seçeneğini tıkla. Alternatif olarak Gezgin'in adres
çubuğuna `powershell` yazıp Enter'a basabilirsin.

**4. Gereken paketleri kur**

```bash
npm install
```

Bu komut gerekli paketleri indirir; ilk seferde birkaç dakika sürer.
`npm warn deprecated` yazan uyarılar normaldir, dikkate almana gerek yok.

**5. Uygulamayı çalıştır**

```bash
npm run dev
```

Pencere kendiliğinden açılır. Kodda yaptığın değişiklikler anında yansır.

**6. Kurulum dosyası üret (isteğe bağlı)**

```bash
npm run dist
```

Hazır `.exe` dosyaları `release/` klasöründe oluşur.

### Bir şeyler ters giderse

| Hata | Sebebi ve çözümü |
| --- | --- |
| `npm terimi tanınmıyor` | Node.js kurulu değil ya da terminal, kurulumdan önce açılmış. Bütün terminal pencerelerini kapatıp yenisini aç. |
| `Bu sistemde betik çalıştırma devre dışı` | PowerShell betikleri engelliyor. Bir kez şunu çalıştır: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Kurulum `better-sqlite3` üzerinde takılıyor | Bu Node sürümü için hazır dosyalar yok. 1. adımdaki LTS sürümünü kullan. |
| Pencere bembeyaz açılıyor | Önce `npm run build`, sonra `npm start` çalıştır. |

## Teknik yapı

| Alan | Kullanılan |
| --- | --- |
| Çalışma ortamı | Electron 33 |
| Arayüz | React 18, TypeScript, Tailwind CSS, Radix UI, Recharts |
| Veri | better-sqlite3 üzerinden SQLite, WAL kipi |
| Derleme | electron-vite, electron-builder |
| PDF | Chromium `printToPDF` — gömülü font olmadan tam Unicode desteği |

### Klasör düzeni

```
berichtsheft/
├── electron/           Ana süreç: pencere, veritabanı, dosya pencereleri, PDF
│   ├── main.ts         Yaşam döngüsü ve IPC uçları
│   ├── db.ts           SQLite erişimi, migration, yedekleme
│   ├── pdf.ts          HTML şablonları ve PDF üretimi
│   └── preload.ts      Arayüzle tek bağlantı noktası
├── shared/             İki tarafın da kullandığı kod
│   ├── types.ts        Veri modeli
│   ├── dates.ts        ISO 8601 hafta hesabı, harici kütüphanesiz
│   └── pdfLabels.ts    PDF içindeki etiketler
├── src/                Arayüz
│   ├── components/     Ekranlar ve UI parçaları
│   ├── hooks/useApp    Durum, çeviri, bildirimler
│   ├── i18n/           de, en, tr sözlükleri
│   └── lib/            Hafta mantığı ve yardımcılar
└── scripts/            Uygulama simgesini üreten betik
```

Arayüz tarafında Node.js ve dosya erişimi **yoktur**. Her şey `preload.ts` içindeki dar
arayüzden geçer — böylece saldırı yüzeyi küçük kalır ve veriye erişen tek bir yer olur.

`electron/db.ts` bilinçli olarak dar bir fonksiyon kümesinin arkasına saklandı. İleride
bulut senkronizasyonu eklenirse yalnızca bu fonksiyonların değişmesi yeterli olur,
arayüze dokunmak gerekmez.

## Planlananlar

- Birden fazla haftayı seçip tek dosyada dışa aktarma
- Üçüncü kayıt biçimi olarak aylık görünüm
- Hazır metinlerin eğitim yılına göre ayrılması
- macOS ve Linux paketleri

## Katkı

Hata bildirimleri ve öneriler memnuniyetle karşılanır — [CONTRIBUTING.md](CONTRIBUTING.md).

## Lisans

[MIT](LICENSE) — serbestçe kullanılabilir, değiştirilebilir.
