# Phase 6: Notifications & Webhooks (BullMQ)

## Status: Completed

## Goals
- Reliable async job processing with BullMQ
- Webhook delivery with retries and backoff
- User notifications for transaction events
- Dead letter queue for failed deliveries

---

## Dependencies
```bash
npm install bullmq axios crypto
```

---

## Implementation

### Queue Infrastructure
```
src/queues/
├── queue.config.ts           # BullMQ connection setup
├── notification.queue.ts     # Notification job definitions
├── webhook.queue.ts          # Webhook delivery jobs
└── workers/
    ├── notification.worker.ts
    └── webhook.worker.ts
```

### Notification Service
```
src/services/notification/
├── notification.service.ts   # Queue notification jobs
├── notification.events.ts    # Listen for transaction events
└── notification.types.ts     # Notification types
```

### Webhook Service
```
src/services/webhook/
├── webhook.service.ts        # Manage subscriptions
├── webhook.delivery.ts       # Send with retries
├── webhook.routes.ts         # CRUD endpoints
├── webhook.controller.ts     # HTTP handlers
└── webhook.model.ts          # Subscription schema
```

---

## Queue Configuration

### BullMQ Setup
```typescript
import { Queue, Worker, QueueScheduler } from 'bullmq';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

export const webhookQueue = new Queue('webhooks', { connection });
export const notificationQueue = new Queue('notifications', { connection });
```

### Job Options
```typescript
const defaultJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000,  // 1s, 2s, 4s, 8s, 16s
  },
  removeOnComplete: 100,
  removeOnFail: 1000,
};
```

---

## Webhook Subscription Model

```typescript
interface IWebhookSubscription {
  webhookId: string;
  userId: string;
  url: string;
  secret: string;           // For HMAC signature
  events: EventType[];      // Which events to send
  isActive: boolean;
  createdAt: Date;
}
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/webhooks` | Yes | Register webhook |
| GET | `/webhooks` | Yes | List user's webhooks |
| GET | `/webhooks/:id` | Yes | Get webhook details |
| PATCH | `/webhooks/:id` | Yes | Update webhook |
| DELETE | `/webhooks/:id` | Yes | Remove webhook |
| GET | `/webhooks/:id/logs` | Yes | Delivery history |

### Register Webhook
```typescript
POST /webhooks
{
  "url": "https://merchant.com/payflow-callback",
  "events": ["TRANSACTION_COMPLETED", "TRANSACTION_FAILED"],
  "secret": "optional-custom-secret"
}
```

---

## Webhook Delivery

### Payload Format
```typescript
interface WebhookPayload {
  event: EventType;
  transactionId: string;
  status: string;
  amount: number;
  currency: string;
  timestamp: string;
  signature: string;
}
```

### HMAC Signature
```typescript
function signPayload(payload: object, secret: string): string {
  const data = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

// Header: X-PayFlow-Signature: sha256=abc123...
```

### Delivery Worker
```typescript
const webhookWorker = new Worker('webhooks', async (job) => {
  const { webhookId, payload } = job.data;
  const subscription = await WebhookSubscription.findById(webhookId);

  const signature = signPayload(payload, subscription.secret);

  const response = await axios.post(subscription.url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-PayFlow-Signature': `sha256=${signature}`,
    },
    timeout: 5000,
  });

  // Log successful delivery
  await WebhookDelivery.create({
    webhookId,
    payload,
    status: 'SUCCESS',
    responseCode: response.status,
  });

}, { connection });
```

---

## Dead Letter Queue

Failed jobs after all retries go to DLQ:
```typescript
webhookWorker.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await WebhookDelivery.create({
      webhookId: job.data.webhookId,
      payload: job.data.payload,
      status: 'FAILED',
      error: err.message,
    });

    // Optionally disable webhook after N failures
  }
});
```

---

## Notification Types

```typescript
enum NotificationType {
  TRANSACTION_INITIATED = 'Your transfer of ₹{amount} has been initiated',
  TRANSACTION_COMPLETED = 'Transfer of ₹{amount} to {receiver} successful',
  TRANSACTION_FAILED = 'Transfer failed. ₹{amount} has been refunded',
  CREDIT_RECEIVED = 'You received ₹{amount} from {sender}',
}
```

---

## E2E Tests Required

1. **Webhook Registration**
   - Create webhook subscription
   - Update/delete subscription
   - List subscriptions

2. **Webhook Delivery**
   - Successful delivery logged
   - Signature verification works
   - Retry on failure

3. **Queue Processing**
   - Jobs processed in order
   - Failed jobs retried
   - Dead letter after max attempts

4. **Event Integration**
   - TRANSACTION_COMPLETED triggers webhook
   - TRANSACTION_FAILED triggers webhook

---

## Files to Create

- `src/queues/queue.config.ts`
- `src/queues/webhook.queue.ts`
- `src/queues/notification.queue.ts`
- `src/queues/workers/webhook.worker.ts`
- `src/queues/workers/notification.worker.ts`
- `src/services/webhook/webhook.service.ts`
- `src/services/webhook/webhook.controller.ts`
- `src/services/webhook/webhook.routes.ts`
- `src/services/webhook/webhook.model.ts`
- `src/services/notification/notification.service.ts`
- `src/services/notification/notification.events.ts`
- `src/models/WebhookSubscription.ts`
- `src/models/WebhookDelivery.ts`
- `tests/e2e/webhook.test.ts`

---

## Success Criteria
- [x] Webhooks can be registered
- [x] Deliveries include HMAC signature
- [x] Failed deliveries retry with backoff
- [x] Dead letter queue captures failures
- [x] Delivery logs accessible
- [x] All E2E tests pass (23 webhook tests + 142 total E2E tests)

---

## Previous Phase
← [Phase 5: Ledger Service](./PHASE-5-LEDGER-SERVICE.md)

## Next Phase
→ [Phase 7: Observability](./PHASE-7-OBSERVABILITY.md)
