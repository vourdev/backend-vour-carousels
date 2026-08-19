/**
 * Voice Samples for AI Prompt Enhancement
 * 
 * These are the top-performing carousel briefs that best represent
 * Muhammad Adhinugroho's authentic voice and writing style.
 * 
 * Selected based on:
 * - Casual Indonesian tone (nggak, kamu, bikin, aja)
 * - Direct & opinionated statements
 * - Concrete examples over abstract concepts
 * - Problem-first structure
 * - Senior-to-junior teaching tone
 * 
 * Last updated: 2026-07-31
 */

export const VOICE_SAMPLES = {
  // Sample 1: JWT Bukan Enkripsi (Score: 98/100)
  // Best overall voice match - declarative, concrete, empathetic
  jwt_encryption: `
# Carousel Content — JWT Bukan Enkripsi

## Content Info
- Format:    Carousel Slide
- Platform:  Instagram & TikTok (1080×1350)
- Total Slides:  8
- Audience:  Junior developer / self-taught programmer yang baru belajar auth & JWT
- Goal:      Saves / Awareness
- Tone:      Casual Indonesian, first-person "saya", senior-dev-to-junior, sedikit opinionated

---

# Slide 1 — Cover

## Eyebrow
Miskonsepsi JWT

## Headline
JWT Itu Bukan **Enkripsi**.

## Description
Banyak developer pikir data di dalam JWT itu aman karena "udah di-encode."

Padahal payload-nya bisa dibaca siapa aja tanpa perlu secret key.

Saya bahas kenapa JWT itu soal integrity, bukan confidentiality — dan apa yang harus kamu lakuin.

## Highlight
Payload JWT cuma di-encode, bukan dienkripsi.

## Visual Direction
- Icon: lucide:key
- Accent Color: Sky

---

# Slide 2 — Problem

## Page Counter
01 / 08

## Eyebrow
Kenapa Ini Penting

## Headline
Encode **Bukan** Berarti Aman.

## Description
Base64 itu encoding, bukan encryption. Encoding cuma ubah format — semua orang bisa decode balik dalam sekejap.

Masalahnya, banyak yang taruh data sensitif langsung di payload JWT: email, role, bahkan reset token.

Padahal siapa aja yang pegang token itu bisa buka isinya.

## Highlight
Base64 encode ≠ enkripsi. Decode-nya cuma satu baris kode.

## Visual Direction
- Icon: lucide:unlock
- Accent Color: Red

---

# Slide 6 — Point #4

## Page Counter
05 / 08

## Eyebrow
Point #4

## Headline
Jangan Taruh **Rahasia** di Payload.

## Description
Password, API key, atau data pribadi sensitif — semua itu nggak boleh nangkring di payload JWT.

Token ini biasanya kesimpen di localStorage, cookie, bahkan log server — makin banyak titik bocor.

Anggap aja payload JWT itu kartu nama, bukan brankas.

## Highlight (Dark Callout)
Butuh kerahasiaan? Itu tugas enkripsi (JWE), bukan JWT biasa (JWS).

## Visual Direction
- Icon: lucide:alert-triangle
- Accent Color: Red

---

# Slide 8 — Outro

## Page Counter
07 / 08

## Eyebrow
Kesimpulan

## Headline
JWT Soal **Kepercayaan**, Bukan Rahasia.

## Description
Verifikasi keaslian token — itu kerjaan JWT.

Melindungi isi data — itu kerjaan enkripsi, beda cerita.

## Highlight
Paham bedanya = auth system kamu lebih aman.
Share ke tim biar nggak ada yang salah taruh data sensitif di JWT lagi.

## Visual Direction
- Icon: lucide:check-circle
- Accent Color: Violet

---

# Caption
JWT itu bukan enkripsi. 🔑
Payload-nya bisa dibaca siapa aja tanpa secret key — signature cuma buktiin token nggak diubah, bukan nyembunyiin isinya.

Save biar nggak lupa. Comment kalau tim kamu pernah taruh data sensitif di JWT payload 👀

# Hashtag
#jwt #webdev #backend #softwareengineer #vourdev
`,

  // Sample 2: Rate Limiting 4 Kesalahan (Score: 95/100)
  // Strong "common mistakes" pattern with numbered structure
  rate_limiting: `
Caption: "4 kesalahan rate limiting yang sering bikin API down pas traffic naik.
Save biar nggak keulang di project kamu.

Comment "1", "2", "3", atau "4" — kesalahan mana yang paling relate sama kode kamu?"

Voice markers:
- "4 kesalahan yang sering bikin API down"
- "Save biar nggak keulang"
- "Comment [engagement question]"
- Numbered concrete problems (1-4)
- Traffic spike scenario (production reality)
`,

  // Sample 3: Webhook Sering Rusak (Score: 93/100)
  // Problem-solution structure with reality check
  webhook_problems: `
Caption: "4 kesalahan yang bikin webhook gagal di production.
Simpan biar nggak lupa!"

Cover slide:
- Headline: "Kenapa Webhook Sering Rusak"
- Description: "4 kesalahan yang bikin webhook gagal di production"

Problem slide:
- Headline: "Webhook Terlihat Simple"
- Body: "Setup awalnya mudah. Tapi di production, banyak yang bisa salah."

Voice markers:
- "Setup awalnya mudah. Tapi di production..." (reality check)
- "Simpan biar nggak lupa!" (action CTA)
- "banyak yang bisa salah" (empathetic acknowledgment)
`,

  // Sample 4: Database Butuh Index (Score: 92/100)
  // Urgency pattern with observable symptoms
  database_index: `
Caption: "6 tanda database kamu butuh index SEKARANG.

Kalau query makin lambat, CPU naik, atau sering timeout — bisa jadi database lo butuh index.

Yuk cek pake EXPLAIN dan tambahin index di kolom yang tepat."

Voice markers:
- "6 tanda database kamu BUTUH index SEKARANG" (urgency)
- "database lo" (very casual "lo" instead of "kamu")
- "Kalau query makin lambat, CPU naik, atau sering timeout" (observable symptoms)
- "Yuk cek pake EXPLAIN" (actionable next step)
- "bisa jadi database lo butuh index" (diagnostic reasoning)
`,

  // Sample 5: React Bukan Skill (Score: 90/100)
  // Opinion-forward hot take pattern
  react_hot_take: `
Title: "React Bukan Skill, Problem Solving Itu Skill"

Voice markers (from design-system example):
- Hot take structure (controversial opinion)
- "Bukan [misconception], [actual truth] Itu [concept]"
- Opinion-forward approach
- Strong declarative statements
`,
} as const;

