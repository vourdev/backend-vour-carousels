Bangun Research Agent MVP: endpoint baru yang extract topik dari
catatan mentah, klasifikasi kategori + audience fit, opsional link ke
produk aktif untuk kandidat soft-sell, tulis ke topic queue dengan
status "Pending Review" (BUKAN langsung "Not Posted"/ready-to-pull).

## TASK 1 — Tabel products (baru, kecil)
CREATE TABLE products (
  id, name, price, key_benefit, cta_text, active BOOLEAN DEFAULT true
)
Seed 1 row dengan produk kamu sekarang (template portfolio 3D).

## TASK 2 — Extend/cek tabel topic queue yang sudah ada
Pastikan kolom berikut ada (tambahkan kalau belum):
- category: "evergreen" | "trending" | "personal" | "product"
- source: string (misal "research-agent-mvp")
- related_product_id: nullable, FK ke products.id (cuma diisi kalau
  category = "product")
- status: default "pending_review" untuk topik dari agent ini
  (BEDA dari topik yang kamu input manual, yang mungkin langsung
  "not_posted" kalau memang udah kamu putuskan sendiri)

## TASK 3 — Endpoint input (MVP: terima teks mentah, bukan live sync)
POST /automation/research-topics
Body: { rawNotes: string }  // paste manual dari Obsidian/catatan kerja,
                              // bisa multi-paragraf, gabungan beberapa
                              // observasi sekaligus
Jangan bangun live Obsidian sync di MVP ini — itu phase berikutnya
kalau MVP-nya kepake beneran.

## TASK 4 — Prompt ekstraksi & klasifikasi (bagian utama)
Sistem prompt untuk agent ini:
---
Kamu adalah Topic Research Agent untuk akun konten edukasi teknologi
(niche: web development, AI tools, developer productivity). Audience:
developer junior-menengah, Indonesia, gaya bahasa santai (bukan
formal/korporat).

Dari catatan mentah yang diberikan, ekstrak KANDIDAT TOPIK carousel.
Untuk tiap kandidat, tentukan:

1. title: judul topik singkat, actionable, sesuai gaya konten existing
   (bukan judul textbook/formal)

2. category (pilih SATU, definisi sesuai ini):
   - evergreen: selalu relevan, bukan tren sesaat (contoh: SSR vs CSR,
     React Hooks, Docker basics)
   - trending: update/rilis baru yang lagi ramai dibahas (contoh: versi
     baru framework, fitur AI baru)
   - personal: pengalaman/pelajaran dari proses kerja nyata (contoh:
     dari catatan "hari ini stuck di error X" → topik "kesalahan umum
     soal X")
   - product: topik yang secara NATURAL bisa terhubung ke salah satu
     produk aktif (daftar produk aktif akan diberikan terpisah) — HANYA
     tandai ini kalau koneksinya genuinely masuk akal, JANGAN
     dipaksakan cuma supaya ada kandidat kategori ini

3. targetAudienceFit: 1 kalimat alasan kenapa topik ini relevan buat
   audience (developer junior-menengah Indonesia) — kalau topiknya
   terlalu niche/advanced/di luar target, JANGAN dimasukkan sebagai
   kandidat sama sekali, skip

4. Kalau category = "product": tentukan relatedProductId dari daftar
   produk aktif yang paling relevan, dan tulis 1 kalimat suggestedAngle
   — sudut edukasi yang bisa jadi jembatan natural ke produk itu (BUKAN
   isi pitch-nya, cuma arah topiknya)

Abaikan/skip catatan yang tidak menghasilkan topik yang cukup konkret
untuk jadi 1 carousel utuh (misal cuma 1 kalimat tanpa substansi).

DAFTAR PRODUK AKTIF (untuk referensi category="product"):
{{daftar dari tabel products, format: id, name, keyBenefit}}
---

## TASK 5 — Simpan hasil
Tulis semua kandidat dari TASK 4 ke topic queue table dengan status
"pending_review", source="research-agent-mvp".

## TASK 6 — Endpoint approval sederhana (bukan UI, cukup endpoint/query)
Tambahkan cara simpel buat kamu approve/reject kandidat (bisa endpoint
PATCH status, atau bahkan query SQL manual yang kamu jalanin sendiri
di awal — nggak perlu UI dulu di MVP ini). Cuma topik dengan status
selain "pending_review" (misal "approved"/"not_posted") yang boleh
ke-pull sama query n8n yang sudah ada — pastikan query n8n existing
memang sudah filter by status yang benar, cek dan sesuaikan kalau perlu.

## TASK 7 — Testing
- Jalankan endpoint dengan sample rawNotes (campuran: 1 observasi
  personal dari kerjaan, 1 topik evergreen, 1 yang harusnya ke-skip
  karena di luar niche, 1 yang harusnya ke-tag "product")
- Verifikasi kategori & relatedProductId benar
- Verifikasi topik di luar niche/audience memang ke-skip, bukan
  dipaksa masuk
- Verifikasi status default "pending_review", TIDAK otomatis ke-pull
  n8n sebelum di-approve manual

## OUTPUT
Hasil testing TASK 7 (daftar kandidat + kategori + reasoning),
konfirmasi topik "product" ke-link ke produk yang benar.