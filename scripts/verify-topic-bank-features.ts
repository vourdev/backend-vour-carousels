import { getActiveProducts, getProduct } from "../src/lib/products/repo";
import { createTopic, getTopic, updateTopic, deleteTopic } from "../src/lib/topics/bank";
import { expandTopicToBrief } from "../src/lib/topics/generator";
import { isDuplicateTopic, filterDuplicateTopics } from "../src/lib/topics/dedup";
import { MockLanguageModelV4 } from "ai/test";

async function main() {
  console.log("=================================================");
  console.log("VERIFYING TOPIC BANK EXTENSIONS");
  console.log("=================================================\n");

  // 1. Verify Products Repo
  console.log("1. Testing Products Repo (TASK 3)...");
  const products = await getActiveProducts();
  console.log(`- Active products count: ${products.length}`);
  const sampleProduct = products[0];
  console.log(`- Sample product: ${sampleProduct.name} (${sampleProduct.id})`);
  console.log(`- Key benefit: ${sampleProduct.keyBenefit}`);
  console.log(`- CTA text: ${sampleProduct.ctaText}`);

  const fetched = await getProduct(sampleProduct.id);
  if (!fetched || fetched.id !== sampleProduct.id) {
    throw new Error("getProduct failed to fetch the product by ID");
  }
  console.log("✓ Products Repo verified successfully.\n");

  // 2. Verify Topic CRUD with related_product_id (TASK 4)
  console.log("2. Testing Topic CRUD with related_product_id (TASK 4)...");
  const usersRes = await (await import("@libsql/client")).createClient({
    url: process.env.DATABASE_URL ?? "file:local-auth.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  }).execute("SELECT id FROM user LIMIT 1");
  const dummyUserId = (usersRes.rows[0]?.id as string) || "user_test";

  const created = await createTopic({

    userId: dummyUserId,
    title: "Test Topic Portfolio 3D",
    category: "product",
    description: "Panduan membangun portfolio 3D",
    relatedProductId: sampleProduct.id,
    suggestedAngle: "Mulai dari pentingnya visualisasi interaktif",
    status: "idea",
  });
  console.log(`- Created topic: ${created.id}`);
  console.log(`- Category: ${created.category}`);
  console.log(`- Related Product ID: ${created.relatedProductId}`);
  console.log(`- Suggested Angle: ${created.suggestedAngle}`);

  if (created.relatedProductId !== sampleProduct.id) {
    throw new Error("createTopic did not persist relatedProductId");
  }

  await updateTopic(created.id, dummyUserId, {
    suggestedAngle: "Updated suggested angle for testing",
    relatedProductId: sampleProduct.id,
  });
  const updated = await getTopic(created.id, dummyUserId);
  console.log(`- Updated topic suggestedAngle: ${updated?.suggestedAngle}`);
  if (updated?.suggestedAngle !== "Updated suggested angle for testing") {
    throw new Error("updateTopic did not update suggestedAngle");
  }
  console.log("✓ Topic CRUD with related_product_id verified successfully.\n");

  // 3. Verify Soft-Sell Brief Auto-Wiring (TASK 5)
  console.log("3. Testing Soft-Sell Brief Auto-Wiring (TASK 5)...");
  let capturedIdea = "";
  const mockModel = new MockLanguageModelV4({
    provider: "test",
    modelId: "test",
    doGenerate: async (options) => {
      capturedIdea = JSON.stringify(options.prompt);
      return {
        finishReason: { unified: "stop" },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
        content: [{ type: "text", text: "# Generated Test Brief" }],
        warnings: [],
      } as any;
    },
  });

  const briefOutput = await expandTopicToBrief(created, mockModel);
  console.log(`- expandTopicToBrief returned brief length: ${briefOutput.length}`);
  console.log(`- Product name included in prompt: ${capturedIdea.includes(sampleProduct.name)}`);
  console.log(`- Key benefit included in prompt: ${capturedIdea.includes(sampleProduct.keyBenefit)}`);
  console.log(`- CTA text included in prompt: ${capturedIdea.includes(sampleProduct.ctaText)}`);
  console.log(`- Soft-sell guidance included: ${capturedIdea.includes("soft-sell")}`);

  if (!capturedIdea.includes(sampleProduct.name) || !capturedIdea.includes("soft-sell")) {
    throw new Error("expandTopicToBrief failed to auto-wire product context into brief");
  }
  console.log("✓ Soft-sell auto-wiring verified successfully.\n");

  // 4. Verify Deduplication & Category Balance (TASK 6)
  console.log("4. Testing Deduplication Logic (TASK 6)...");
  const existingTitles = [
    "JWT Itu Bukan Enkripsi",
    "Kenapa Middleware Next.js Sering Bikin Bug",
    "3 AI Tools yang Save 5 Jam per Minggu",
  ];

  const dupCheck1 = isDuplicateTopic("JWT Itu Bukan Enkripsi", existingTitles, 0.70);
  console.log(`- Exact match duplicate check: isDup=${dupCheck1.isDuplicate}, similarity=${(dupCheck1.similarity * 100).toFixed(0)}%`);

  const dupCheck2 = isDuplicateTopic("3 AI Tools yang Menghemat 5 Jam Tiap Minggu", existingTitles, 0.70);
  console.log(`- Paraphrase duplicate check: isDup=${dupCheck2.isDuplicate}, similarity=${(dupCheck2.similarity * 100).toFixed(0)}%`);

  const dupCheck3 = isDuplicateTopic("Belajar Docker dari Nol untuk Pemula", existingTitles, 0.70);
  console.log(`- Non-duplicate check: isDup=${dupCheck3.isDuplicate}, similarity=${(dupCheck3.similarity * 100).toFixed(0)}%`);

  if (!dupCheck1.isDuplicate || !dupCheck2.isDuplicate || dupCheck3.isDuplicate) {
    throw new Error("Deduplication similarity check failed assertion");
  }

  const batchCandidates = [
    {
      title: "JWT Itu Bukan Enkripsi",
      category: "evergreen" as const,
      description: "Duplikat",
      keywords: ["jwt"],
      angle: "fokus: Deep Dive",
      priority: 5,
    },
    {
      title: "Arsitektur Event-Driven dengan RabbitMQ",
      category: "evergreen" as const,
      description: "Topik baru",
      keywords: ["rabbitmq", "event-driven"],
      angle: "fokus: Panduan Praktis",
      priority: 8,
    },
  ];

  const dedupedBatch = filterDuplicateTopics(batchCandidates, existingTitles, 0.70);
  console.log(`- Filtered batch count: ${dedupedBatch.length} (expected 1)`);
  console.log(`- Kept topic: "${dedupedBatch[0].title}"`);
  if (dedupedBatch.length !== 1 || dedupedBatch[0].title !== "Arsitektur Event-Driven dengan RabbitMQ") {
    throw new Error("filterDuplicateTopics failed to remove duplicate candidate");
  }
  console.log("✓ Deduplication logic verified successfully.\n");

  // Clean up dummy topic
  await deleteTopic(created.id, dummyUserId);
  console.log("Cleaned up test topic.");
  console.log("\n=================================================");
  console.log("ALL VERIFICATION CHECKS PASSED!");
  console.log("=================================================");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
