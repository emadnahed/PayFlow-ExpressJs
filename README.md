# PayFlow

**Event-Driven UPI-Like Transaction System**

A production-grade payment backend built with Express.js and the Saga pattern. Demonstrates how real payment systems ensure money safety, handle failures gracefully, and scale using event-driven architecture.

> **Core guarantee:** Money is never lost, duplicated, or partially moved - even during failures.

## Features

- **Saga Pattern** - Distributed transaction management with compensating transactions
- **Event-Driven Architecture** - Redis Pub/Sub for service communication
- **JWT Authentication** - Secure token-based auth with refresh tokens
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
| Runtime | Node.js 20 |
| Framework | Express.js 5 |
| Language | TypeScript 5 |
| Database | MongoDB 7 |
| Cache/Events | Redis 7 |
| Queue | BullMQ |
| Auth | JWT |
| Logging | Pino |
| Metrics | Prometheus |
| Tracing | OpenTelemetry |
| API Docs | Scalar |

## Scripts

```bash
# Development
npm run dev              # Start dev server
npm run build            # Compile TypeScript
npm start                # Run production build

# Testing
npm test                 # Run all tests
npm run test:unit        # Unit tests
npm run test:e2e         # E2E tests
npm run test:coverage    # With coverage report
npm run chaos-test       # Chaos testing

# Load Testing (k6)
cd load-testing
npm run test:smoke:docker    # Smoke tests against local Docker
npm run test:load:docker     # Load tests against local Docker
npm run test:smoke:vps       # Smoke tests against VPS
npm run test:load:vps        # Load tests against VPS
npm run test:stress:docker   # Stress tests (find breaking points)
npm run test:soak:docker     # Soak tests (long-running stability)

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix linting issues
npm run format           # Format with Prettier
npm run format:check     # Check formatting

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
├── server.ts           # Entry point
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
├── observability/      # Logging, metrics, tracing
└── docs/               # OpenAPI specification

tests/
├── unit/               # Unit tests
├── integration/        # Integration tests
├── e2e/                # End-to-end tests
├── chaos/              # Failure scenario tests
└── load/               # Performance tests

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
- [Deployment](docs/DEPLOYMENT.md) - Production deployment guide
- [Contributing](docs/CONTRIBUTING.md) - Contribution guidelines

## Testing

The project includes comprehensive test coverage:

- **Unit Tests** - Service logic isolation
- **Integration Tests** - Service interactions
- **E2E Tests** - Full API flow testing
- **Chaos Tests** - Failure scenario validation
- **Load Tests** - Performance benchmarking with k6

```bash
# Run full test suite
npm run test:ci

# View coverage report
open coverage/lcov-report/index.html

# k6 Load Testing (requires k6 installed)
cd load-testing
npm run test:smoke:docker    # Quick health checks
npm run test:load:docker     # Standard load tests
npm run test:stress:docker   # Find breaking points
npm run test:soak:docker     # Long-running stability
```

See [load-testing/README.md](load-testing/README.md) for detailed load testing documentation.

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
