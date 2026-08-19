// Architecture mockup — hierarchical load-balancing topology.
export const architectureTemplate = String.raw`<div class="diag-wrap mt-40">
  <div class="diag-architecture">
    {{#title}}<div class="arch-title">{{title}}</div>{{/title}}
    <div class="arch-row client-row">
      CLIENT_NODE_INJECT
    </div>
    <div class="arch-arrow-down">ARROW_DOWN_INJECT</div>
    <div class="arch-row router-row">
      ROUTER_NODE_INJECT
    </div>
    <div class="arch-arrows-split">ARROW_SPLIT_INJECT</div>
    <div class="arch-row nodes-row">
      NODES_INJECT
    </div>
  </div>
</div>`;
