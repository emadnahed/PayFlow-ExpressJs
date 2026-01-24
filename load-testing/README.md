# PayFlow Load Testing Suite

A comprehensive load testing solution for PayFlow's Express.js API using k6, designed to ensure system reliability and performance under various load conditions.

## Features

- **Multiple Test Types**: Smoke, load, stress, spike, and soak testing scenarios
- **CI/CD Integration**: GitHub Actions for automated testing
- **Environment-Aware**: Test against different environments (local, staging, production)
- **Detailed Reporting**: HTML and JSON reports with performance metrics
- **Performance Baselines**: Track performance over time and detect regressions

## Prerequisites

- Node.js v16+
- k6 v0.45.0+
- Docker (optional, for containerized execution)
- GitHub account (for CI/CD)

## Installation

```bash
# Install k6 (macOS)
brew install k6

# Install k6 (Linux)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Install k6 (Windows)
choco install k6
```

## Running Tests

### Quick Start

```bash
# Run smoke tests (quick health check)
k6 run tests/smoke/smoke.test.js

# Run health endpoint tests only
k6 run tests/smoke/health.test.js

# Run load tests
k6 run tests/load/api.test.js

# Run user journey tests
k6 run tests/load/user-journey.test.js

# Run stress tests (find breaking points)
k6 run tests/stress/stress.test.js

# Run spike tests (sudden load spikes)
k6 run tests/stress/spike.test.js

# Run soak tests (long-running stability)
k6 run tests/soak/soak.test.js
```

### Environment Configuration

The test suite supports multiple environments:

| Environment | Description | Use Case |
|-------------|-------------|----------|
| `local` | Local dev server (non-Docker) | Development testing |
| `docker-local` | Docker containers on localhost | Local Docker testing |
| `vps` | Docker containers on remote VPS | Production-like testing |
| `staging` | Staging environment | Pre-production testing |
| `production` | Production environment | Production monitoring |

```bash
# Test against local environment
k6 run -e ENV=local tests/smoke/smoke.test.js

# Test against local Docker containers
k6 run -e ENV=docker-local tests/smoke/smoke.test.js

# Test against VPS Docker containers
k6 run -e ENV=vps -e API_URL=https://your-vps-domain.com tests/smoke/smoke.test.js

# Test against staging environment
k6 run -e ENV=staging tests/smoke/smoke.test.js

# Test against production (use with caution!)
k6 run -e ENV=production tests/smoke/smoke.test.js
```

### Docker Local Testing

Test against Docker containers running on your local machine:

```bash
# Quick smoke test
npm run test:smoke:docker

# Full load test
npm run test:load:docker

# Stress test
npm run test:stress:docker

# Quick validation (5 VUs, 30 seconds)
npm run test:docker:quick

# Run all Docker tests
npm run test:all:docker

# With custom API URL (if Docker uses different port)
k6 run -e ENV=docker-local -e API_URL=http://localhost:8080 tests/smoke/smoke.test.js
```

### VPS Testing

Test against Docker containers running on your VPS:

```bash
# Quick smoke test
npm run test:smoke:vps

# Full load test
npm run test:load:vps

# Stress test
npm run test:stress:vps

# Quick validation
npm run test:vps:quick

# Run all VPS tests
npm run test:all:vps

# With your VPS URL
k6 run -e ENV=vps -e API_URL=https://api.yourdomain.com tests/smoke/smoke.test.js
```

### Custom Parameters

```bash
# Run with custom VUs and duration
k6 run --vus 100 --duration 10m tests/load/api.test.js

# Run with environment variables
k6 run -e API_URL=http://localhost:3000 -e TEST_USER_EMAIL=test@example.com tests/smoke/smoke.test.js

# Generate JSON output for reports
k6 run --out json=results/test_results.json tests/load/api.test.js
```

### Using npm scripts

```bash
# Basic tests (default environment)
npm run test:smoke
npm run test:load
npm run test:stress
npm run test:spike
npm run test:soak
npm run test:journey
npm run test:health

# Local development tests
npm run test:smoke:local
npm run test:load:local
npm run test:stress:local

# Docker local tests
npm run test:smoke:docker
npm run test:load:docker
npm run test:stress:docker
npm run test:spike:docker
npm run test:soak:docker
npm run test:journey:docker
npm run test:all:docker      # Run smoke + load tests
npm run test:docker:quick    # Quick 30s validation

# VPS tests
npm run test:smoke:vps
npm run test:load:vps
npm run test:stress:vps
npm run test:spike:vps
npm run test:soak:vps
npm run test:journey:vps
npm run test:all:vps         # Run smoke + load tests
npm run test:vps:quick       # Quick 30s validation

# Staging tests
npm run test:smoke:staging
npm run test:load:staging
npm run test:stress:staging

# Reports
npm run report:generate      # Generate HTML report
npm run report:html          # Run test + generate report
npm run report:compare       # Compare against baseline
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# API Configuration
API_URL=http://localhost:3000
API_VERSION=v1

# Test User Credentials
TEST_USER_EMAIL=loadtest@example.com
TEST_USER_PASSWORD=LoadTest123!

# Secondary Test User (for transfer tests)
TEST_USER_2_EMAIL=loadtest2@example.com
TEST_USER_2_PASSWORD=LoadTest123!

# Rate Limit Bypass (required for staging/production)
LOAD_TEST_TOKEN=your-secret-token

# Performance Thresholds
THRESHOLD_P95_RESPONSE_TIME=1000
THRESHOLD_P99_RESPONSE_TIME=2000
THRESHOLD_ERROR_RATE=0.01
```

