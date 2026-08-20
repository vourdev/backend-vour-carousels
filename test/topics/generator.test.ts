import { describe, it, expect, vi } from "vitest";
import { expandTopicToBrief } from "../../src/lib/topics/generator";
import * as aiGenerate from "../../src/lib/ai/generate";
import * as productsRepo from "../../src/lib/products/repo";
import { MockLanguageModelV4 } from "ai/test";

describe("Topic Generator & Soft-Sell", () => {
  it("expands a standard topic without product context", async () => {
    const generateBriefSpy = vi
      .spyOn(aiGenerate, "generateBrief")
      .mockResolvedValueOnce("# Standard Brief");

    const model = new MockLanguageModelV4({
      provider: "test",
      modelId: "test",
      doGenerate: vi.fn(),
    });

    const brief = await expandTopicToBrief(
      {
        title: "JWT Itu Bukan Enkripsi",
        category: "evergreen",
        description: "Bahas Base64 decoding vs encryption",
        angle: "fokus: Kesalahan Umum",
        keywords: ["jwt", "auth"],
      },
      model
    );

    expect(brief).toBe("# Standard Brief");
    expect(generateBriefSpy).toHaveBeenCalledTimes(1);
    const passedIdea = generateBriefSpy.mock.calls[0][0];
    expect(passedIdea).toContain("Topik: JWT Itu Bukan Enkripsi");
    expect(passedIdea).not.toContain("Tujuan Konten: soft-sell");
    generateBriefSpy.mockRestore();
  });

  it("auto-wires productContext and soft-sell purpose when relatedProductId is set", async () => {
    const generateBriefSpy = vi
      .spyOn(aiGenerate, "generateBrief")
      .mockResolvedValueOnce("# Soft-sell Brief");

    const getProductSpy = vi
      .spyOn(productsRepo, "getProduct")
      .mockResolvedValueOnce({
        id: "prod_3d_portfolio",
        name: "3D Portfolio Template",
        price: 149000,
        keyBenefit: "Template portfolio 3D interaktif untuk developer",
        ctaText: "Beli sekarang",
        active: true,
        createdAt: Date.now(),
      });

    const model = new MockLanguageModelV4({
      provider: "test",
      modelId: "test",
      doGenerate: vi.fn(),
    });

    const brief = await expandTopicToBrief(
      {
        title: "Cara Bikin Portfolio Developer yang Standout",
        category: "product",
        description: "Pentingnya portfolio visual untuk career growth",
        angle: "fokus: Panduan Praktis",
        keywords: ["portfolio", "career"],
        relatedProductId: "prod_3d_portfolio",
        suggestedAngle: "Bahas pentingnya portfolio visual yang interaktif",
      },
      model
    );

    expect(brief).toBe("# Soft-sell Brief");
    expect(getProductSpy).toHaveBeenCalledWith("prod_3d_portfolio");
    expect(generateBriefSpy).toHaveBeenCalledTimes(1);

    const passedIdea = generateBriefSpy.mock.calls[0][0];
    expect(passedIdea).toContain("Tujuan Konten: soft-sell");
    expect(passedIdea).toContain("3D Portfolio Template");
    expect(passedIdea).toContain("Template portfolio 3D interaktif untuk developer");
    expect(passedIdea).toContain("Beli sekarang");
    expect(passedIdea).toContain("PETUNJUK SOFT-SELL KHUSUS");

    generateBriefSpy.mockRestore();
    getProductSpy.mockRestore();
  });
});
