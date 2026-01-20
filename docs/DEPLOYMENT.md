# PayFlow Deployment Guide

## Prerequisites

- Docker 24+ and Docker Compose v2
- Node.js 20+ (for local development)
- MongoDB 7+ (or Docker)
- Redis 7+ (or Docker)

## Quick Start (Development)

```bash
# Clone and install
git clone https://github.com/yourusername/payflow-expressjs.git
cd payflow-expressjs
npm install

# Start dependencies
npm run docker:up

# Run development server
npm run dev
```

## Environment Configuration

### Required Variables

```env
# .env
NODE_ENV=production

# Server
PORT=3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/payflow

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Observability (optional)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
LOG_LEVEL=info
```

### Environment-Specific Configs

| Variable | Development | Production |
|----------|-------------|------------|
| NODE_ENV | development | production |
| LOG_LEVEL | debug | info |
| RATE_LIMIT_MAX | 1000 | 100 |

## Docker Deployment

### Build Production Image

```bash
# Build
docker build -t payflow:latest .

# Run standalone
docker run -d \
  --name payflow \
  -p 3000:3000 \
  -e MONGODB_URI=mongodb://host:27017/payflow \
  -e REDIS_HOST=redis-host \
  -e JWT_SECRET=your-secret \
  payflow:latest
```

### Docker Compose (Recommended)

**Development Stack:**

```bash
# Start all services
npm run docker:up

# View logs
npm run docker:logs

# Stop
npm run docker:down
```

**Production Stack:**

```bash
# Start production cluster
npm run docker:prod

# Scale API instances
npm run docker:prod:scale  # Scales to 3 instances

# Stop
npm run docker:prod:down
```

### Production Docker Compose Features

The production stack (`docker/docker-compose.prod.yml`) includes:

- **Nginx Load Balancer**: Distributes traffic across API instances
- **Horizontal Scaling**: 3+ API replicas
- **MongoDB Replica Set**: Primary + secondary for redundancy
- **Resource Limits**: Memory and CPU constraints
- **Health Checks**: Automatic container recovery
- **Persistent Volumes**: Data survival across restarts

## Kubernetes Deployment

### Prerequisites

```bash
# Create namespace
kubectl create namespace payflow

# Create secrets
kubectl create secret generic payflow-secrets \
  --from-literal=jwt-secret=your-secret \
  --from-literal=mongodb-uri=mongodb://... \
  -n payflow
```

### Deployment Manifest

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payflow-api
  namespace: payflow
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payflow-api
  template:
    metadata:
      labels:
        app: payflow-api
    spec:
      containers:
        - name: payflow
          image: yourusername/payflow:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: production
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: payflow-secrets
                  key: jwt-secret
            - name: MONGODB_URI
              valueFrom:
                secretKeyRef:
                  name: payflow-secrets
                  key: mongodb-uri
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
```

### Service & Ingress

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: payflow-api
  namespace: payflow
spec:
  selector:
    app: payflow-api
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: payflow-ingress
  namespace: payflow
  annotations:
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  rules:
    - host: api.payflow.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: payflow-api
                port:
                  number: 80
```

### Apply Configuration

```bash
kubectl apply -f k8s/ -n payflow
```

## CI/CD Pipeline

### GitHub Actions

The project includes a CI/CD pipeline (`.github/workflows/ci.yml`) that:

1. **Lint**: ESLint + Prettier checks
2. **Test**: Unit, integration, and E2E tests
3. **Build**: TypeScript compilation
4. **Docker**: Build and push image (on main branch)
5. **Security**: npm audit + secret scanning

### Required Secrets

Configure these in GitHub repository settings:

| Secret | Description |
|--------|-------------|
| `DOCKER_USERNAME` | Docker Hub username |
| `DOCKER_PASSWORD` | Docker Hub password/token |
| `CODECOV_TOKEN` | Codecov upload token (optional) |

### Branch Protection

Recommended settings for `main` branch:

- Require pull request reviews
- Require status checks (lint, test, build)
- Require branches to be up to date

## Health Monitoring

### Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `/health` | Full health check | 200 if all deps healthy |
| `/health/live` | Liveness probe | 200 if process running |
| `/health/ready` | Readiness probe | 200 if ready for traffic |
| `/metrics` | Prometheus metrics | Metrics in text format |

### Prometheus Scrape Config

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'payflow'
    static_configs:
      - targets: ['payflow:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Grafana Dashboard

Import metrics into Grafana with queries like:

```promql
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# Transaction success rate
transactions_total{status="COMPLETED"} / transactions_total
```

## Database Operations

### MongoDB Backup

```bash
# Backup
mongodump --uri="mongodb://localhost:27017/payflow" --out=/backup

# Restore
mongorestore --uri="mongodb://localhost:27017/payflow" /backup/payflow
```

### Redis Persistence

Redis is configured with AOF persistence by default. For backup:

```bash
# Trigger RDB snapshot
redis-cli BGSAVE

# Copy dump.rdb and appendonly.aof
```

## Troubleshooting

### Common Issues

**Application won't start:**
```bash
# Check environment variables
docker exec payflow env | grep -E "(MONGO|REDIS|JWT)"

# Check connectivity
docker exec payflow wget -q -O- http://localhost:3000/health
```

**Database connection failed:**
```bash
# Test MongoDB connection
mongosh mongodb://localhost:27017/payflow --eval "db.runCommand({ping:1})"

# Check container network
docker network inspect payflow-network
```

**High memory usage:**
```bash
# Check Node.js heap
curl http://localhost:3000/metrics | grep nodejs_heap

# Adjust limits in Dockerfile
ENV NODE_OPTIONS="--max-old-space-size=256"
```

### Log Analysis

```bash
# Structured log search (development)
npm run dev 2>&1 | jq 'select(.level >= 40)'

# Docker logs
docker logs payflow --tail 100 -f

# Filter errors
docker logs payflow 2>&1 | grep '"level":50'
```

## Production Checklist

### Pre-deployment

- [ ] Environment variables configured
- [ ] Secrets are secure (not in code)
- [ ] Database indexes created
- [ ] Redis persistence enabled
- [ ] Health checks configured
- [ ] Rate limiting appropriate for load

### Security

- [ ] HTTPS/TLS configured
- [ ] JWT secret is strong (32+ chars)
- [ ] CORS origins restricted
- [ ] Security headers enabled (Helmet)
- [ ] Dependencies updated (`npm audit`)

### Monitoring

- [ ] Health endpoints accessible
- [ ] Prometheus scraping metrics
- [ ] Alerts configured for errors
- [ ] Log aggregation in place

### Scaling

- [ ] Multiple API instances running
- [ ] Load balancer configured
- [ ] Database replica set (MongoDB)
- [ ] Redis cluster/sentinel (if needed)
- [ ] Resource limits set

## Support

For issues and questions:
- GitHub Issues: [Report a bug](https://github.com/yourusername/payflow-expressjs/issues)
- Documentation: `/docs` endpoint in running instance
