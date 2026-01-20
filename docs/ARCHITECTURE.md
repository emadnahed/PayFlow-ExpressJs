# PayFlow Architecture

## Overview

PayFlow is an event-driven payment system built with Express.js, implementing the Saga pattern for distributed transaction management. The system ensures data consistency and reliability through compensating transactions.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│                   (Mobile App / Web App / API)                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Rate Limiter │  │  Auth JWT    │  │  Idempotency Guard   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Helmet     │  │    CORS      │  │  Request Validation  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Service Layer                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                 Transaction Service                     │    │
│  │              (Saga Orchestrator)                        │    │
│  │                                                         │    │
│  │   ┌─────────┐   ┌─────────┐   ┌─────────────────┐     │    │
│  │   │ Create  │──▶│  Debit  │──▶│     Credit      │     │    │
│  │   └─────────┘   └────┬────┘   └────────┬────────┘     │    │
│  │                      │                  │              │    │
│  │                      ▼                  ▼              │    │
│  │              ┌───────────────┐  ┌──────────────┐      │    │
│  │              │   Refund      │◀─│   Complete   │      │    │
│  │              │(Compensation) │  └──────────────┘      │    │
│  │              └───────────────┘                         │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │ Wallet Service │  │ Ledger Service │  │ Webhook Service│    │
│  │                │  │                │  │                │    │
│  │ - Get Balance  │  │ - Credit       │  │ - Subscribe    │    │
│  │ - Debit        │  │ - Refund       │  │ - Deliver      │    │
│  │ - Credit       │  │ - Simulation   │  │ - Retry        │    │
│  │ - History      │  │                │  │                │    │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘    │
│          │                   │                   │              │
└──────────┼───────────────────┼───────────────────┼──────────────┘
           │                   │                   │
           ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Event Bus (Redis)                          │
│                                                                  │
│   Events: TRANSACTION_INITIATED, DEBIT_SUCCESS, CREDIT_SUCCESS  │
│           TRANSACTION_COMPLETED, TRANSACTION_FAILED, etc.       │
│                                                                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   MongoDB        │ │     Redis        │ │   BullMQ         │
│                  │ │                  │ │   Queues         │
│ - Users          │ │ - Sessions       │ │                  │
│ - Wallets        │ │ - Rate Limits    │ │ - Webhook Queue  │
│ - Transactions   │ │ - Idempotency    │ │ - Notification   │
│ - Webhooks       │ │ - Event Pub/Sub  │ │   Queue          │
│ - Operations     │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

## Transaction State Machine

```
                    ┌─────────────┐
                    │  INITIATED  │
                    └──────┬──────┘
                           │
                    Debit Wallet
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
       ┌─────────────┐          ┌─────────────┐
       │   DEBITED   │          │   FAILED    │
       └──────┬──────┘          └─────────────┘
              │
       Credit Receiver
              │
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
┌─────────────┐  ┌─────────────┐
│  CREDITED   │  │  REFUNDING  │
└──────┬──────┘  └──────┬──────┘
       │                │
  Mark Complete    Refund Sender
       │                │
       ▼         ┌──────┴──────┐
┌─────────────┐  │             │
│  COMPLETED  │  ▼             ▼
└─────────────┘ ┌─────────────┐┌─────────────┐
                │  REFUNDED   ││   FAILED    │
                └─────────────┘└─────────────┘
```

## Component Responsibilities

### API Gateway Layer

| Component | Responsibility |
|-----------|----------------|
| Rate Limiter | Prevents abuse, Redis-backed for distributed limiting |
| Auth Middleware | JWT validation, user context injection |
| Idempotency Guard | Prevents duplicate requests, 24h key caching |
| Helmet | Security headers (CSP, HSTS, XSS protection) |
| Request Validation | Input sanitization using express-validator |

### Service Layer

| Service | Responsibility |
|---------|----------------|
| Auth Service | User registration, login, token management |
| Wallet Service | Balance management, debit/credit operations |
| Transaction Service | Saga orchestration, state transitions |
| Ledger Service | Receiver credits, compensation handling |
| Webhook Service | Event subscriptions, delivery with retries |

### Data Layer

| Store | Purpose |
|-------|---------|
| MongoDB | Persistent data (users, wallets, transactions) |
| Redis | Caching, sessions, pub/sub, rate limits |
| BullMQ | Job queues for async processing |

## Saga Pattern Implementation

### Flow Overview

1. **Initiate Transaction**
   - Validate request
   - Create transaction record (INITIATED)
   - Publish `TRANSACTION_INITIATED` event

2. **Debit Sender**
   - Verify sufficient balance
   - Perform atomic debit operation
   - Update transaction (DEBITED)
   - Publish `DEBIT_SUCCESS` event

3. **Credit Receiver**
   - Credit receiver wallet via Ledger Service
   - Update transaction (CREDITED)
   - Publish `CREDIT_SUCCESS` event

4. **Complete Transaction**
   - Mark transaction (COMPLETED)
   - Publish `TRANSACTION_COMPLETED` event
   - Trigger webhooks

### Compensation Flow

If credit fails:

1. Mark transaction (REFUNDING)
2. Publish `REFUND_REQUESTED` event
3. Restore sender balance
4. Mark transaction (REFUNDED or FAILED)
5. Publish compensation events

