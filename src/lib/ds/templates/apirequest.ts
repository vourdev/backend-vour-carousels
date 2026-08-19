// API Request mockup — method badge, path, headers and response body.
export const apiRequestTemplate = String.raw`<div class="diag-wrap mt-40">
  <div class="diag-api-request">
    <div class="api-header">
      <span class="api-method api-method-{{method}}">{{method}}</span>
      <span class="api-url">{{url}}</span>
      <span class="api-status">{{status}}</span>
    </div>
    {{#hasHeaders}}
    <div class="api-headers">
      HEADERS_INJECT
    </div>
    {{/hasHeaders}}
    <div class="api-body">
      <pre><code>RESPONSE_BODY_INJECT</code></pre>
    </div>
  </div>
</div>`;
