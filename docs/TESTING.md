# PayFlow Testing Guide

## Quick Start

```bash
# 1. Unit tests (no infrastructure needed)
npm run test:unit

# 2. Full test suite with orchestration (recommended)
npm run test:run:local       # Starts infra, API, runs all tests, cleans up
npm run test:run:docker      # Same but with Docker infrastructure

# 3. Manual step-by-step
npm run infra:local:up       # Start MongoDB + Redis
npm run dev &                # Start API server
npm run test:full:local      # Run Unit + Integration + E2E + Curl + K6
npm run infra:local:down     # Cleanup
```

---

## Overview

PayFlow uses a tiered testing strategy to ensure code quality while maintaining fast feedback loops. Tests are organized by their infrastructure requirements.

## Testing Tiers

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1: Unit Tests (No Infrastructure Required)                │
│  Fast, isolated tests that mock all external dependencies       │
│  Command: npm run test:unit                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  TIER 2: Integration Tests (Real Database Required)             │
│  Tests service interactions with actual MongoDB/Redis           │
│  Command: npm run test:integration                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  TIER 3: E2E Tests (Full Infrastructure Required)               │
│  Complete HTTP flow testing with all services running           │
│  Command: npm run test:e2e                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  TIER 4: cURL API Tests (Running API Required)                  │
│  Manual API testing with jq beautification                      │
│  Command: npm run test:api                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## All Test Commands

### Infrastructure Management

| Command | Description |
|---------|-------------|
| `npm run infra:local:up` | Start test MongoDB (27018) + Redis (6380) |
| `npm run infra:local:down` | Stop test infrastructure |
| `npm run infra:local:status` | Check test infrastructure status |
| `npm run infra:docker:up` | Start full Docker stack (API + DB + Redis) |
| `npm run infra:docker:down` | Stop Docker stack |
| `npm run infra:docker:status` | Check Docker stack status |

### Orchestrated Full Test Suite (Recommended)

These commands handle infrastructure startup, run all tests, and cleanup automatically:

| Command | Description |
|---------|-------------|
| `npm run test:run:local` | Full suite: Unit + Integration + E2E + Curl + K6 (local) |
| `npm run test:run:docker` | Full suite with Docker infrastructure |
| `npm run test:run:vps` | Unit + Curl + K6 against VPS |
| `npm run test:run:staging` | Unit + Curl + K6 against staging |
| `npm run test:run:production` | Unit + Curl + K6 against production |

### Full Test Suite (Manual Infrastructure)

| Command | Description |
|---------|-------------|
| `npm run test:full:local` | Unit + Integration + E2E + Curl + K6 (local) |
| `npm run test:full:docker` | Unit + Integration + E2E + Curl + K6 (docker) |
| `npm run test:full:vps` | Unit + Curl + K6 (VPS) |
| `npm run test:full:staging` | Unit + Curl + K6 (staging) |
| `npm run test:full:production` | Unit + Curl + K6 (production) |

### Unit Tests (No Infrastructure)

| Command | Description |
|---------|-------------|
| `npm run test:unit` | Run 428+ unit tests (fast, isolated) |

### Jest Tests (Require MongoDB + Redis)

