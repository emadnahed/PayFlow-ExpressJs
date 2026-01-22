# PayFlow

**Event-Driven UPI-Like Transaction System**

A production-grade payment backend built with Express.js and the Saga pattern. Demonstrates how real payment systems ensure money safety, handle failures gracefully, and scale using event-driven architecture.

> **Core guarantee:** Money is never lost, duplicated, or partially moved - even during failures.

## Features

- **Saga Pattern** - Distributed transaction management with compensating transactions
- **Event-Driven Architecture** - Redis Pub/Sub for service communication
- **JWT Authentication** - Secure token-based auth with refresh tokens
- **Worker-Based Bcrypt** - Non-blocking password hashing using worker threads
- **Clustering** - Multi-process support for CPU utilization
- **Rate Limiting** - Redis-backed distributed rate limiting
- **Idempotency** - Duplicate request prevention
- **Webhook System** - Event notifications with retry logic
- **Observability** - Structured logging, Prometheus metrics, OpenTelemetry tracing
- **API Documentation** - Interactive Scalar API reference

## Quick Start

```bash
# Clone repository
git clone https://github.com/yourusername/payflow-expressjs.git
cd payflow-expressjs

# Install dependencies
npm install

# Start infrastructure (MongoDB + Redis)
npm run docker:up

# Run development server
npm run dev

# Open API docs
open http://localhost:3000/docs
```

## Architecture

```
Client Request
      │
      ▼
┌─────────────────────────────────────┐
│           API Gateway               │
│  Rate Limit │ Auth │ Idempotency    │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│        Transaction Service          │
│        (Saga Orchestrator)          │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│           Event Bus (Redis)         │
└─────────────────────────────────────┘
      │
      ├──▶ Wallet Service (Debit/Credit)
      ├──▶ Ledger Service (Receiver Credit)
      └──▶ Webhook Service (Notifications)
```

## Transaction Flow

```
INITIATED → DEBITED → CREDITED → COMPLETED
                ↓
           (on failure)
                ↓
           REFUNDING → FAILED
```

1. **Initiate** - Create transaction, validate inputs
2. **Debit** - Deduct from sender wallet
3. **Credit** - Add to receiver wallet (via Ledger)
4. **Complete** - Mark success, trigger webhooks
5. **Compensate** - Refund sender if credit fails

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Register new user |
| `/auth/login` | POST | Authenticate user |
| `/wallets/me` | GET | Get wallet balance |
| `/wallets/me/deposit` | POST | Deposit funds |
| `/transactions` | POST | Create transaction |
| `/transactions` | GET | List transactions |
| `/transactions/:id` | GET | Get transaction details |
| `/webhooks` | POST | Subscribe to events |
| `/health` | GET | Health check |
| `/metrics` | GET | Prometheus metrics |
| `/docs` | GET | API documentation |

## Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 20 (Clustered) |
| Framework | Express.js 5 |
| Language | TypeScript 5 |
| Database | MongoDB 7 |
| Cache/Events | Redis 7 |
| Queue | BullMQ |
| Auth | JWT + Worker Bcrypt |
| Logging | Pino |
| Metrics | Prometheus |
| Tracing | OpenTelemetry |
| API Docs | Scalar |
| Load Testing | k6 |

## Scripts

```bash
# Development
npm run dev              # Start dev server (single process)
npm run dev:cluster      # Start dev server (clustered)
npm run build            # Compile TypeScript
npm start                # Run production build
npm run start:cluster    # Run production cluster

# Testing - Quick Start
npm run test:unit        # Unit tests only (no infra needed)
npm run test:run:local   # Full suite with auto infra management
npm run test:run:docker  # Full suite with Docker infrastructure

# Testing - Manual
npm test                 # Run all Jest tests
npm run test:integration # Integration tests
npm run test:e2e         # E2E tests
npm run test:coverage    # With coverage report
npm run test:api:local   # Curl API tests against localhost
npm run chaos-test       # Chaos testing

# Infrastructure Management
npm run infra:local:up   # Start test MongoDB (27018) + Redis (6380)
npm run infra:local:down # Stop test infrastructure
npm run infra:docker:up  # Start full Docker stack

# Load Testing (k6)
npm run k6:local         # Smoke + load + stress (local)
npm run k6:docker        # Smoke + load + stress (docker)
npm run k6:vps           # Smoke + load + stress (VPS)

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix linting issues
npm run format           # Format with Prettier

# Docker
npm run docker:up        # Start dev stack
npm run docker:down      # Stop dev stack
npm run docker:prod      # Start prod stack
npm run docker:prod:scale # Scale to 3 instances
```