## Rate Limit Bypass

PayFlow uses rate limiting to protect against abuse. During load testing, requests can hit rate limits and cause false failures. The test suite supports automatic rate limit bypass via the `X-Load-Test-Token` header.

### How It Works

1. Each environment config has a `loadTestToken` setting
2. If configured, the token is automatically added to all requests via `X-Load-Test-Token` header
3. The server validates this token against its `LOAD_TEST_SECRET` environment variable
4. Valid tokens bypass all rate limiters

### Configuration by Environment

| Environment | Default Behavior |
|-------------|------------------|
| `local` | Auto bypass with `test-load-secret` |
| `docker-local` | Auto bypass with `test-load-secret` |
| `vps` | Requires `LOAD_TEST_TOKEN` env var |
| `staging` | Requires `LOAD_TEST_TOKEN` env var |
| `production` | Requires `LOAD_TEST_TOKEN` env var |

### Using Load Test Token

```bash
# Local environments (auto-configured)
npm run test:smoke:local
npm run test:smoke:docker

# Remote environments (requires token)
k6 run -e ENV=vps -e API_URL=https://api.yourdomain.com -e LOAD_TEST_TOKEN=your-secret tests/smoke/smoke.test.js

# Or set via environment variable
export LOAD_TEST_TOKEN=your-secret
npm run test:smoke:vps
```

### Security Notes

- **Never commit tokens** to version control
- **Use strong secrets** (32+ characters) for production
- **Rotate tokens** regularly
- **Server must have matching `LOAD_TEST_SECRET`** environment variable set

## Project Structure

```
load-testing/
├── .github/
│   └── workflows/
│       ├── load-tests.yml        # Manual and PR-triggered tests
│       └── scheduled-tests.yml   # Scheduled performance tests
├── config/
│   ├── environments/
│   │   ├── local.js              # Local dev environment (port 3000)
│   │   ├── docker-local.js       # Docker on localhost (port 3001)
│   │   ├── vps.js                # Docker on remote VPS
│   │   ├── staging.js            # Staging environment
│   │   └── production.js         # Production environment
│   ├── index.js                  # Config loader
│   ├── api-client.js             # API client for all endpoints
│   └── test-utils.js             # Shared test utilities (includes rate limit bypass)
├── tests/
│   ├── smoke/
│   │   ├── smoke.test.js         # Full smoke test suite
│   │   └── health.test.js        # Health endpoint tests
│   ├── load/
│   │   ├── api.test.js           # API load tests
│   │   └── user-journey.test.js  # User journey simulations
│   ├── stress/
│   │   ├── stress.test.js        # Breaking point tests
│   │   └── spike.test.js         # Sudden load spike tests
│   └── soak/
│       └── soak.test.js          # Long-running stability tests
├── scripts/
│   ├── generate-report.js        # HTML report generator
│   └── compare-baselines.js      # Performance regression detector
├── baselines/                    # Performance baselines
├── results/                      # Test results output
├── .env.example                  # Example environment variables
├── .gitignore
├── package.json
└── README.md
```

## Test Types

### 1. Smoke Tests
- **Purpose**: Quick health checks to verify critical paths
- **Load**: 1 VU
- **Duration**: 1 minute
- **Use**: Before every deployment

```bash
k6 run tests/smoke/smoke.test.js
```

### 2. Load Tests
- **Purpose**: Standard performance testing under expected traffic
- **Load**: Ramps from 10 to 100 VUs
- **Duration**: ~16 minutes (with stages)
- **Use**: Regular performance validation

```bash
k6 run tests/load/api.test.js
```

### 3. Stress Tests
- **Purpose**: Find system limits and breaking points
- **Load**: Ramps up to 500 VUs
- **Duration**: ~22 minutes
- **Use**: Capacity planning

```bash
k6 run tests/stress/stress.test.js
```

### 4. Spike Tests
- **Purpose**: Test behavior under sudden extreme load
- **Load**: Multiple spikes up to 400 VUs
- **Duration**: ~15 minutes
- **Use**: DDoS resilience, flash sale scenarios

```bash
k6 run tests/stress/spike.test.js
```