| Command | Description |
|---------|-------------|
| `npm test` | Run all Jest tests |
| `npm run test:watch` | Watch mode for development |
| `npm run test:verbose` | Verbose output with details |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:ci` | CI pipeline (with coverage + force exit) |
| `npm run test:integration` | Integration tests only (214+ tests) |
| `npm run test:e2e` | E2E tests (local Redis 6379) |
| `npm run test:e2e:docker` | E2E tests (Docker Redis 6380) |
| `npm run test:jest:local` | Unit + Integration + E2E combined |
| `npm run test:jest:docker` | Unit + Integration + E2E (Docker ports) |
| `npm run test:chaos` | Chaos/failure scenario tests |
| `npm run test:load` | Load/performance tests |

### cURL API Tests (Require Running API)

| Command | Description |
|---------|-------------|
| `npm run test:api` | Run curl tests (default environment) |
| `npm run test:api:local` | Curl tests against localhost:3000 |
| `npm run test:api:docker` | Curl tests against Docker (localhost:3000) |
| `npm run test:api:vps` | Curl tests against VPS (set VPS_API_URL) |
| `npm run test:api:staging` | Curl tests against staging (set STAGING_API_URL) |
| `npm run test:api:production` | Curl tests against production (set PRODUCTION_API_URL) |
| `npm run test:api:verbose` | Curl tests with response body output |

### K6 Load Tests

| Command | Description |
|---------|-------------|
| `npm run k6:local` | K6 smoke + load + stress (local) |
| `npm run k6:docker` | K6 smoke + load + stress (docker-local) |
| `npm run k6:vps` | K6 smoke + load + stress (VPS) |
| `npm run k6:staging` | K6 smoke + load + stress (staging) |
| `npm run k6:production` | K6 smoke + load + stress (production) |

### Docker Commands

| Command | Description |
|---------|-------------|
| `npm run docker:test` | Start only MongoDB + Redis |
| `npm run docker:test:all` | Start MongoDB + Redis + API |
| `npm run docker:test:down` | Stop all test containers |
| `npm run docker:test:logs` | View API container logs |

---

## Common Workflows

### Run Full Test Suite (Easiest - Recommended)

```bash
# Orchestrated: handles infrastructure, API, tests, and cleanup
npm run test:run:local       # For local development
npm run test:run:docker      # For Docker-based testing
```

### Run Unit Tests Only (No Setup Required)

```bash
npm run test:unit
```

### Run Jest Tests (Unit + Integration + E2E)

```bash
# Start infrastructure first
npm run infra:local:up

# Run all Jest tests
npm run test:jest:local

# Cleanup
npm run infra:local:down
```

### Run cURL API Tests

```bash
# Start infrastructure and API
npm run infra:local:up
npm run dev &                 # Start API in background

# Run curl tests
npm run test:api:local

# Or with verbose output
VERBOSE=true npm run test:api:local

# Cleanup
pkill -f "ts-node src/server"
npm run infra:local:down
```

### Run K6 Load Tests

```bash
# Start infrastructure and API
npm run infra:local:up
npm run dev &

# Run K6 tests
npm run k6:local              # Runs smoke + load + stress tests

# Or run from load-testing directory
cd load-testing
npm run test:full:local

# Cleanup
npm run infra:local:down
```

### Run Tests Against Remote Environments

```bash
# Against VPS (set API URL)
VPS_API_URL=https://api.yourvps.com npm run test:run:vps

# Against staging
STAGING_API_URL=https://staging.example.com npm run test:run:staging

# Against production (conservative)
PRODUCTION_API_URL=https://api.example.com npm run test:run:production
```

### Run All Tests for CI

```bash
npm run docker:test:all
npm run test:ci
npm run docker:test:down
```

### Development Workflow

```bash
# Start infrastructure
npm run infra:local:up

# Run tests in watch mode
npm run test:watch

# Or run specific test file
npm test -- tests/e2e/auth.test.ts
```

---

## Port Configuration

| Service | Development | Docker Test |
|---------|-------------|-------------|
| API | 3000 | 3001 |
| MongoDB | 27017 | 27018 |
| Redis | 6379 | 6380 |

**Note:** Docker test uses different ports to avoid conflicts with local development.

---

## Rate Limiting and Load Testing

PayFlow uses environment-based rate limiting configuration that adjusts thresholds based on `NODE_ENV`. This ensures load tests can run without hitting rate limits while maintaining strict limits in production.

### Rate Limit Configuration by Environment

| Limiter | Development | Test | Production |
|---------|-------------|------|------------|
| Global | 1000 req/15min | 10000 | 100 |
| Auth | 100 req/15min | 10000 | 5 |
| Transaction | 200 req/15min | 10000 | 50 |
| API | 500 req/15min | 10000 | 100 |
| Webhook | 200 req/15min | 10000 | 50 |

### Load Test Bypass Header

For scenarios where you need to bypass rate limiting (e.g., load testing against staging or production), PayFlow supports a bypass header mechanism:

```bash
# Set the LOAD_TEST_SECRET environment variable on the server
LOAD_TEST_SECRET=your-secret-token