## Event System

### Event Types

```typescript
enum PayFlowEvent {
  // Transaction lifecycle
  TRANSACTION_INITIATED = 'TRANSACTION_INITIATED',
  TRANSACTION_COMPLETED = 'TRANSACTION_COMPLETED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',

  // Wallet operations
  DEBIT_SUCCESS = 'DEBIT_SUCCESS',
  DEBIT_FAILED = 'DEBIT_FAILED',
  CREDIT_SUCCESS = 'CREDIT_SUCCESS',
  CREDIT_FAILED = 'CREDIT_FAILED',

  // Compensation
  REFUND_REQUESTED = 'REFUND_REQUESTED',
  REFUND_COMPLETED = 'REFUND_COMPLETED',
  REFUND_FAILED = 'REFUND_FAILED',
}
```

### Event Flow

```
Transaction Created
        │
        ▼
┌──────────────────┐
│ TRANSACTION_     │
│ INITIATED        │──────────────────────────────┐
└────────┬─────────┘                              │
         │                                        │
         ▼                                        ▼
┌──────────────────┐                    ┌──────────────────┐
│ DEBIT_SUCCESS    │                    │ Webhook Queue    │
└────────┬─────────┘                    └──────────────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│ CREDIT_SUCCESS   │────▶│ TRANSACTION_     │
└──────────────────┘     │ COMPLETED        │
         │               └──────────────────┘
         │
         │ (on failure)
         ▼
┌──────────────────┐     ┌──────────────────┐
│ REFUND_REQUESTED │────▶│ REFUND_COMPLETED │
└──────────────────┘     └──────────────────┘
```

## Security Architecture

### Authentication Flow

```
Client                    Server                    Database
  │                         │                          │
  │──POST /auth/login──────▶│                          │
  │                         │──Verify credentials─────▶│
  │                         │◀─────────────────────────│
  │                         │                          │
  │                         │  Generate JWT            │
  │                         │  (access + refresh)      │
  │◀─────Tokens────────────│                          │
  │                         │                          │
  │──Request + Bearer Token─▶│                          │
  │                         │──Verify JWT──────────────│
  │                         │──Get user context────────▶│
  │◀─────Response───────────│                          │
```

### Security Layers

1. **Transport**: HTTPS only in production
2. **Headers**: Helmet middleware (CSP, HSTS, X-Frame-Options)
3. **Authentication**: JWT with refresh tokens
4. **Authorization**: User-scoped resource access
5. **Rate Limiting**: Redis-backed, per-endpoint limits
6. **Input Validation**: express-validator sanitization
7. **Idempotency**: Duplicate request prevention

## Observability Stack

### Metrics (Prometheus)

```
# Request metrics
http_requests_total{method, path, status}
http_request_duration_seconds{method, path}

# Transaction metrics
transactions_total{status}
transaction_duration_seconds{status}

# System metrics
nodejs_heap_used_bytes
nodejs_eventloop_lag_seconds
```

### Tracing (OpenTelemetry)

- Distributed traces across services
- Correlation IDs for request tracking
- Span attributes for debugging

### Logging (Pino)

```json
{
  "level": "info",
  "time": 1705322400000,
  "correlationId": "req_abc123",
  "userId": "507f1f77bcf86cd799439011",
  "action": "transaction.created",
  "transactionId": "txn_abc123",
  "amount": 100.50
}
```

## Scaling Considerations

### Horizontal Scaling

- Stateless API servers behind load balancer
- Redis for shared state (sessions, rate limits)
- MongoDB replica set for read scaling

### Queue-based Processing

- BullMQ for async webhook delivery
- Retry logic with exponential backoff
- Dead letter queues for failed jobs

### Database Optimization

- Indexed queries on common access patterns
- Connection pooling
- Mongoose lean() for read operations

## Directory Structure

```
src/
├── app.ts                 # Express app setup
├── server.ts              # Server entry point
├── config/                # Configuration
│   ├── index.ts          # Environment config
│   ├── database.ts       # MongoDB connection
│   └── redis.ts          # Redis connection
├── auth/                  # Authentication module
│   ├── auth.service.ts
│   ├── auth.controller.ts
│   ├── auth.middleware.ts
│   ├── auth.routes.ts
│   └── auth.validation.ts
├── services/              # Business services
│   ├── wallet/           # Wallet operations
│   ├── transaction/      # Saga orchestrator
│   ├── ledger/           # Credit/refund handling
│   └── webhook/          # Event delivery
├── models/                # Mongoose schemas
├── middlewares/           # Express middlewares
├── events/                # Event bus (Redis pub/sub)
├── queues/                # BullMQ job queues
├── observability/         # Logs, metrics, tracing
├── docs/                  # OpenAPI specification
└── routes/                # Route definitions
```

## Technology Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 20 |
| Framework | Express.js 5 |
| Language | TypeScript 5 |
| Database | MongoDB 7 |
| Cache/Queue | Redis 7 |
| Job Queue | BullMQ |
| Auth | JWT (jsonwebtoken) |
| Validation | express-validator |
| Logging | Pino |
| Metrics | prom-client |
| Tracing | OpenTelemetry |
| API Docs | Scalar |