### 5. Soak Tests
- **Purpose**: Detect memory leaks and degradation over time
- **Load**: Sustained 30 VUs
- **Duration**: 1-12 hours (configurable)
- **Use**: Weekly stability checks

```bash
k6 run tests/soak/soak.test.js
# Or with custom duration
k6 run -e SOAK_DURATION=4h tests/soak/soak.test.js
```

## API Endpoints Tested

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Token refresh
- `GET /api/auth/me` - Get current user

### Wallets
- `GET /api/wallets/me` - Get user's wallet
- `GET /api/wallets/me/history` - Get wallet history
- `POST /api/wallets/me/deposit` - Deposit funds
- `GET /api/wallets/:id/balance` - Get wallet balance

### Transactions
- `POST /api/transactions` - Create transaction
- `GET /api/transactions` - List transactions
- `GET /api/transactions/:id` - Get transaction

### Health
- `GET /health` - System health check
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe

## Performance Thresholds

Default thresholds (configurable per environment):

| Metric | Local | Staging | Production |
|--------|-------|---------|------------|
| p95 Response Time | <2000ms | <1000ms | <500ms |
| p99 Response Time | <5000ms | <2000ms | <1000ms |
| Error Rate | <5% | <1% | <0.1% |
| Requests/sec | >10 | >50 | >100 |

## Generating Reports

### HTML Report

```bash
# Run test with JSON output
k6 run --out json=results/test_results.json tests/load/api.test.js

# Generate HTML report
node scripts/generate-report.js results/test_results.json
```

The HTML report includes:
- Overview metrics (requests, error rate, RPS)
- Response time distribution (p50, p90, p95, p99)
- Data transfer statistics
- Check results
- Custom metrics

### Baseline Comparison

```bash
# Compare against baseline
node scripts/compare-baselines.js results/test_results_summary.json baselines/latest.json

# Update baseline if no regression
node scripts/compare-baselines.js results/test_results_summary.json --update-baseline
```

## CI/CD Integration

### GitHub Actions

The load testing suite includes two workflows:

1. **load-tests.yml** - Manual and PR-triggered tests
   - Runs smoke tests on every push/PR
   - Can manually trigger load, stress, or soak tests
   - Posts results as PR comments

2. **scheduled-tests.yml** - Automated scheduled tests
   - Smoke tests every 6 hours
   - Load tests daily at 2 AM UTC
   - Soak tests weekly on Sunday

### Secrets Required

Configure these secrets in your GitHub repository:

- `STAGING_API_URL` - Staging environment URL
- `LOAD_TEST_TOKEN` - Token for bypassing rate limits (must match server's `LOAD_TEST_SECRET`)
- `SLACK_WEBHOOK_URL` - (Optional) For notifications
- `TEST_USER_EMAIL` - Test user email
- `TEST_USER_PASSWORD` - Test user password

## Custom Metrics

The test suite tracks custom metrics:

| Metric | Description |
|--------|-------------|
| `auth_latency` | Authentication request latency |
| `wallet_latency` | Wallet operation latency |
| `transaction_latency` | Transaction operation latency |
| `errors` | Error rate |
| `success` | Success rate |
| `deposits` | Deposit operation count |
| `transactions` | Transaction count |

## Best Practices

1. **Never run stress/spike tests against production** without proper safeguards
2. **Use dedicated test users** to avoid polluting real user data
3. **Run smoke tests** before and after every deployment
4. **Track baselines** to catch performance regressions early
5. **Review reports** after each test run
6. **Clean up test data** periodically

## Troubleshooting

### Common Issues

**Authentication failures:**
- Ensure test users exist in the target environment
- Verify API_URL is correct
- Check if rate limiting is blocking requests (see below)

**Rate limit errors (429 status):**
- For local/docker: Ensure server is running with `NODE_ENV=test`
- For VPS/staging/production: Set `LOAD_TEST_TOKEN` environment variable
- Verify server has matching `LOAD_TEST_SECRET` configured
- Check that `loadTestToken` is set in the environment config

**High error rates:**
- Check if the server is running
- Verify database connections
- Review server logs for errors
- Ensure rate limit bypass is properly configured

**Timeout errors:**
- Increase timeout thresholds for slow environments
- Check network connectivity
- Verify server capacity

### Debug Mode

```bash
# Run with verbose output
k6 run --verbose tests/smoke/smoke.test.js

# Run with HTTP debug
k6 run --http-debug tests/smoke/smoke.test.js
```

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [k6 JavaScript API](https://k6.io/docs/javascript-api/)
- [k6 Cloud](https://k6.io/cloud/)
- [Grafana + k6 Integration](https://grafana.com/docs/grafana-cloud/k6/)

## Contributing

1. Create a feature branch
2. Add/modify tests
3. Run smoke tests to verify
4. Submit a pull request
5. Ensure CI passes

## License

MIT License - See [LICENSE](../LICENSE) for details.