# Pass the token in requests via X-Load-Test-Token header
curl -H "X-Load-Test-Token: your-secret-token" http://localhost:3000/health
```

**Security Notes:**
- The bypass header only works when `LOAD_TEST_SECRET` is set on the server
- In test mode, the default secret is `test-load-secret`
- For production, use a strong, unique secret and rotate it regularly
- Never commit secrets to version control

### K6 Environment Configuration

Each k6 environment configuration includes a `loadTestToken` setting:

| Environment | Default Token | Base URL |
|-------------|---------------|----------|
| local | `test-load-secret` | `http://localhost:3000` |
| docker-local | `test-load-secret` | `http://localhost:3001` |
| vps | *(env var required)* | `https://api.yourdomain.com` |
| staging | *(env var required)* | `https://staging-api.example.com` |
| production | *(env var required)* | `https://api.example.com` |

### Running Load Tests with Custom Token

```bash
# Local/Docker (uses default test secret)
npm run k6:local
npm run k6:docker

# VPS/Staging/Production (pass token via environment variable)
k6 run -e ENV=vps -e API_URL=https://api.yourdomain.com -e LOAD_TEST_TOKEN=your-secret tests/smoke/smoke.test.js

# Or set environment variables before running
export API_URL=https://api.yourdomain.com
export LOAD_TEST_TOKEN=your-secret
npm run k6:vps
```

### Disabling Rate Limiting

For development/debugging, you can completely disable rate limiting:

```bash
# Disable all rate limiters
RATE_LIMIT_DISABLED=true npm run dev
```

**Warning:** Never disable rate limiting in production environments.

---

## Infrastructure Setup

### Option 1: Docker Test Environment (Recommended)

Start the test infrastructure using Docker Compose:

```bash
# Start test databases (MongoDB on 27018, Redis on 6380)
npm run docker:test:all

# Run tests
npm test

# Stop test databases
docker-compose -f docker/docker-compose.test.yml down
```

**Test Docker Compose Services:**

| Service | Port | Purpose |
|---------|------|---------|
| MongoDB | 27018 | Test database (tmpfs for speed) |
| Redis | 6380 | Test cache/event bus |

### Option 2: Local Services

If running services locally, ensure they match test configuration:

```bash
# MongoDB
mongod --port 27018 --dbpath /tmp/payflow-test

# Redis
redis-server --port 6380
```

---

## Test Directory Structure

```
tests/
├── unit/                           # Tier 1: Unit tests (no infrastructure)
│   ├── auth/
│   │   └── auth.validation.test.ts
│   ├── config/                     # Configuration tests
│   │   ├── database.test.ts        # MongoDB connection
│   │   └── redis.test.ts           # Redis client
│   ├── events/                     # Event system tests
│   │   └── eventBus.test.ts        # Redis pub/sub event bus
│   ├── middlewares/                # Middleware tests
│   │   └── idempotency.test.ts     # Idempotency middleware
│   ├── observability/              # Observability tests
│   │   └── tracing.test.ts         # OpenTelemetry tracing
│   ├── queues/                     # Queue tests
│   │   ├── notification.queue.test.ts
│   │   ├── notification.worker.test.ts
│   │   ├── webhook.queue.test.ts
│   │   └── webhook.worker.test.ts
│   ├── services/                   # Service tests
│   │   ├── ledger.events.test.ts   # Ledger event handlers
│   │   ├── ledger.validation.test.ts
│   │   ├── transaction.events.test.ts
│   │   ├── transaction.state.test.ts
│   │   ├── transaction.validation.test.ts
│   │   ├── wallet.events.test.ts
│   │   ├── wallet.validation.test.ts
│   │   └── webhook.validation.test.ts
│   └── validations/
│       └── shared.validation.test.ts
│
├── integration/                    # Tier 2: Integration tests
│   └── auth/
│       └── auth.service.test.ts
│
├── e2e/                            # Tier 3: End-to-end tests
│   ├── auth.test.ts               # Authentication flows
│   ├── wallet.test.ts             # Wallet operations
│   ├── transaction.test.ts        # Transaction flows
│   ├── saga-flow.test.ts          # Saga pattern tests
│   ├── compensation.test.ts       # Refund/rollback tests
│   ├── webhook.test.ts            # Webhook delivery
│   ├── ledger.test.ts             # Ledger operations
│   ├── health.test.ts             # Health endpoints
│   ├── metrics.test.ts            # Prometheus metrics
│   ├── security.test.ts           # Security headers/CORS
│   ├── idempotency.test.ts        # Idempotency keys
│   └── connectivity.test.ts       # Database connectivity
│
├── chaos/                          # Chaos engineering tests
│   └── credit-failure.test.ts     # Failure scenario testing
│
├── load/                           # Performance tests
│   └── transaction.load.ts        # Load testing
│
├── helpers/                        # Test utilities
│   ├── index.ts                   # Helper exports
│   ├── testApp.ts                 # Express app instance
│   ├── testDatabase.ts            # MongoDB connection
│   ├── testEventBus.ts            # Redis connection
│   └── testAuth.ts                # Auth test utilities
│
└── setup.ts                        # Jest global setup
```

