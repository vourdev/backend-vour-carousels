import type { SlidePlan } from "../ds/schema";
import { renderSlide } from "../ds/render-slide";
import { carouselCss } from "../ds/carousel-css";
import { carouselExtraCss } from "../ds/carousel-css-extra";
import { inlineFontFaceCss } from "../ds/fonts-inline";

export function assembleCarousel(plan: SlidePlan): string {
  const { title, caption, hashtags, slides } = plan;
  const meta = JSON.stringify(
    { title, caption, hashtags },
    null,
    2
  );
  // Index is passed explicitly: renderSlide uses it to scope any custom CSS to
  // its own slide, so one slide's <style> cannot restyle the rest of the deck.
  const body = slides.map((slide, i) => renderSlide(slide, i)).join("\n");
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<script type="application/json" id="vourdev-meta">
${meta}
</script>
<style>${inlineFontFaceCss}</style>
<style>${carouselCss}</style>
<style>${carouselExtraCss}</style>
</head>
<body>
${body}
</body>
</html>`;
}
