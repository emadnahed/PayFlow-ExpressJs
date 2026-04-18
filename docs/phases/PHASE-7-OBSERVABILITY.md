# Phase 7: Observability Stack

## Status: Pending

## Goals
- Structured logging with correlation IDs
- Prometheus metrics for monitoring
- OpenTelemetry distributed tracing

---

## Dependencies
```bash
npm install pino pino-http pino-pretty prom-client
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
npm install @opentelemetry/exporter-trace-otlp-http @opentelemetry/exporter-metrics-otlp-http
```

---

## Implementation

### Module Structure
```
src/observability/
├── logger.ts               # Pino logger setup
├── correlation.ts          # Request ID middleware
├── log-context.ts          # AsyncLocalStorage for context
├── metrics.ts              # Prometheus registry
├── metrics.middleware.ts   # HTTP metrics collection
└── tracing.ts              # OpenTelemetry setup
```

---

## Structured Logging

### Logger Configuration
```typescript
import pino from 'pino';

export const logger = pino({
  level: config.isProduction ? 'info' : 'debug',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'payflow',
    env: config.nodeEnv,
  },
  ...(config.isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true }
    }
  })
});
```

### Correlation ID Middleware
```typescript
import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuid } from 'uuid';

const asyncLocalStorage = new AsyncLocalStorage<{ correlationId: string }>();

export const correlationMiddleware = (req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || uuid();
  res.setHeader('x-correlation-id', correlationId);

  asyncLocalStorage.run({ correlationId }, () => next());
};

export const getCorrelationId = () => {
  return asyncLocalStorage.getStore()?.correlationId;
};
```

### Contextual Logging
```typescript
// Usage throughout application
import { logger, getCorrelationId } from './observability';

logger.info({
  correlationId: getCorrelationId(),
  transactionId: txn.transactionId,
  event: 'DEBIT_SUCCESS',
  amount: 500,
}, 'Transaction debited successfully');
```

---

## Prometheus Metrics

### Registry Setup
```typescript
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const registry = new Registry();
registry.setDefaultLabels({ service: 'payflow' });

// HTTP metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry],
});
```

### Business Metrics
```typescript
// Transaction metrics
export const transactionsTotal = new Counter({
  name: 'transactions_total',
  help: 'Total transactions by status',
  labelNames: ['status'],
  registers: [registry],
});

export const sagaEventsTotal = new Counter({
  name: 'saga_events_total',
  help: 'Saga events by type',
  labelNames: ['event_type'],
  registers: [registry],
});

export const walletOperationsTotal = new Counter({
  name: 'wallet_operations_total',
  help: 'Wallet operations by type',
  labelNames: ['operation'],  // debit, credit, refund
  registers: [registry],
});

export const webhookDeliveriesTotal = new Counter({
  name: 'webhook_deliveries_total',
  help: 'Webhook deliveries by status',
  labelNames: ['status'],  // success, failure
  registers: [registry],
});

export const activeTransactions = new Gauge({
  name: 'active_transactions',
  help: 'Currently processing transactions',
  registers: [registry],
});
```

### Metrics Middleware
```typescript
export const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime();

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const duration = seconds + nanoseconds / 1e9;

    httpRequestsTotal.inc({
      method: req.method,
      path: req.route?.path || req.path,
      status: res.statusCode,
    });

    httpRequestDuration.observe({
      method: req.method,
      path: req.route?.path || req.path,
      status: res.statusCode,
    }, duration);
  });

  next();
};
```

### Metrics Endpoint
```typescript
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
```

---

## Distributed Tracing

### OpenTelemetry Setup
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  serviceName: 'payflow',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-mongodb': { enabled: true },
      '@opentelemetry/instrumentation-ioredis': { enabled: true },
    }),
  ],
});

sdk.start();
```

### Custom Spans for Saga
```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('payflow-saga');

async function processTransaction(txnId: string) {
  return tracer.startActiveSpan('saga.process_transaction', async (span) => {
    span.setAttribute('transaction.id', txnId);

    try {
      await debitSender();
      await creditReceiver();
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

---

## Dashboard Examples

### Key Metrics to Monitor
1. **Request Rate**: `rate(http_requests_total[5m])`
2. **Error Rate**: `rate(http_requests_total{status=~"5.."}[5m])`
3. **Latency P99**: `histogram_quantile(0.99, http_request_duration_seconds_bucket)`
4. **Transaction Success Rate**: `transactions_total{status="COMPLETED"} / transactions_total`
5. **Active Transactions**: `active_transactions`

---

## E2E Tests Required

1. **Logging**
   - Correlation ID propagates through requests
   - Logs include transaction context

2. **Metrics**
   - `/metrics` endpoint returns Prometheus format
   - HTTP metrics recorded correctly
   - Business metrics increment properly

3. **Tracing**
   - Spans created for requests
   - Saga flow creates linked spans

---

## Files to Create

- `src/observability/logger.ts`
- `src/observability/correlation.ts`
- `src/observability/log-context.ts`
- `src/observability/metrics.ts`
- `src/observability/metrics.middleware.ts`
- `src/observability/tracing.ts`
- `src/observability/index.ts`
- `tests/e2e/metrics.test.ts`

---

## Success Criteria
- [ ] Structured JSON logs in production
- [ ] Correlation ID on all logs
- [ ] `/metrics` endpoint works
- [ ] Key business metrics tracked
- [ ] Traces flow through Saga
- [ ] All E2E tests pass

---

## Previous Phase
← [Phase 6: Webhooks](./PHASE-6-WEBHOOKS.md)

## Next Phase
→ [Phase 8: Production Hardening](./PHASE-8-HARDENING.md)