---

## Test Configuration

### Jest Configuration (`jest.config.js`)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
```

### Environment Variables (`tests/setup.ts`)

Tests use isolated ports to avoid conflicts with development:

| Variable | Test Value | Purpose |
|----------|------------|---------|
| `NODE_ENV` | `test` | Enables test mode |
| `MONGODB_URI` | `mongodb://localhost:27018/payflow_test` | Test database |
| `REDIS_HOST` | `localhost` | Test Redis host |
| `REDIS_PORT` | `6380` | Test Redis port |
| `JWT_SECRET` | `test-secret-key-for-testing-only-32chars` | Test JWT signing |

---

## Writing Tests

### Unit Tests (Tier 1)

Unit tests should be fast and isolated with no external dependencies:

```typescript
// tests/unit/utils/validation.test.ts
import { validateEmail, validateAmount } from '@/utils/validation';

describe('Validation Utils', () => {
  describe('validateEmail', () => {
    it('should accept valid email', () => {
      expect(validateEmail('user@example.com')).toBe(true);
    });

    it('should reject invalid email', () => {
      expect(validateEmail('not-an-email')).toBe(false);
    });
  });

  describe('validateAmount', () => {
    it('should accept positive amounts', () => {
      expect(validateAmount(100.50)).toBe(true);
    });

    it('should reject negative amounts', () => {
      expect(validateAmount(-50)).toBe(false);
    });
  });
});
```

### Mocking Patterns for Unit Tests

For modules with dependencies, use Jest mocks with module reset for isolation:

```typescript
// tests/unit/services/example.test.ts

// Define mocks before jest.mock() calls
const mockSubscribe = jest.fn().mockResolvedValue(undefined);
const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);

// Mock dependencies
jest.mock('../../../src/events/eventBus', () => ({
  eventBus: {
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  },
}));

describe('Example Service', () => {
  let registerHandlers: typeof import('../../../src/services/example').registerHandlers;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules(); // Reset module state for isolation

    // Dynamic import after reset to get fresh module
    const module = await import('../../../src/services/example');
    registerHandlers = module.registerHandlers;
  });

  it('should subscribe to events', async () => {
    await registerHandlers();

    expect(mockSubscribe).toHaveBeenCalledWith(
      'EVENT_TYPE',
      expect.any(Function)
    );
  });
});
```

**Key Testing Patterns:**
- Use `jest.resetModules()` for singleton modules (queues, workers)
- Dynamic imports after reset to get fresh module state
- Define mocks at top level before `jest.mock()` calls
- Clear mocks in `beforeEach` for test isolation

### Integration Tests (Tier 2)

Integration tests verify service interactions with real databases:

```typescript
// tests/integration/wallet/wallet.service.test.ts
import mongoose from 'mongoose';
import { WalletService } from '@/services/wallet';
import { User, Wallet } from '@/models';

describe('WalletService Integration', () => {
  let walletService: WalletService;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    walletService = new WalletService();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Wallet.deleteMany({});
  });

  it('should create wallet for user', async () => {
    const user = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'hashedpassword',
    });

    const wallet = await walletService.createWallet(user._id.toString());

    expect(wallet).toBeDefined();
    expect(wallet.userId.toString()).toBe(user._id.toString());
    expect(wallet.balance).toBe(0);
  });

  it('should debit wallet with sufficient balance', async () => {
    // Setup wallet with balance
    const wallet = await Wallet.create({
      userId: new mongoose.Types.ObjectId(),
      balance: 1000,
    });

    const result = await walletService.debit(wallet._id.toString(), 500);

    expect(result.balance).toBe(500);
  });
});
```

