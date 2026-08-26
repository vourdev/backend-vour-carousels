# Voice Profile — satu sumber suara Muhammad Adhinugroho

Tanggal: 2026-08-26
Status: disetujui, siap dibuatkan rencana implementasi

## Masalah

Tone slide tidak terdengar seperti pemiliknya. Penyebabnya bukan satu, ada tiga,
dan ketiganya struktural — bukan soal prompt yang kurang panjang.

**1. Bahan terbaiknya tidak pernah sampai ke model.**
`src/lib/ai/voice-samples.ts` (300 baris: `VOICE_SAMPLES`, `VOICE_PATTERNS`,
`SENTENCE_TEMPLATES`) diimpor di `prompts.ts:6` dan **tidak pernah dirujuk di
file itu**. Satu-satunya yang menyentuhnya adalah `scripts/verify-regression.ts`,
yang hanya menghitung jumlah kuncinya. Contoh suara paling konkret yang dimiliki
proyek ini tidak pernah dibaca model satu kali pun.

**2. Pelatihan suara hanya menyentuh satu dari tiga prompt.**
`VOICE_TRAINING` hanya masuk ke `briefSystem` (`prompts.ts:618`). `planSystem`
dan `SCOPED_REVISION_RULES` hanya menerima `HUMAN_VOICE_EDITOR` — daftar
larangan, tanpa satu pun contoh bunyi. Headline slide lahir di `planSystem`.
Jadi brief bisa terdengar benar sementara slide tidak, dan itulah yang terjadi.

**3. Aturan yang ada menulis orang yang berbeda.**
`HUMAN_VOICE_EDITOR` BANNED PATTERN 2 mewajibkan sikap kontroversial
("`X itu overrated`") dengan batas keras nol hingga satu hedge per deck.
Pemiliknya menyatakan dirinya hati-hati saat menilai. Prompt memaksa persona
yang lebih nyinyir dari orangnya.

Ditambah tiga sumber yang saling berselisih soal sapaan: `HUMAN_VOICE_EDITOR`
menulis "lo", `voice-samples.ts` menulis "saya", dokumen internal menulis "gw".
Jawaban sebenarnya tidak ada di antara ketiganya: **"gw" / "lu"**.

Dan redundansi: enam pola terlarang ditulis lengkap dua kali — sekali di
`VOICE_TRAINING`, sekali di `HUMAN_VOICE_EDITOR` — dan `briefSystem` menerima
keduanya sekaligus.

## Sumber kebenaran profil

Profil berasal dari wawancara terstruktur enam blok dengan pemilik brand
(26 Agustus 2026), bukan dari analisis tulisan lama. Batasnya dicatat jujur:
wawancara merekam bagaimana seseorang **menggambarkan** dirinya. Mitigasinya
adalah uji kalibrasi di akhir — tiga cover ditulis untuk topik yang sama,
pemilik memilih mana yang bunyinya dia. Pilihannya (tuduh langsung + janji obat)
cocok dengan kalimat yang ia tulis sendiri secara spontan di tengah wawancara,
`"cara lu nyimpen token itu salah semua, gini nih cara simpen token yang bener"`.
Profil ini konsisten dengan dirinya, bukan hanya dengan deskripsi dirinya.

Satu hal yang wawancara ini tidak bisa berikan: bukti dari tulisan liar. Kalau
nanti tone masih meleset, langkah berikutnya adalah menambang carousel yang
sudah disetujui di Turso, bukan memperpanjang aturan.

## Profil

Poros karakter: **rendah hati soal diri, tegas soal fakta.**

| Dimensi | Isi |
|---|---|
| Sapaan | "gw" untuk diri, "lu" untuk pembaca. Bukan "lo", bukan "anda", bukan "saya" |
| Tik bahasa | "nah", "jadi gini", "gini nih", "make sense" |
| Nada | fun, blak-blakan, runtut |
| Batas kritik | diarahkan ke praktik. Tidak pernah ke orang atau tool |
| Humor | merendah diri; bahan leluconnya diri sendiri |
| Urutan mengajar | masalah → analogi → kode |
| Kedalaman | berhenti di "kenapa penting", bukan "ini kodenya" |
| Analogi | dari dunia nyata, wajib lolos uji "make sense" |
| Pantangan | clickbait |
| Pilar konten | backend, dan sikap kerja (utamakan client, turunkan ego, jadi pendengar) |
| Pesan inti | "jangan takut mencoba" |

Latar yang menjelaskan nada itu: tiga tahun belajar hacking dan merasa nyasar,
lalu ketemu arah di Laravel saat kelas 2 SMK. Karena itu "gw dulu juga gitu"
bukan basa-basi merendah — itu riwayat, dan itu yang membuat humor merendah
diri dan pesan "jangan takut mencoba" datang dari tempat yang sama.

