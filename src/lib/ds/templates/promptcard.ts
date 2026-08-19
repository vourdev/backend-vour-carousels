// Prompt-card mockup — a copy-paste AI prompt in a bordered mono block.
// v1.0 "Engineering Editorial" (SHOWCASE-mockups.html § "Prompt Card").
// {{body}} is escaped by fillTemplate and kept flush-left: the <pre> uses
// white-space:pre-wrap, so any leading template indentation would render.
export const promptCardTemplate = String.raw`<div class="diag-wrap mt-40">
    <div class="prompt"><span class="lbl">{{label}}</span>
<pre>{{body}}</pre></div>
  </div>`;