### E2E Tests (Tier 3)

E2E tests verify complete HTTP flows:

```typescript
// tests/e2e/transaction.test.ts
import request from 'supertest';
import { getTestApp, createTestUser, clearTestDatabase } from '../helpers';

describe('Transaction E2E', () => {
  const app = getTestApp();
  let sender: { accessToken: string; user: { userId: string } };
  let receiver: { accessToken: string; user: { userId: string } };

  beforeAll(async () => {
    await connectTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    // Create test users with wallets
    sender = await createTestUser(app, {
      email: 'sender@test.com',
      initialBalance: 1000,
    });
    receiver = await createTestUser(app, {
      email: 'receiver@test.com',
    });
  });

  it('should complete a transaction successfully', async () => {
    const response = await request(app)
      .post('/transactions')
      .set('Authorization', `Bearer ${sender.accessToken}`)
      .send({
        receiverId: receiver.user.userId,
        amount: 100,
        description: 'Test payment',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('INITIATED');

    // Wait for saga completion
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify final state
    const txResponse = await request(app)
      .get(`/transactions/${response.body.data.id}`)
      .set('Authorization', `Bearer ${sender.accessToken}`);

    expect(txResponse.body.data.status).toBe('COMPLETED');
  });

  it('should reject transaction with insufficient balance', async () => {
    const response = await request(app)
      .post('/transactions')
      .set('Authorization', `Bearer ${sender.accessToken}`)
      .send({
        receiverId: receiver.user.userId,
        amount: 10000, // More than balance
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(3001); // INSUFFICIENT_BALANCE
  });
});
```

---

## Test Helpers

### `testApp.ts` - Express App Instance

```typescript
import { getTestApp } from '../helpers';

const app = getTestApp(); // Singleton Express app for testing
```

### `testAuth.ts` - Authentication Helpers

```typescript
import { createTestUser, getAuthToken } from '../helpers';

// Create a user and get auth tokens
const user = await createTestUser(app, {
  name: 'Test User',
  email: 'test@example.com',
  password: 'TestPass123!',
  initialBalance: 1000, // Optional: pre-fund wallet
});

// user.accessToken - JWT for authenticated requests
// user.user.userId - User ID for references
```

### `testDatabase.ts` - Database Utilities

```typescript
import {
  connectTestDatabase,
  disconnectTestDatabase,
  clearTestDatabase,
} from '../helpers';

beforeAll(async () => {
  await connectTestDatabase();
});

afterAll(async () => {
  await disconnectTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase(); // Clears all collections
});
```

---

## Running Specific Tests

```bash
# Run single test file
npm test -- tests/e2e/auth.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should register"

# Run tests in specific directory
npm test -- tests/unit

# Run with verbose output
npm run test:verbose

# Run and update snapshots
npm test -- -u
```

---

## Test Coverage

Generate coverage reports:

```bash
npm run test:coverage
```

Coverage report is generated in `coverage/` directory:
- `coverage/lcov-report/index.html` - HTML report
- `coverage/lcov.info` - LCOV format for CI tools

### Current Coverage Statistics

| Module | Statements | Branches | Functions | Lines |
|--------|------------|----------|-----------|-------|
| Overall | 71.98% | 41.29% | 44.20% | 71.21% |
| Events (eventBus) | 94.02% | 80% | 93.33% | 93.65% |
| Observability (tracing) | 100% | 100% | 100% | 100% |
| Queues (workers) | 60.57% | 47.82% | 70% | 59.8% |
| Config (database/redis) | 89.85% | 67.64% | 76.92% | 88.7% |
| Middlewares | 63.94% | 28.75% | 27.27% | 62.58% |

