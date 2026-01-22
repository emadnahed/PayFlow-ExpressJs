# ================================
# PayFlow Express.js - Dockerfile
# Multi-stage production build
# ================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies only (better layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install all dependencies (including dev)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

# Add labels for container identification
LABEL org.opencontainers.image.title="PayFlow API"
LABEL org.opencontainers.image.description="Event-driven UPI-like transaction system"
LABEL org.opencontainers.image.vendor="PayFlow"

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S payflow -u 1001 -G nodejs

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Set ownership to non-root user
RUN chown -R payflow:nodejs /app

# Switch to non-root user
USER payflow

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health/live', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000

# ================================
# Node.js Tuning for I/O-bound workloads
# ================================
# UV_THREADPOOL_SIZE: Increase async I/O threads (default: 4)
# - MongoDB, Redis, file operations use libuv thread pool
# - 8 threads optimal for I/O-heavy payment processing
ENV UV_THREADPOOL_SIZE=8

# Node.js memory and GC options passed via CMD
# --max-old-space-size=256: Limit V8 heap to 256MB (leaves room for other memory)
# --optimize-for-size: Prefer memory efficiency over speed
# --gc-interval=100: More frequent GC for lower memory footprint

# Start the application with clustering for multi-core utilization
# Use cluster.js for production (spawns workers based on CLUSTER_WORKERS env)
CMD ["node", "--max-old-space-size=256", "--optimize-for-size", "--gc-interval=100", "dist/cluster.js"]