## Project Structure

```
src/
├── app.ts              # Express app setup
├── server.ts           # Entry point (single process)
├── cluster.ts          # Cluster entry point (multi-process)
├── config/             # Configuration
├── auth/               # Authentication module
├── services/           # Business services
│   ├── wallet/         # Wallet operations
│   ├── transaction/    # Saga orchestrator
│   ├── ledger/         # Credit/refund handling
│   └── webhook/        # Event delivery
├── models/             # Mongoose schemas
├── middlewares/        # Express middlewares
├── events/             # Redis event bus
├── queues/             # BullMQ job queues
├── utils/              # Utilities
│   ├── bcrypt.ts       # Worker-based bcrypt
│   └── bcryptWorker.ts # Bcrypt worker thread
├── observability/      # Logging, metrics, tracing
└── docs/               # OpenAPI specification

tests/
├── unit/               # Unit tests (428)
├── integration/        # Integration tests (214)
├── e2e/                # End-to-end tests (212)
├── chaos/              # Failure scenario tests
└── load/               # Performance tests

scripts/
├── test-api.sh         # cURL-based API tests
└── run-full-tests.sh   # Orchestrated test runner

load-testing/           # k6 Load Testing Suite
├── config/             # Environment configurations
├── tests/              # Test scenarios
│   ├── smoke/          # Quick health checks
│   ├── load/           # Standard load tests
│   ├── stress/         # Breaking point tests
│   └── soak/           # Long-running stability
├── scripts/            # Report generation
└── .github/workflows/  # CI/CD integration
```

## Environment Variables

```env
NODE_ENV=development
PORT=3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/payflow

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1h
```

## Documentation

- [API Reference](docs/API.md) - Complete API documentation
- [Architecture](docs/ARCHITECTURE.md) - System design and patterns
- [Testing Guide](docs/TESTING.md) - Comprehensive testing documentation
- [Deployment](docs/DEPLOYMENT.md) - Production deployment guide
- [Performance Report](docs/PERFORMANCE-OPTIMIZATION-REPORT.md) - Load testing results and optimizations
- [Contributing](docs/CONTRIBUTING.md) - Contribution guidelines

## Testing

The project includes comprehensive test coverage:

| Category | Tests | Description |
|----------|-------|-------------|
| **Unit Tests** | 428 | Service logic isolation with mocks |
| **Integration Tests** | 214 | Service interactions with real DB |
| **E2E Tests** | 212 | Full HTTP API flow testing |
| **cURL API Tests** | 29 | Shell-based endpoint testing |
| **Total** | **883+** | All environments supported |

```bash
# Easiest: Full orchestrated test suite
npm run test:run:local       # Handles infra, API, tests, cleanup

# Manual control
npm run infra:local:up       # Start test MongoDB + Redis
npm run test:unit            # Unit tests (no infra needed)
npm run test:jest:local      # Unit + Integration + E2E
npm run test:api:local       # cURL API tests
npm run k6:local             # k6 load tests
npm run infra:local:down     # Cleanup

# View coverage report
open coverage/lcov-report/index.html
```

See [docs/TESTING.md](docs/TESTING.md) for detailed testing documentation and [load-testing/README.md](load-testing/README.md) for k6 load testing.

## Production Deployment

### Docker

```bash
# Build production image
docker build -t payflow:latest .

# Run with Docker Compose
npm run docker:prod
```

### Kubernetes

See [Deployment Guide](docs/DEPLOYMENT.md) for Kubernetes manifests and configuration.

## Observability

- **Metrics**: `/metrics` endpoint (Prometheus format)
- **Health**: `/health`, `/health/live`, `/health/ready`
- **Tracing**: OpenTelemetry with OTLP export
- **Logging**: Structured JSON logs with Pino

## License

ISC

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.
