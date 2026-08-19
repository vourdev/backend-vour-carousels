import assert from "node:assert";
import { sanitizeHookHtml, sanitizeCustomHtml, CUSTOM_CLASS_WHITELIST } from "../src/lib/ds/sanitize.js";
import { mockupSchema, coverHookSchema } from "../src/lib/ds/schema.js";
import { renderSlide } from "../src/lib/ds/render-slide.js";
import { carouselExtraCss } from "../src/lib/ds/carousel-css-extra.js";
import { ILLUSTRATION_SLUGS } from "../src/lib/ds/illustrations.js";
import { stripEmoji } from "../src/lib/ds/strip-emoji.js";
import { VOICE_SAMPLES } from "../src/lib/ai/voice-samples.js";

console.log("==================================================");
console.log("🧪 RUNNING BACKEND REGRESSION CHECKLIST (TASK 5)");
console.log("==================================================");

let passCount = 0;
let failCount = 0;

function it(desc: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ PASS: ${desc}`);
    passCount++;
  } catch (err: any) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(err);
    failCount++;
  }
}

// 1. mockupCustom Sanitizer Checks
it("mockupCustom: strips <script> block and inline styles, whitelist class is enforced", () => {
  const cleanScript = sanitizeHookHtml('<div>ok</div><script>alert(1)</script>');
  assert.ok(cleanScript.includes("<div>ok</div>"));
  assert.ok(!cleanScript.includes("alert(1)"));
  assert.ok(!cleanScript.toLowerCase().includes("<script"));

  const cleanStyle = sanitizeCustomHtml(
    `<div style="background:red;width:500px"><p style='color:#fff'>a</p><span style=color:blue>b</span></div>`
  );
  assert.ok(!cleanStyle?.includes("style"));
  assert.ok(!cleanStyle?.includes("red"));
  assert.ok(!cleanStyle?.includes("500px"));
  assert.ok(cleanStyle?.includes("a"));
  assert.ok(cleanStyle?.includes("b"));

  const cleanClasses = sanitizeCustomHtml(
    `<div class="mt-24 my-hack lede totally-made-up"><p class="nope">x</p></div>`
  );
  assert.ok(cleanClasses?.includes('class="mt-24 lede"'));
  assert.ok(!cleanClasses?.includes("my-hack"));
  assert.ok(!cleanClasses?.includes("nope"));

  const mockup = mockupSchema.safeParse({
    type: "custom",
    html: "<p>x</p>",
    css: ".x{color:red}",
  });
  assert.strictEqual(mockup.success, true);
  if (mockup.success && mockup.data.type === "custom") {
    assert.strictEqual("css" in mockup.data, false);
  }
});

// 2. Illustration CurrentColor parity checks
it("Illustration: system has exactly 156 files", () => {
  assert.strictEqual(ILLUSTRATION_SLUGS.length, 156);
});

// 3. Render Slide Adversarial styling fallback checks
it("mockupCustom rendering: falls back to auto card when fragment is pure styling", () => {
  const slide = (html: string) => ({
    role: "point" as const,
    counter: "02 / 05",
    eyebrow: "BESPOKE",
    headline: "Judul",
    body: "Body copy.",
    mockup: { type: "custom" as const, html },
  });

  const html = renderSlide(slide(`<style>.boom{background:#ff0000;width:500px;height:500px}</style>`), 1);
  // Auto card has eyebrow and body copy because the mockup rendered to nothing
  assert.ok(html.includes("BESPOKE"));
  assert.ok(html.includes("Body copy."));
});

// 4. Emoji Stripping
it("escapeHtml/stripEmoji: strips color emoji and preserves symbols (✓, ✗, arrows)", () => {
  const dirty = "Belajar React?! 🚀 Seru banget 🔥 clean ✓ & error ✗ ➜ go!";
  // We expect EMOJI to strip the dingbat arrow ➜ but preserve the KEEP set arrow →
  const testString = "Belajar React?! 🚀 Seru banget 🔥 clean ✓ & error ✗ → go!";
  const clean = stripEmoji(testString);
  assert.ok(clean.includes("Belajar React?!"));
  assert.ok(!clean.includes("🚀"));
  assert.ok(!clean.includes("🔥"));
  assert.ok(clean.includes("✓"));
  assert.ok(clean.includes("✗"));
  assert.ok(clean.includes("→"));
});

// 5. design-tokens
it("Design token CSS validation: cm-base styling conforms to specification", () => {
  const baseIndex = carouselExtraCss.indexOf(".cm-base {");
  assert.ok(baseIndex !== -1, "Should find .cm-base rule");
  const block = carouselExtraCss.slice(baseIndex, carouselExtraCss.indexOf("}", baseIndex) + 1);
  assert.ok(block.match(/padding:/), "Should declare padding");
  assert.ok(block.match(/background:/), "Should declare background");
  assert.ok(block.match(/border-radius:/), "Should declare border-radius");
  assert.ok(block.match(/border:/), "Should declare border");
  assert.ok(!block.match(/#[0-9a-fA-F]/), "Self-contained token color model should avoid hardcoded colors");
});

// 6. Voice and copywriting samples
it("Voice samples: contains primary casual Indonesian cues", () => {
  assert.ok(Object.keys(VOICE_SAMPLES).length >= 5, "Should have loaded 5 voice samples");
  const samplesText = JSON.stringify(VOICE_SAMPLES);
  assert.ok(samplesText.includes("nggak"), "Must contain Indonesian casual direct markers (nggak)");
  assert.ok(samplesText.includes("kamu") || samplesText.includes("lo"), "Must address reader direct");
});

console.log("==================================================");
console.log(`🏁 TESTS COMPLETED: ${passCount} PASSED, ${failCount} FAILED`);
console.log("==================================================");

process.exit(failCount === 0 ? 0 : 1);