## Rancangan

### 1. `src/lib/ai/voice-profile.ts` — modul baru, satu sumber

Konstanta bernama, bukan satu blok teks raksasa, supaya bisa diuji satuan dan
dirujuk terpisah:

```
ADDRESS_RULE     gw / lu, dengan larangan eksplisit "lo" / "anda" / "saya"
SPEECH_TICS      nah · jadi gini · gini nih · make sense
STANCE_RULE      tegas ke fakta, kritik ke praktik, tidak pernah ke orang/tool
HUMOR_RULE       merendah diri, bahan lelucon diri sendiri
TEACHING_ORDER   masalah -> analogi -> kode
DEPTH_RULE       berhenti di "kenapa penting"
ANALOGY_RULE     dunia nyata + uji "make sense"
HONESTY_RULE     cover tidak boleh menjanjikan lebih dari isi deck
VOICE_SAMPLES    diserap dari voice-samples.ts
```

Lalu satu `VOICE_RULE` yang merangkainya. Pola ini sudah dipakai repo untuk
`TITLE_CAPTION_RULE` dan `HASHTAG_RULE`, jadi bukan mekanisme baru.

### 2. Penyambungan — inti perbaikannya

`VOICE_RULE` dirujuk dari **`briefSystem`, `planSystem`, dan
`SCOPED_REVISION_RULES`**. Tanpa langkah ini, dua masalah pertama tetap hidup:
slide dan hasil revisi tidak pernah membaca suara pemiliknya.

### 3. Yang dihapus dan yang ditulis ulang

- `VOICE_TRAINING` (`prompts.ts:170-322`) dihapus. Isinya yang masih berlaku
  pindah ke `voice-profile.ts`; duplikasi enam pola terlarang hilang bersamanya.
- `voice-samples.ts` dihapus setelah isinya diserap. Impor matinya ikut hilang.
- `HUMAN_VOICE_EDITOR` BANNED PATTERN 2 ditulis ulang. Yang **tetap**: larangan
  hedging saat menyatakan fakta teknis. Yang **dicabut**: kewajiban bersikap
  kontroversial. Yang **ditambah**: larangan menyerang tool atau orang.
- Sapaan "lo" diganti "lu" di seluruh `HUMAN_VOICE_EDITOR`.

### 4. Pengujian

`test/ai/voice-profile.test.ts` (baru):

- ketiga prompt (`briefSystem`, `planSystem`, `SCOPED_REVISION_RULES`)
  benar-benar memuat `VOICE_RULE` — ini yang mencegah regresi "diimpor tapi
  tidak pernah dipakai" terulang, dan itu bug yang sudah pernah terjadi;
- sapaan "lu" hadir, "lo" sebagai sapaan tidak ada;
- aturan kedalaman dan urutan mengajar terbawa ke `planSystem`.

Yang harus ikut diperbaiki:

- `test/ai/prompts.test.ts:190` mengunci string `"istilah AI yang wajib lo"`;
- `scripts/verify-regression.ts:8,113,114` masih mengimpor `VOICE_SAMPLES` dari
  modul yang dihapus.

### 5. Yang sengaja TIDAK dibangun sekarang

Gerbang penegak deterministik di kode — pemeriksa kata pantangan, rasio hedge,
kehadiran tik bahasa — dijalankan atas keluaran model, seperti `repairSlidePlan`.
Prinsip "jangan cuma percaya prompt" membenarkannya, tapi membangunnya sekarang
berarti menambah lapisan pengukuran sebelum lapisan dasarnya terbukti perlu.
Jalankan rancangan ini dulu, ukur seberapa sering model meleset, baru putuskan.

## Risiko

`planSystem` sudah padat aturan mockup, layout, ikon dan hashtag; menambah
`VOICE_RULE` memperpanjangnya. Kalau kualitas rencana slide turun setelah
perubahan ini, jalan mundurnya adalah versi ringkas `VOICE_RULE` khusus untuk
`planSystem` — bukan mencabut penyambungannya, karena penyambungan itulah
perbaikan intinya.

Perubahan ini menyentuh prompt yang menghasilkan `title`, `caption` dan
`hashtags` — ketiganya kontrak penerbitan dengan batas panjang yang dipaksakan
skema. Tidak ada aturan di `voice-profile.ts` yang boleh melonggarkan atau
mengulang batas itu; `TITLE_CAPTION_RULE` dan `HASHTAG_RULE` tetap satu-satunya
tempat yang menetapkannya.
