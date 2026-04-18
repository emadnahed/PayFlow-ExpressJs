# Phase 8: Production Hardening

## Status: Complete

## Goals
- Security best practices
- Rate limiting
- API-level idempotency
- Consistent error handling
- API documentation

---

## Dependencies
```bash
npm install express-rate-limit rate-limit-redis swagger-ui-express
npm install -D @types/swagger-ui-express
```

---

## Implementation

### Security Enhancements

#### Helmet Configuration
```typescript
// Enhanced helmet config
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // For Swagger UI
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
}));
```

#### CORS Configuration
```typescript
const corsOptions = {
  origin: config.isProduction
    ? ['https://yourdomain.com']
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  exposedHeaders: ['X-Correlation-Id', 'X-RateLimit-Remaining'],
  credentials: true,
  maxAge: 86400,
};
```

---

## Rate Limiting

### Module Structure
```
src/middlewares/
├── rateLimiter.ts
└── index.ts
```

### Rate Limiter Configuration
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// Global rate limit
export const globalLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }),
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many requests, please try again later' },
  },
});

// Strict limit for sensitive endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,  // 5 login attempts per 15 min
  message: {
    success: false,
    error: { message: 'Too many login attempts' },
  },
});

// Transaction rate limit (per user)
export const transactionLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 10,                    // 10 transactions per minute
  keyGenerator: (req) => req.user?.userId || req.ip,
});
```

### Usage
```typescript
app.use('/auth/login', authLimiter);
app.use('/transactions', transactionLimiter);
app.use(globalLimiter);
```

---

## Idempotency Keys

### Middleware
```typescript
// src/middlewares/idempotency.ts
export const idempotencyMiddleware = async (req, res, next) => {
  const idempotencyKey = req.headers['x-idempotency-key'];

  if (!idempotencyKey) {
    return next();  // Idempotency optional
  }

  const cacheKey = `idempotency:${req.user.userId}:${idempotencyKey}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    const { statusCode, body } = JSON.parse(cached);
    return res.status(statusCode).json(body);
  }

  // Store response for future
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    redis.setex(cacheKey, 86400, JSON.stringify({
      statusCode: res.statusCode,
      body,
    }));
    return originalJson(body);
  };

  next();
};
```

### Usage
```typescript
router.post('/transactions',
  authMiddleware,
  idempotencyMiddleware,
  transactionController.create
);
```

---

## Error Handling

### Error Codes
```typescript
// src/types/errors.ts
export enum ErrorCode {
  // Auth errors (1xxx)
  UNAUTHORIZED = 1001,
  INVALID_TOKEN = 1002,
  TOKEN_EXPIRED = 1003,

  // Validation errors (2xxx)
  VALIDATION_ERROR = 2001,
  INVALID_AMOUNT = 2002,

  // Business errors (3xxx)
  INSUFFICIENT_BALANCE = 3001,
  USER_NOT_FOUND = 3002,
  WALLET_NOT_FOUND = 3003,
  TRANSACTION_NOT_FOUND = 3004,
  SELF_TRANSFER = 3005,

  // System errors (5xxx)
  INTERNAL_ERROR = 5001,
  DATABASE_ERROR = 5002,
  REDIS_ERROR = 5003,
}
```

### Error Response Format
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string[]>;  // Validation errors
    timestamp: string;
    correlationId: string;
  };
}
```

### Enhanced Error Handler
```typescript
export const errorHandler = (err, req, res, next) => {
  const correlationId = getCorrelationId();

  // Log error with context
  logger.error({
    correlationId,
    error: err.message,
    stack: config.isDevelopment ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Sanitize error for response
  const statusCode = err.statusCode || 500;
  const response: ErrorResponse = {
    success: false,
    error: {
      code: err.errorCode || ErrorCode.INTERNAL_ERROR,
      message: config.isProduction && statusCode === 500
        ? 'Internal server error'
        : err.message,
      timestamp: new Date().toISOString(),
      correlationId,
    },
  };

  if (err.validationErrors) {
    response.error.details = err.validationErrors;
  }

  res.status(statusCode).json(response);
};
```

---

## API Documentation

### OpenAPI Setup
```typescript
import swaggerUi from 'swagger-ui-express';
import { generateOpenAPI } from './docs/openapi';

const openApiSpec = generateOpenAPI();

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'PayFlow API',
}));

app.get('/api-docs.json', (req, res) => {
  res.json(openApiSpec);
});
```

### OpenAPI Spec Structure
```yaml
openapi: 3.0.3
info:
  title: PayFlow API
  version: 1.0.0
  description: Event-driven UPI-like transaction system

servers:
  - url: http://localhost:3000
    description: Development

paths:
  /auth/register:
    post:
      summary: Register new user
      tags: [Auth]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RegisterRequest'
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
```

---

## E2E Tests Required

1. **Rate Limiting**
   - Global limit enforced
   - Auth limit stricter
   - Rate limit headers present

2. **Idempotency**
   - Same key returns cached response
   - Different keys processed separately
   - Keys expire after 24h

3. **Error Handling**
   - All errors have correct format
   - Error codes consistent
   - Sensitive data not leaked

4. **Security**
   - CORS headers correct
   - Helmet headers present
   - Invalid inputs rejected

---

## Files to Create

- `src/middlewares/rateLimiter.ts`
- `src/middlewares/idempotency.ts`
- `src/types/errors.ts`
- `src/docs/openapi.ts`
- `tests/e2e/rate-limit.test.ts`
- `tests/e2e/idempotency.test.ts`

---

## Success Criteria
- [x] Rate limiting works globally and per-endpoint
- [x] Idempotency keys prevent duplicate processing
- [x] Error responses follow standard format
- [x] API docs available at /api-docs
- [x] All security headers present
- [x] All E2E tests pass (when infrastructure is running)

---

## Previous Phase
← [Phase 7: Observability](./PHASE-7-OBSERVABILITY.md)

## Next Phase
→ [Phase 9: Final Polish](./PHASE-9-FINAL-POLISH.md)
