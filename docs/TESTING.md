# PayFlow Testing Guide

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
```

---

## Test Commands

| Command | Description | Infrastructure Required |
|---------|-------------|------------------------|
| `npm test` | Run all tests | MongoDB + Redis |
| `npm run test:unit` | Unit tests only | None |
| `npm run test:integration` | Integration tests | MongoDB + Redis |
| `npm run test:e2e` | End-to-end tests | MongoDB + Redis |
| `npm run test:coverage` | Tests with coverage report | MongoDB + Redis |
| `npm run test:watch` | Watch mode for development | MongoDB + Redis |
| `npm run test:ci` | CI pipeline tests | MongoDB + Redis |
| `npm run chaos-test` | Chaos/reliability tests | MongoDB + Redis |

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
├── unit/                       # Tier 1: Unit tests (no infrastructure)
│   └── auth/
│       └── auth.validation.test.ts
│
├── integration/                # Tier 2: Integration tests
│   └── auth/
│       └── auth.service.test.ts
│
├── e2e/                        # Tier 3: End-to-end tests
│   ├── auth.test.ts           # Authentication flows
│   ├── wallet.test.ts         # Wallet operations
│   ├── transaction.test.ts    # Transaction flows
│   ├── saga-flow.test.ts      # Saga pattern tests
│   ├── compensation.test.ts   # Refund/rollback tests
│   ├── webhook.test.ts        # Webhook delivery
│   ├── ledger.test.ts         # Ledger operations
│   ├── health.test.ts         # Health endpoints
│   ├── metrics.test.ts        # Prometheus metrics
│   ├── security.test.ts       # Security headers/CORS
│   ├── idempotency.test.ts    # Idempotency keys
│   └── connectivity.test.ts   # Database connectivity
│
├── chaos/                      # Chaos engineering tests
│   └── credit-failure.test.ts # Failure scenario testing
│
├── load/                       # Performance tests
│   └── transaction.load.ts    # Load testing
│
├── helpers/                    # Test utilities
│   ├── index.ts               # Helper exports
│   ├── testApp.ts             # Express app instance
│   ├── testDatabase.ts        # MongoDB connection
│   ├── testEventBus.ts        # Redis connection
│   └── testAuth.ts            # Auth test utilities
│
└── setup.ts                    # Jest global setup
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

### Coverage Thresholds

| Metric | Minimum |
|--------|---------|
| Lines | 70% |
| Functions | 70% |
| Branches | 60% |
| Statements | 70% |

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

## Load Testing

Performance tests are in `tests/load/`:

```bash
# Run load tests (requires k6 or similar)
npm run load-test
```

### Sample Load Test

```typescript
// tests/load/transaction.load.ts
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 10,           // Virtual users
  duration: '30s',   // Test duration
};

export default function() {
  const response = http.post('http://localhost:3000/transactions', {
    receiverId: 'test-receiver',
    amount: 10,
  }, {
    headers: {
      'Authorization': `Bearer ${__ENV.TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  check(response, {
    'status is 201': (r) => r.status === 201,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
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
- [ ] Add `ioredis-mock` for Redis mocking in unit tests
- [ ] Implement MSW (Mock Service Worker) for webhook testing
- [ ] Add contract testing for API endpoints
- [ ] Implement visual regression testing for API docs
