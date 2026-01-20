/**
 * Express Application Configuration
 *
 * Sets up the Express application with all middleware, routes,
 * and security configurations.
 */

import { apiReference } from '@scalar/express-api-reference';
import cors, { CorsOptions } from 'cors';
import express, { Application } from 'express';
import helmet from 'helmet';

import { authRoutes } from './auth';
import { config } from './config';
import { generateOpenAPI } from './docs/openapi';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { idempotencyForMutations, validateIdempotencyKey } from './middlewares/idempotency';
import { globalLimiter, authLimiter, transactionLimiter } from './middlewares/rateLimiter';
import {
  correlationMiddleware,
  metricsMiddleware,
  getMetrics,
  getMetricsContentType,
  logger,
} from './observability';
import healthRoutes from './routes/health';
import { ledgerRoutes } from './services/ledger';
import { transactionRoutes } from './services/transaction';
import { walletRoutes } from './services/wallet';
import { webhookRoutes } from './services/webhook';

/**
 * CORS configuration
 * - Production: Restricted to specific domains
 * - Development: Allow all origins
 */
const corsOptions: CorsOptions = {
  origin: config.isProduction ? (process.env.CORS_ORIGINS || '').split(',').filter(Boolean) : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Idempotency-Key',
    'X-Correlation-Id',
    'X-Request-Id',
  ],
  exposedHeaders: [
    'X-Correlation-Id',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Idempotent-Replayed',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
};

export const createApp = (): Application => {
  const app = express();

  // Trust proxy (needed for rate limiting behind reverse proxy)
  app.set('trust proxy', 1);

  // Security middleware - Enhanced Helmet configuration
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Required for Scalar API docs
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'], // Required for Scalar
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          connectSrc: ["'self'", 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  // CORS with enhanced configuration
  app.use(cors(corsOptions));

  // Request parsing
  app.use(express.json({ limit: '10kb' })); // Limit body size
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Observability middleware (applied early to capture all requests)
  app.use(correlationMiddleware);
  app.use(metricsMiddleware);

  // Validate idempotency key format
  app.use(validateIdempotencyKey);

  // Global rate limiting (skip in test environment)
  if (!config.isTest) {
    app.use(globalLimiter);
  }

  // Health check routes (no auth required)
  app.use('/health', healthRoutes);

  // Metrics endpoint (Prometheus format)
  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', getMetricsContentType());
      res.send(await getMetrics());
    } catch (error) {
      logger.error({ err: error }, 'Error collecting metrics');
      res.status(500).send('Error collecting metrics');
    }
  });

  // OpenAPI spec as JSON
  const openApiSpec = generateOpenAPI();
  app.get('/api-docs.json', (_req, res) => {
    res.json(openApiSpec);
  });

  // API Documentation (Scalar)
  app.use(
    '/api-docs',
    apiReference({
      spec: {
        content: openApiSpec,
      },
      theme: 'purple',
      layout: 'modern',
      darkMode: true,
      metaData: {
        title: 'PayFlow API Documentation',
      },
    })
  );

  // Auth routes with strict rate limiting
  if (!config.isTest) {
    app.use('/auth/login', authLimiter);
    app.use('/auth/register', authLimiter);
  }
  app.use('/auth', authRoutes);

  // Protected routes
  app.use('/wallets', walletRoutes);

  // Transaction routes with rate limiting and idempotency
  if (!config.isTest) {
    app.use('/transactions', transactionLimiter);
  }
  app.use('/transactions', idempotencyForMutations, transactionRoutes);

  app.use('/ledger', ledgerRoutes);
  app.use('/webhooks', webhookRoutes);

  // Root route
  app.get('/', (_req, res) => {
    res.json({
      name: 'PayFlow API',
      version: '1.0.0',
      description: 'Event-driven UPI-like transaction system',
      documentation: '/api-docs',
      health: '/health',
    });
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