**Fully Covered Modules (100% statements):**
- `src/observability/tracing.ts`
- `src/queues/notification.queue.ts`
- `src/queues/webhook.queue.ts`
- `src/services/ledger/ledger.events.ts`
- `src/services/transaction/transaction.events.ts`
- `src/services/wallet/wallet.events.ts`
- `src/services/webhook/webhook.events.ts`
- All validation modules

### Coverage Thresholds

| Metric | Minimum |
|--------|---------|
| Lines | 70% |
| Functions | 70% |
| Branches | 60% |
| Statements | 70% |

### Test Count

| Category | Tests |
|----------|-------|
| Unit Tests | 428 |
| Integration Tests | 214 |
| E2E Tests | 212 |
| cURL API Tests | 29 |
| Total | 883+ |

---

## Continuous Integration

### GitHub Actions Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs:

1. **Lint Check**: ESLint + Prettier
2. **Test**: Unit, integration, and E2E tests with Docker services
3. **Build**: TypeScript compilation
4. **Docker**: Build and push image (on main branch)
5. **Security Scan**: npm audit + secret scanning

### CI Test Flow

```yaml
jobs:
  test:
    services:
      mongodb:
        image: mongo:7
        ports:
          - 27017:27017  # Standard ports in CI (isolated containers)
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    env:
      MONGODB_URI: mongodb://localhost:27017/payflow_test
      REDIS_HOST: localhost
      REDIS_PORT: 6379

    steps:
      - run: npm run test:ci
```

**Note:** CI uses standard ports (27017, 6379) since containers are isolated. Local development uses different ports (27018, 6380) to avoid conflicts with local services.

---

## Chaos Testing

Chaos tests verify system resilience under failure conditions:

```bash
npm run chaos-test
```

### Available Chaos Scenarios

| Test | Description |
|------|-------------|
| Credit Failure | Simulates ledger service failure during credit |
| Timeout Scenarios | Tests request timeout handling |
| Retry Logic | Verifies exponential backoff behavior |

### Using Ledger Simulation

```typescript
// Enable failure simulation
await request(app)
  .post('/ledger/simulation')
  .send({
    enabled: true,
    failureRate: 0.5, // 50% failure rate
    failureType: 'ERROR',
  });

// Test transaction behavior under failures
const response = await request(app)
  .post('/transactions')
  .set('Authorization', `Bearer ${token}`)
  .send({ receiverId, amount: 100 });

// Verify compensation/refund occurred
```

---

## Manual API Testing (cURL)

A comprehensive cURL-based test script (`scripts/test-api.sh`) tests all API endpoints:

```bash
# Run against different environments
npm run test:api:local        # localhost:3000
npm run test:api:docker       # Docker (localhost:3000)
npm run test:api:vps          # VPS (set VPS_API_URL)
npm run test:api:staging      # Staging (set STAGING_API_URL)
npm run test:api:production   # Production (set PRODUCTION_API_URL)

# Enable verbose mode (shows response bodies)
VERBOSE=true npm run test:api:local

# Direct script usage
ENV=local API_URL=http://localhost:3000 ./scripts/test-api.sh
```

### Environment Variables for Remote Testing

```bash
# VPS
VPS_API_URL=https://api.yourvps.com npm run test:api:vps

# Staging
STAGING_API_URL=https://staging.example.com npm run test:api:staging

# Production
PRODUCTION_API_URL=https://api.example.com npm run test:api:production
```

### Test Script Features

| Feature | Description |
|---------|-------------|
| **29 Tests** | Comprehensive coverage of all API endpoints |
| **Multi-Environment** | Supports local, docker, vps, staging, production |
| **Auto-Authentication** | Registers user, stores token, reuses for all tests |
| **CRUD Flows** | Create → Read → Update → Delete patterns |
| **Error Cases** | Validates error responses (401, 404, 400) |
| **jq Support** | Uses jq for JSON parsing if available |
| **Color Output** | Pass/fail indicators with ANSI colors |

### Endpoints Tested

- **Root & Docs**: `/`, `/api-docs`, `/api-docs.json`
- **Health**: `/health`, `/health/live`, `/health/ready`
- **Metrics**: `/metrics`
- **Auth**: Register, login, refresh, profile, unauthorized access
- **Wallet**: Get wallet, deposit, history, balance by ID
- **Transaction**: List, create (validation), get by ID
- **Webhook**: Full CRUD, logs
- **Ledger**: Simulation config, update, reset