/**
 * Voice Pattern Guidelines
 * 
 * Key characteristics to maintain:
 */
export const VOICE_PATTERNS = {
  // Casual Indonesian markers
  casual_words: [
    'nggak',      // not "tidak"
    'udah',       // not "sudah"
    'kamu',       // not "anda"
    'lo',         // very casual variant of "kamu"
    'bikin',      // not "membuat"
    'aja',        // suffix: "siapa aja", "pake aja"
    'kayak',      // not "seperti"
    'gimana',     // not "bagaimana"
  ],

  // Sentence starters
  sentence_starters: [
    'Kalau...',          // conditional, conversational
    'Padahal...',        // reality check
    'Masalahnya,',       // problem introduction
    'Banyak yang...',    // common pattern acknowledgment
    'Setup awalnya...',  // scenario setup
  ],

  // Connectors and transitions
  transitions: [
    'Tapi di production,',       // reality check
    'Padahal',                   // contrast to expectation
    'Anggap aja',                // metaphor introduction
    'Bisa jadi',                 // hypothesis
    'Saya bahas',                // content preview
  ],

  // Call-to-action patterns
  cta_patterns: [
    'Save biar nggak...',               // preservation CTA
    'Simpan biar nggak...',             // variant
    'Comment kalau...',                 // engagement CTA
    'Comment [question/number]...',     // specific engagement
    'Yuk cek pake...',                  // action suggestion
  ],

  // Avoid these (too formal)
  avoid: [
    'Anda',
    'sebaiknya',
    'disarankan',
    'silahkan',
    'mohon',
    'perlu diperhatikan',
  ],
} as const;

/**
 * Sentence Structure Templates
 */
export const SENTENCE_TEMPLATES = {
  problem_statement: [
    '[Thing] itu bukan [misconception]',
    '[Number] kesalahan yang bikin [bad outcome]',
    'Kenapa [thing] sering [problem]',
    '[Thing] terlihat [adjective]. Tapi [reality]',
  ],

  explanation: [
    '[Technical term] cuma [actual function], bukan [misconception]',
    'Kalau [condition], [consequence]',
    'Padahal [reality]',
    'Masalahnya, [problem elaboration]',
  ],

  solution: [
    'Jangan [bad practice]',
    'Anggap aja [metaphor]',
    'Cek [tool/method] buat [purpose]',
    '[Number] langkah [outcome]',
  ],

  cta: [
    'Save biar nggak [negative outcome]',
    'Comment [question/engagement prompt]',
    'Yuk [action]',
    'Share ke tim biar [positive outcome]',
  ],
} as const;
