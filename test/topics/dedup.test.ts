import { describe, it, expect } from "vitest";
import {
  levenshteinDistance,
  levenshteinSimilarity,
  tokenOverlapSimilarity,
  isDuplicateTopic,
  filterDuplicateTopics,
} from "../../src/lib/topics/dedup";
import type { GeneratedTopic } from "../../src/lib/topics/schema";

describe("Topic Deduplication & Similarity", () => {
  it("calculates exact match similarity as 1.0", () => {
    expect(levenshteinSimilarity("JWT Itu Bukan Enkripsi", "JWT Itu Bukan Enkripsi")).toBe(1.0);
    expect(tokenOverlapSimilarity("JWT Itu Bukan Enkripsi", "JWT Itu Bukan Enkripsi")).toBe(1.0);
  });

  it("detects minor typo / character variations with high similarity", () => {
    const sim = levenshteinSimilarity("JWT Itu Bukan Enkripsi", "JWT Itu Bukan Enkripzi");
    expect(sim).toBeGreaterThan(0.9);
  });

  it("detects word reordering and paraphrasing via token overlap", () => {
    const sim = tokenOverlapSimilarity(
      "Tips Optimasi Query Database Prisma",
      "Cara Optimasi Query Database Prisma"
    );
    expect(sim).toBeGreaterThan(0.7);
  });

  it("flags duplicate topics against an existing list", () => {
    const existing = [
      "JWT Itu Bukan Enkripsi",
      "Kenapa Middleware Next.js Sering Bikin Bug",
      "Docker Compose vs Kubernetes: Kapan Pakai Apa?",
    ];

    const res1 = isDuplicateTopic("JWT Itu Bukan Enkripsi (Penjelasan)", existing, 0.70);
    expect(res1.isDuplicate).toBe(true);
    expect(res1.matchedWith).toBe("JWT Itu Bukan Enkripsi");

    const res2 = isDuplicateTopic("Belajar TypeScript dari Nol", existing, 0.70);
    expect(res2.isDuplicate).toBe(false);
  });

  it("filters out duplicates from candidate batches", () => {
    const existing = ["3 AI Tools yang Save 5 Jam per Minggu"];

    const candidates: GeneratedTopic[] = [
      {
        title: "3 AI Tools yang Menghemat 5 Jam Tiap Minggu",
        category: "productivity",
        description: "Bahas AI tools penghemat waktu",
        keywords: ["ai", "tools"],
        angle: "fokus: Panduan Praktis",
        priority: 8,
      },
      {
        title: "Panduan Lengkap Database Indexing PostgreSQL",
        category: "evergreen",
        description: "Bahas B-Tree index PostgreSQL",
        keywords: ["database", "postgres"],
        angle: "fokus: Deep Dive",
        priority: 9,
      },
      {
        title: "Panduan Lengkap Database Indexing PostgreSQL", // intra-batch duplicate
        category: "evergreen",
        description: "Duplikat",
        keywords: ["database"],
        angle: "fokus: Deep Dive",
        priority: 5,
      },
    ];

    const filtered = filterDuplicateTopics(candidates, existing, 0.70);
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe("Panduan Lengkap Database Indexing PostgreSQL");
  });
});