### Sample Output

```
╔═══════════════════════════════════════════════════════════════╗
║           PayFlow API Integration Test Suite                  ║
╚═══════════════════════════════════════════════════════════════╝

Environment: local
API URL:     http://localhost:3000
Verbose:     false
Test User:   apitest_1234567890@example.com

► Testing: Checking API connectivity...
  ✓ PASS: API is reachable

═══════════════════════════════════════════════════════════════
  Health Check Endpoints
═══════════════════════════════════════════════════════════════
► Testing: GET /health
  ✓ PASS: Health endpoint returns 200
► Testing: GET /health/live
  ✓ PASS: Liveness endpoint returns 200

...

═══════════════════════════════════════════════════════════════
  Test Summary
═══════════════════════════════════════════════════════════════

  Passed:  29
  Failed:  0
  Skipped: 0

  Pass Rate: 100%

All tests passed!
```

---

## Load Testing with k6

PayFlow includes a comprehensive k6-based load testing suite in the `load-testing/` directory.

### Prerequisites

```bash
# Install k6 (macOS)
brew install k6

# Install k6 (Linux)
sudo apt-get install k6

# Install k6 (Windows)
choco install k6
```

### Quick Start (From Root Directory)

```bash
# Full K6 suite (smoke + load + stress) for each environment
npm run k6:local              # Against localhost:3000
npm run k6:docker             # Against Docker (localhost:3000)
npm run k6:vps                # Against VPS
npm run k6:staging            # Against staging
npm run k6:production         # Against production
```

### Quick Start (From load-testing Directory)

```bash
cd load-testing

# Full suite per environment
npm run test:full:local       # smoke + load + stress (local)
npm run test:full:docker      # smoke + load + stress (docker)
npm run test:full:vps         # smoke + load + stress (VPS)
npm run test:full:staging     # smoke + load + stress (staging)
npm run test:full:production  # smoke + load + stress (production)

# Individual tests
npm run test:smoke:docker     # Quick health check (1 VU, 1 min)
npm run test:load:docker      # Standard load test (10-100 VUs, 16 min)
npm run test:stress:docker    # Find breaking points (up to 500 VUs)
npm run test:soak:docker      # Long-running stability (30 VUs, 1+ hour)

# Test against VPS with custom URL
k6 run -e ENV=vps -e API_URL=https://your-vps.com tests/smoke/smoke.test.js
```

### Test Types

| Type | Purpose | VUs | Duration |
|------|---------|-----|----------|
| **Smoke** | Quick health checks | 1 | 1 min |
| **Load** | Standard performance | 10-100 | 16 min |
| **Stress** | Find breaking points | up to 500 | 22 min |
| **Spike** | Sudden load spikes | up to 400 | 15 min |
| **Soak** | Long-running stability | 30 | 1-12 hours |

### Environment Configuration

The load testing suite supports multiple environments with automatic rate limit bypass:

| Environment | API URL | Rate Limit Bypass |
|-------------|---------|-------------------|
| `local` | `http://localhost:3000` | Auto (test-load-secret) |
| `docker-local` | `http://localhost:3001` | Auto (test-load-secret) |
| `vps` | Set via `API_URL` env | Requires `LOAD_TEST_TOKEN` |
| `staging` | Set via `API_URL` env | Requires `LOAD_TEST_TOKEN` |
| `production` | Set via `API_URL` env | Requires `LOAD_TEST_TOKEN` |

```bash
# Local development (non-Docker) - auto bypasses rate limits
k6 run -e ENV=local tests/smoke/smoke.test.js

# Docker containers on localhost - auto bypasses rate limits
k6 run -e ENV=docker-local tests/smoke/smoke.test.js

# VPS/Remote - requires load test token for rate limit bypass
k6 run -e ENV=vps -e API_URL=https://api.yourdomain.com -e LOAD_TEST_TOKEN=your-secret tests/smoke/smoke.test.js

# Staging environment - requires load test token
k6 run -e ENV=staging -e API_URL=https://staging.example.com -e LOAD_TEST_TOKEN=your-secret tests/smoke/smoke.test.js

# Production (use with caution!) - requires load test token
k6 run -e ENV=production -e API_URL=https://api.example.com -e LOAD_TEST_TOKEN=your-secret tests/smoke/smoke.test.js
```

