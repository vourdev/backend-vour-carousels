// Mirrors the <style> block of "design-system/TEMPLATE-editorial-v3.html".
// Do not hand-edit one without the other: the Vour palette re-base was applied to both
// by the same mapping, and the template is still the source to re-copy from.
export const carouselCss = String.raw`
  /* ════════════════════════════════════════════════════════
     DO NOT EDIT THIS STYLE BLOCK.
     Replace content inside <section> tags only.
     ════════════════════════════════════════════════════════ */
  *, *::before, *::after { box-sizing: border-box; }

  section {
    width: 1080px; height: 1350px;
    padding: 96px 80px 80px;
    /* Light surface. Two orange washes give the corners some life, and a 32px dot grid
       at 5.5% keeps the field from reading as flat printer white. The dots are the same
       accent orange as the headline, so the texture belongs to the brand rather than
       being generic paper noise. The washes are held at 5-7%: ember carries far more
       perceived weight per unit of alpha than a cool hue, and past that the corner stops
       reading as light in the room and starts reading as a coloured panel. */
    background:
      radial-gradient(circle at 1px 1px, rgba(238,75,26,0.055) 1.5px, transparent 1.6px) 0 0 / 32px 32px,
      radial-gradient(55% 40% at 100% 0%, rgba(238,75,26,0.07), transparent 65%),
      radial-gradient(60% 50% at 10% 100%, rgba(238,75,26,0.05), transparent 70%),
      #FBF6EF;
    color: #1C0A05;
    font-family: 'Inter', system-ui, sans-serif;
    overflow: hidden;
    display: flex; flex-direction: column;
    position: relative;
  }

  .eyebrow {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-weight: 500; font-size: 24px; line-height: 1;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: #B8380E;
  }
  /* The slide counter is a stamp, not chrome: same mono face and same accent as the
     eyebrow it shares a row with, so the two read as one masthead rather than as a
     label plus a piece of grey furniture. Weight and tracking keep it subordinate. */
  .counter {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-weight: 500; font-size: 24px; line-height: 1;
    letter-spacing: 0.04em; color: #B8380E;
  }
  h1 { font-family: 'Sora', system-ui, sans-serif;
    font-weight: 800; font-size: 104px; line-height: 1.02;
    letter-spacing: -0.025em; margin: 0; color: #1C0A05;
  }
  h1.hero { font-size: 128px; line-height: 0.98; }               /* --fs-title-lg — cover */
  h1.compact { font-size: 88px; line-height: 1.04; }             /* USE ON EVERY MOCKUP SLIDE — see MAKING_CAROUSELS.md §7 */
  h1 .a   { color: #EE4B1A; }                                    /* the accent word — exactly ONE per headline */

  .lede, .body-text {
    font-family: 'Inter', system-ui, sans-serif;
    font-weight: 500; font-size: 32px; line-height: 1.4;
    color: #3D2419; margin: 0;
  }

  .mt-8{margin-top:8px;} .mt-16{margin-top:16px;} .mt-24{margin-top:24px;}
  .mt-32{margin-top:32px;} .mt-40{margin-top:40px;} .mt-48{margin-top:48px;}
  .mt-64{margin-top:64px;}

  .brand-row { display: flex; align-items: center; gap: 16px; }
  .brand-disc {
    width: 72px; height: 72px; border-radius: 50%;
    overflow: hidden; background: #1C0A05; flex: none;
  }
  .brand-disc.sm { width: 44px; height: 44px; }
  .brand-disc img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .brand-handle {
    font-family: 'Inter', system-ui, sans-serif;
    font-weight: 700; font-size: 32px; color: #1C0A05;
  }

  /* ── Info card (editorial — pick ONE background per slide) ──
     Six tones, kept six: they are what stops a deck reading as one flat colour, and
     collapsing them into a single accent would trade brand consistency for monotony.
     The CLASS NAMES are the schema's tone enum and cannot change — renaming one would
     invalidate every plan already stored in the carousels table. With no second accent
     in the system these six ARE the deck's colour variety, so they stay six: three warm,
     three cool, each name describing its own value. Every ink used on them is >= 4.5:1,
     and the small-text ember clears it on all six (4.55:1 on pink, the tightest). */
  .card { border-radius: 24px; padding: 32px; }
  .card-peach  { background: #FBE9D9; }   /* neutral / default */
  .card-stone  { background: #EDE7DA; }   /* loser / scraped */
  .card-mint   { background: #E3F1E1; }   /* success */
  .card-sky    { background: #DEEAF7; }   /* tooling / info */
  .card-pink   { background: #F7DDE6; }   /* design */
  .card-amber  { background: #FBE7B0; }   /* highlight / perf */
  .card-head   { display: flex; align-items: center; gap: 16px; }
  .card-ico    {
    width: 48px; height: 48px; border-radius: 12px;
    background: rgba(28,10,5,0.06);
    display: flex; align-items: center; justify-content: center; flex: none;
  }
  .card-title  {
    font-family: 'Sora', system-ui, sans-serif;
    font-weight: 700; font-size: 40px; line-height: 1.15; color: #1C0A05;
  }
  .card-body   {
    font-family: 'Inter', system-ui, sans-serif;
    font-weight: 500; font-size: 28px; line-height: 1.4; color: #3D2419;
    margin-top: 8px;
  }
  /* Pinned to the light-surface accent, not to --ms-accent: cards keep their pale tone
     background on the dark canvas too, so the token would resolve to the bright
     dark-surface orange and land at 2.2:1 on a #FBE9D9 tile. */
  .card-label  {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-weight: 500; font-size: 24px; letter-spacing: 0.18em;
    text-transform: uppercase; margin-bottom: 16px; color: #B8380E;
  }

  .highlight {
    border-radius: 20px; padding: 24px 28px; background: #FBE9D9;
  }
  .highlight .strong {
    font-family: 'Sora'; font-weight: 700; font-size: 32px; line-height: 1.2;
    color: #EE4B1A;
  }
  .highlight .sub {
    font-family: 'Inter'; font-weight: 500; font-size: 26px; line-height: 1.4;
    color: #3D2419; margin-top: 8px;
  }

  /* Inverts against whatever surface it sits on — that inversion IS the emphasis.
     Literal colours here went black-on-black once logo black became the dark base. */
  .callout {
    background: var(--ms-invert-bg); color: var(--ms-invert-fg);
    border-radius: 20px; padding: 32px;
    display: flex; align-items: flex-start; gap: 16px;
    font-family: 'Inter'; font-weight: 500; font-size: 28px; line-height: 1.4;
  }
  .callout-ico {
    width: 40px; height: 40px; border-radius: 10px;
    background: var(--ms-invert-chip);
    display: flex; align-items: center; justify-content: center; flex: none;
  }

  .step {
    background: #FBE9D9; border-radius: 20px; padding: 32px;
    display: flex; gap: 20px; align-items: flex-start;
  }
  .step.amber { background: #FBE7B0; }
  .badge {
    width: 40px; height: 40px; border-radius: 50%;
    background: #B8380E; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Sora'; font-weight: 700; font-size: 22px; flex: none;
  }
  .step-title {
    font-family: 'Sora'; font-weight: 700; font-size: 32px; line-height: 1.15;
    color: #1C0A05;
  }
  .step-body  {
    font-family: 'Inter'; font-weight: 500; font-size: 28px; line-height: 1.4;
    color: #3D2419; margin-top: 4px;
  }

  .flex-col { display: flex; flex-direction: column; }
  .flex-grow { flex: 1; }
  .gap-16 { gap: 16px; }

  /* MOCKUP SLIDE WRAPPER — wraps every terminal / scene / perm-table / diag-*.
     flex:1 lets the wrapper grow into the free space between description and catatan.
     min-height:0 lets it SHRINK when the mock is tall — without it, a tall terminal
     pushes CATATAN off the 1350 canvas. Do not remove either declaration.
     See MAKING_CAROUSELS.md §7 for the full contract. */
  .diag-wrap {
    flex: 1; min-height: 0;
    display: flex; align-items: center; justify-content: center;
    width: 100%;
  }
  .diag-wrap > * { max-width: 100%; }
  /* A wrapper holding MORE THAN ONE block stacks. .diag-wrap is a row flex, which is
     right for the single-mockup case it was written for; the moment a template puts a
     mockup AND its .catatan inside it, the note is laid out BESIDE the mockup and
     squeezed into whatever width is left. That is what "05 / 07 / 08 not responsive"
     was: the comparison bars, the illustrated scene and the permission table all nest
     their note this way, and the note ended up a narrow column pinned to the right
     edge. Scoped with :has() so the single-child case keeps its row centering. */
  .diag-wrap:has(> * + *) {
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 8px;
  }

  /* Lede + body caps — stop text-only slides from overflowing the safe area. */
  .lede { max-width: 900px; }
  .body-text { max-width: 900px; }

  /* The swipe CTA is the only instruction on the cover, so it carries the accent — text
     AND arrow, not just a coloured rule beside neutral copy. It used to be #7E6153 here
     and was only recoloured under section.cover-ink, so every cover that resolved to a
     Paper surface shipped a grey "Geser →". */
  .geser {
    font-family: 'JetBrains Mono'; font-size: 22px; color: #B8380E;
    font-weight: 600; letter-spacing: 0.04em;
    position: absolute; bottom: 80px; left: 80px;
  }

  /* ═════════════════════════════════════════════════════
     LINE-DIAGRAM COMPONENTS
     Editorial surface only. Every component below is designed
     for the same 1080×1350 canvas as the classic slides.
     ═════════════════════════════════════════════════════ */

  /* Base line-art node */
  .node {
    display: inline-flex; align-items: center; gap: 12px;
    padding: 14px 24px; min-height: 64px;
    background: #FDFBF6;
    border: 1.5px solid #1C0A05;
    border-radius: 16px;
    font-family: 'JetBrains Mono'; font-weight: 500; font-size: 26px;
    line-height: 1; color: #1C0A05; white-space: nowrap;
  }
  /* The one place white sits on the BRAND ember rather than on the deeper sibling: this
     node is Sora 700 at 26px (44px in .big), which is display size, so its 3.71:1 clears
     the 3:1 large text needs. Anything smaller in a solid ember block — badges, buttons,
     the crown — uses #B8380E and its 5.82:1 instead. */
  .node.filled {
    background: #EE4B1A; border-color: #EE4B1A; color: #fff;
    font-family: 'Sora'; font-weight: 700;
  }
  .node.big {
    padding: 20px 44px; min-height: 96px; font-size: 44px;
    font-family: 'Sora'; font-weight: 700; border-radius: 20px;
  }
  .node.mint  { border-color: #356B34; color: #356B34; }
  .node.sky   { border-color: #245F8F; color: #245F8F; }
  .node.amber { border-color: #B8380E; color: #B8380E; }
  .node.pink  { border-color: #5C5CA8; color: #5C5CA8; }
  .node.red   { border-color: #726358; color: #726358; }

  /* CATATAN recap panel at slide bottom */
  .catatan {
    border: 1.5px solid #EE4B1A; border-radius: 16px; padding: 24px 32px;
  }
  .catatan-label {
    font-family: 'JetBrains Mono'; font-weight: 500; font-size: 22px;
    letter-spacing: 0.18em; text-transform: uppercase; color: #B8380E;
  }
  .catatan-body {
    margin-top: 8px; font-family: 'Sora'; font-weight: 700;
    font-size: 32px; color: #1C0A05;
  }

  /* Concept hub: center node → 3-5 child pills below */
  .diag-hub { position: relative; width: 100%; height: 380px; }
  .diag-hub .center { position: absolute; top: 0; left: 50%; transform: translateX(-50%); z-index: 2; }
  .diag-hub .children { position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; }
  .diag-hub svg.lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
  .diag-hub svg.lines .stroke { stroke: #EE4B1A; stroke-width: 1.5; fill: none; }
  .diag-hub svg.lines .head { fill: #EE4B1A; }

  /* Flow chain: horizontal row of nodes + arrows */
  .diag-flow { display: flex; align-items: center; gap: 20px; justify-content: center; }
  .diag-flow .arrow { color: #EE4B1A; font-size: 40px; line-height: 1; font-family: 'JetBrains Mono'; }

  /* Token strip: chip row with ↓ under each */
  .diag-tokens { display: flex; gap: 20px; align-items: flex-start; justify-content: center; }
  .diag-tokens .chip-col { display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .diag-tokens .chip {
    padding: 14px 24px; border: 1.5px solid #EE4B1A; border-radius: 12px;
    background: #FDFBF6; font-family: 'JetBrains Mono'; font-weight: 500; font-size: 28px;
    color: #1C0A05; min-width: 96px; text-align: center; line-height: 1;
  }
  .diag-tokens .drop { color: #6E4B3E; font-size: 32px; line-height: 1; }

  /* Comparison bars: two panels side-by-side */
  .diag-bars { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .diag-bars .panel { border: 1.5px solid #EE4B1A; border-radius: 20px; padding: 28px 32px; min-height: 220px; display: flex; flex-direction: column; gap: 16px; }
  .diag-bars .panel.loser { border-color: #726358; }
  .diag-bars .panel .h {
    font-family: 'JetBrains Mono'; font-weight: 500; font-size: 22px;
    letter-spacing: 0.18em; text-transform: uppercase; color: #B8380E;
  }
  .diag-bars .panel.loser .h { color: #726358; }
  .diag-bars .panel .rows { display: flex; flex-direction: column; gap: 14px; flex: 1; justify-content: center; }
  .diag-bars .bar { height: 24px; border-radius: 6px; background: #EE4B1A; }
  .diag-bars .bar.faded { background: #726358; opacity: 0.35; }
  .diag-bars .bar.dim   { background: #7E6153; opacity: 0.45; }
  .diag-bars .panel .foot {
    font-family: 'JetBrains Mono'; font-weight: 500; font-size: 22px;
    letter-spacing: 0.14em; text-transform: uppercase; color: #B8380E;
    word-break: break-word; overflow-wrap: anywhere;
  }
  .diag-bars .panel.loser .foot { color: #726358; }

  /* Icon hub: center node → 4 tool icons + dashed arrows */
  .diag-icon-hub { position: relative; width: 100%; height: 400px; }
  .diag-icon-hub .center { position: absolute; top: 0; left: 50%; transform: translateX(-50%); z-index: 2; }
  .diag-icon-hub .tools { position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-end; }
  .diag-icon-hub .tool { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 22%; }
  .diag-icon-hub .tool .glyph { width: 88px; height: 88px; }
  .diag-icon-hub .tool .glyph svg { width: 100%; height: 100%; stroke: var(--ms-fg); stroke-width: 1.5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .diag-icon-hub .tool .label { font-family: 'JetBrains Mono'; font-size: 22px; color: var(--ms-fg-muted); text-align: center; }
  .diag-icon-hub svg.lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
  .diag-icon-hub svg.lines .stroke { stroke: #EE4B1A; stroke-width: 1.5; fill: none; stroke-dasharray: 6 6; }
  .diag-icon-hub svg.lines .head { fill: #EE4B1A; }

  /* Terminal code block */
  .terminal { background: #1C0A05; border: 1.5px solid #382E25; border-radius: 20px; padding: 36px 40px; color: #fff; font-family: 'JetBrains Mono'; width: 100%; }
  .terminal-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
  .terminal-bar .dot { width: 14px; height: 14px; border-radius: 50%; }
  .terminal-bar .dot.r { background: #A0503A; }
  .terminal-bar .dot.y { background: #C08A3A; }
  .terminal-bar .dot.g { background: #86C97F; }
  .terminal-bar .title { margin-left: 16px; color: rgba(255,255,255,0.55); font-size: 22px; }
  .terminal-bar .urlbar { margin-left: 16px; flex: 1; background: rgba(255,255,255,0.10); color: rgba(255,255,255,0.75); font-family: 'JetBrains Mono'; font-size: 20px; padding: 8px 18px; border-radius: 999px; text-align: center; }
  .terminal-body { font-family: 'JetBrains Mono'; font-size: 24px; line-height: 1.6; color: #fff; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
  .terminal-body .cmt { color: rgba(247,241,232,0.45); }
  .terminal-body .key { color: #FBBF77; }
  .terminal-body .val { color: #B79CF2; }
  .terminal-body .kw  { color: #86C97F; }
  .terminal-body .str { color: #B79CF2; }
  .terminal-body .num { color: #86C97F; }

  /* Permission table */
  .perm-table { display: flex; flex-direction: column; gap: 16px; }
  .perm-row { display: grid; grid-template-columns: 220px 1fr; gap: 32px; align-items: center; border: 1.5px solid #1C0A05; border-radius: 20px; padding: 24px 28px; }
  .perm-user { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .perm-user .avatar { width: 72px; height: 72px; position: relative; }
  .perm-user .avatar svg { width: 100%; height: 100%; stroke: #1C0A05; stroke-width: 1.5; fill: none; }
  .perm-user .avatar .crown { position: absolute; bottom: -4px; right: -4px; width: 28px; height: 28px; background: #B8380E; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-family: 'Sora'; font-weight: 700; }
  .perm-user .role { font-family: 'Sora'; font-weight: 700; font-size: 26px; color: #1C0A05; }
  .perm-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .perm-cell { border: 1.5px solid #1C0A05; border-radius: 12px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; font-family: 'JetBrains Mono'; font-weight: 500; font-size: 22px; color: #1C0A05; }
  .perm-cell .yes { color: #356B34; font-size: 24px; }
  .perm-cell .no  { color: #726358; font-size: 24px; }

  /* Recap checklist */
  .checklist { display: flex; flex-direction: column; gap: 20px; margin: 0; padding: 0; list-style: none; }
  .checklist li { display: flex; align-items: center; gap: 24px; font-family: 'Sora'; font-weight: 500; font-size: 40px; color: #1C0A05; }
  .checklist .tick { color: #356B34; font-size: 40px; line-height: 1; width: 44px; flex: none; }

  /* Illustrated scene (login-form + locked-panel mockup) */
  .scene { display: grid; grid-template-columns: 1fr auto 1fr; gap: 20px; align-items: stretch; }
  .mock { border: 1.5px solid #1C0A05; border-radius: 20px; padding: 24px; background: #FDFBF6; min-height: 360px; display: flex; flex-direction: column; gap: 14px; position: relative; overflow: hidden; }
  .mock-head { font-family: 'JetBrains Mono'; font-size: 20px; letter-spacing: 0.18em; text-transform: uppercase; color: #6E4B3E; border-bottom: 1px dashed #7E6153; padding-bottom: 12px; }
  .mock-field { border: 1px solid #1C0A05; border-radius: 12px; padding: 12px 16px; font-family: 'JetBrains Mono'; font-size: 20px; color: #6E4B3E; }
  .mock-btn { background: #B8380E; color: #fff; border-radius: 12px; padding: 12px 16px; font-family: 'Sora'; font-weight: 700; font-size: 20px; text-align: center; }
  .mock-body { display: flex; flex-direction: column; gap: 12px; }
  .mock.locked .mock-body { opacity: 0.22; filter: blur(1.5px); pointer-events: none; }
  .mock-overlay { position: absolute; inset: 0; padding: 24px; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .mock-lock { display: inline-flex; align-items: center; gap: 12px; padding: 14px 22px; border-radius: 999px; background: #1C0A05; color: #fff; font-family: 'JetBrains Mono'; font-weight: 500; font-size: 20px; letter-spacing: 0.08em; text-transform: uppercase; box-shadow: 0 12px 32px rgba(28,10,5,0.28); }
  .mock-lock svg { width: 26px; height: 26px; }
  .scene-arrow { font-family: 'JetBrains Mono'; font-size: 40px; color: #EE4B1A; align-self: center; }
`;
