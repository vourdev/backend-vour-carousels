// Config mockup — formatted yaml/properties config file.
export const configTemplate = String.raw`<div class="diag-wrap mt-40">
  <div class="diag-config">
    <div class="terminal-bar">
      <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
      <span class="title">{{filename}}</span>
    </div>
    <div class="config-body">
      CONFIG_LINES_INJECT
    </div>
  </div>
</div>`;
