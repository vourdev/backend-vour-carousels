import { generateText, type LanguageModel } from "ai";
import { z } from "zod";
import { getActiveProducts, type Product } from "../products/repo";
import { createTopic, type Topic, type TopicStatus } from "../topics/bank";

/* ── Zod schema for the AI output ────────────────────────────────────── */

const researchCandidateSchema = z.object({
  title: z.string().min(4).max(120),
  category: z.enum(["evergreen", "trending", "personal", "product"]),
  targetAudienceFit: z.string().min(10).max(300),
  relatedProductId: z.string().optional(),
  suggestedAngle: z.string().max(300).optional(),
});

const researchOutputSchema = z.object({
  candidates: z.array(researchCandidateSchema),
});

export type ResearchCandidate = z.infer<typeof researchCandidateSchema>;

/* ── JSON extraction (same pattern as lib/ai/generate.ts) ────────────── */

function extractAndParseJson(rawText: string): any {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

/* ── System prompt (TASK 4) ──────────────────────────────────────────── */

function buildSystemPrompt(products: Product[]): string {
  const productList = products
    .map((p) => `- id: "${p.id}", name: "${p.name}", keyBenefit: "${p.keyBenefit}"`)
    .join("\n");

  return `Kamu adalah Topic Research Agent untuk akun konten edukasi teknologi
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
${productList || "(tidak ada produk aktif)"}

PENTING:
- Output HARUS berupa JSON valid dengan format:
  { "candidates": [ { "title": "...", "category": "...", "targetAudienceFit": "...", "relatedProductId": "..." (optional), "suggestedAngle": "..." (optional) } ] }
- Kalau tidak ada kandidat yang layak, return: { "candidates": [] }
- JANGAN tambahkan teks di luar JSON
- JANGAN paksa topik masuk kalau di luar niche/audience target`;
}

/* ── Main extraction function ────────────────────────────────────────── */

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function extractTopics(
  rawNotes: string,
  products: Product[],
  model: LanguageModel
): Promise<ResearchCandidate[]> {
  const system = buildSystemPrompt(products);
  const prompt = `Catatan mentah:\n\n${rawNotes}\n\nEkstrak kandidat topik carousel dari catatan di atas. Return JSON saja.`;

  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { text } = await generateText({ model, system, prompt });
      const parsed = extractAndParseJson(text);
      const validated = researchOutputSchema.parse(parsed);

      // Validate that product-category candidates reference a real product
      const productIds = new Set(products.map((p) => p.id));
      return validated.candidates.map((c) => {
        if (c.category === "product" && c.relatedProductId && !productIds.has(c.relatedProductId)) {
          console.warn(
            `[research-agent] candidate "${c.title}" references unknown product "${c.relatedProductId}", clearing`
          );
          return { ...c, relatedProductId: undefined, suggestedAngle: undefined, category: "evergreen" as const };
        }
        return c;
      });
    } catch (err: any) {
      console.error(`[research-agent] attempt ${attempt + 1} failed:`, err?.message || err);
      lastError = err;
      if (attempt < 2) await delay((attempt + 1) * 2500);
    }
  }

  throw new Error(
    `Research agent failed after 3 attempts. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

export async function extractAndSaveTopicsFromNotes(
  userId: string,
  model: LanguageModel,
  rawNotes: string,
  options?: {
    status?: TopicStatus;
    source?: string;
  }
): Promise<Topic[]> {
  const products = await getActiveProducts();
  const candidates = await extractTopics(rawNotes, products, model);

  const status = options?.status ?? "idea";
  const source = options?.source ?? "notes-extraction";

  const saved: Topic[] = [];
  for (const candidate of candidates) {
    const topic = await createTopic({
      userId,
      title: candidate.title,
      category: candidate.category,
      description: candidate.targetAudienceFit,
      keywords: [],
      status,
      source,
      relatedProductId: candidate.relatedProductId,
      targetAudienceFit: candidate.targetAudienceFit,
      suggestedAngle: candidate.suggestedAngle,
    });
    saved.push(topic);
  }

  return saved;
}