**Note:** The `X-Load-Test-Token` header is automatically added to all k6 requests when `loadTestToken` is configured. See [Rate Limiting and Load Testing](#rate-limiting-and-load-testing) for details.

### Performance Thresholds

| Metric | Local | Staging | Production |
|--------|-------|---------|------------|
| p95 Response Time | <2000ms | <1000ms | <500ms |
| p99 Response Time | <5000ms | <2000ms | <1000ms |
| Error Rate | <5% | <1% | <0.1% |

### Generating Reports

```bash
# Run test with JSON output
k6 run --out json=results/test_results.json tests/load/api.test.js

# Generate HTML report
node scripts/generate-report.js results/test_results.json

# Compare against baseline
node scripts/compare-baselines.js results/test_results_summary.json
```

### CI/CD Integration

Load tests are integrated with GitHub Actions:

- **On Push/PR**: Smoke tests run automatically
- **Manual Trigger**: Load, stress, and soak tests can be triggered manually
- **Scheduled**: Smoke tests every 6 hours, load tests daily, soak tests weekly

See [load-testing/README.md](../load-testing/README.md) for complete documentation.

### Sample k6 Test

```javascript
// tests/load/api.test.js
import { check, group, sleep } from 'k6';
import http from 'k6/http';

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up
    { duration: '3m', target: 50 },   // Steady state
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function() {
  group('Authentication', function() {
    const loginRes = http.post(`${__ENV.API_URL}/api/auth/login`,
      JSON.stringify({ email: 'test@example.com', password: 'password' }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    check(loginRes, {
      'login successful': (r) => r.status === 200,
      'has token': (r) => JSON.parse(r.body).accessToken !== undefined,
    });
  });

  sleep(1);
}
```

---

## Troubleshooting

### Tests Fail with Connection Errors

```bash
# Ensure test infrastructure is running
npm run docker:test:all

# Check container status
docker ps | grep -E "(mongo|redis)"

# Verify ports
nc -zv localhost 27018  # MongoDB
nc -zv localhost 6380   # Redis
```

### Tests Hang or Timeout

```bash
# Run with open handle detection
npm test -- --detectOpenHandles

# Increase timeout for slow tests
npm test -- --testTimeout=60000
```

### Database State Issues

```bash
# Clear test database manually
mongosh mongodb://localhost:27018/payflow_test --eval "db.dropDatabase()"

# Flush Redis
redis-cli -p 6380 FLUSHALL
```

### Jest Memory Issues

```bash
# Run with memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm test

# Run tests sequentially (less memory)
npm test -- --runInBand
```

---

## Best Practices

1. **Isolate Tests**: Each test should be independent and not rely on state from other tests
2. **Clean Up**: Always clean database state in `beforeEach`
3. **Use Factories**: Create test data using helper functions, not hardcoded values
4. **Mock External Services**: Don't call real external APIs (webhooks, etc.)
5. **Test Edge Cases**: Include tests for error conditions and boundary values
6. **Keep Tests Fast**: Unit tests should run in milliseconds, E2E in seconds
7. **Use Descriptive Names**: Test names should describe the expected behavior
8. **Avoid Sleep/Delays**: Use proper async waiting instead of `setTimeout`

---

## Future Improvements

- [ ] Add `mongodb-memory-server` for unit/integration tests without Docker
- [x] ~~Add `ioredis-mock` for Redis mocking in unit tests~~ (Using Jest mocks instead)
- [ ] Implement MSW (Mock Service Worker) for webhook testing
- [ ] Add contract testing for API endpoints
- [ ] Implement visual regression testing for API docs
- [x] ~~Comprehensive unit tests for event handlers~~ (Completed)
- [x] ~~Unit tests for queue modules and workers~~ (Completed)
- [x] ~~Unit tests for configuration modules~~ (Completed)
- [ ] Increase controller test coverage (currently E2E only)
- [ ] Add mutation testing to verify test quality
