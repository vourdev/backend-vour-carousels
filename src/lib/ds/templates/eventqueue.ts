// Event Queue mockup — Producer, broker queue with messages, and consumer.
export const eventQueueTemplate = String.raw`<div class="diag-wrap mt-40">
  <div class="diag-event-queue">
    <div class="eq-node producer">
      <div class="eq-node-title">{{producer}}</div>
      <div class="eq-node-role">PRODUCER</div>
    </div>
    
    <div class="eq-broker">
      <div class="eq-broker-title">{{topicName}}</div>
      <div class="eq-messages">
        EVENTS_INJECT
      </div>
      <div class="eq-broker-role">TOPIC / QUEUE</div>
    </div>
    
    <div class="eq-node consumer">
      <div class="eq-node-title">{{consumer}}</div>
      <div class="eq-node-role">CONSUMER</div>
    </div>
  </div>
</div>`;
