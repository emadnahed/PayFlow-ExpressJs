/**
 * Environment Configuration
 *
 * Central place for environment detection and environment-specific values.
 * Use these flags and values throughout the app to avoid hardcoding environments.
 *
 * Usage:
 *   import { isProduction, MONGODB_URI, API_CONFIG } from './environments';
 *
 *   if (isProduction) { ... }
 *   const uri = MONGODB_URI;
 */

// =============================================================================
// ENVIRONMENT FLAGS
// =============================================================================

/**
 * Current environment from NODE_ENV
 * Defaults to 'development' if not set
 */
export const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Environment detection flags
 * Use these instead of checking NODE_ENV directly
 */
export const isProduction = NODE_ENV === 'production';
export const isDevelopment = NODE_ENV === 'development';
export const isTest = NODE_ENV === 'test';

/**
 * Local development flag
 * Set LOCAL_DEV=true to use localhost URLs even in non-development environments
 * Useful for testing production configs locally
 */
export const isLocalDev = process.env.LOCAL_DEV === 'true';

// =============================================================================
// BASE URLs
// =============================================================================

/**
 * Base API URL for external services
 * TODO: Replace production URLs when ready
 */
export const BASE_API_URL = isProduction
  ? 'https://api.payflow.com/v1' // TODO: Replace with actual production URL
  : isTest
  ? 'http://localhost:3001/v1'
  : 'http://localhost:3000/v1';

/**
 * Base API URL v2 (for future API versions)
 * TODO: Replace production URLs when ready
 */
export const BASE_API_URL_V2 = isProduction
  ? 'https://api.payflow.com/v2' // TODO: Replace with actual production URL
  : isTest
  ? 'http://localhost:3001/v2'
  : 'http://localhost:3000/v2';

/**
 * Internal service URLs (for microservice communication)
 */
export const INTERNAL_SERVICE_URL = isLocalDev
  ? 'http://localhost:3000'
  : isProduction
  ? 'https://internal.payflow.com' // TODO: Replace with actual internal URL
  : 'http://localhost:3000';

// =============================================================================
// DATABASE CONFIGURATION
// =============================================================================

/**
 * MongoDB URI by environment
 */
export const MONGODB_URI = isProduction
  ? process.env.MONGODB_URI || 'mongodb://mongodb:27017/payflow' // TODO: Replace with production cluster URI
  : isTest
  ? process.env.MONGODB_URI || 'mongodb://localhost:27018/payflow-test'
  : process.env.MONGODB_URI || 'mongodb://localhost:27017/payflow';

/**
 * MongoDB connection pool settings
 */
export const MONGODB_CONFIG = {
  maxPoolSize: isProduction ? 50 : 10,
  minPoolSize: isProduction ? 5 : 2,
  maxIdleTimeMS: isProduction ? 60000 : 30000,
  serverSelectionTimeoutMS: isProduction ? 10000 : 5000,
};

// =============================================================================
// REDIS CONFIGURATION
// =============================================================================

/**
 * Redis host by environment
 */
export const REDIS_HOST = isProduction
  ? process.env.REDIS_HOST || 'redis' // TODO: Replace with production Redis host
  : process.env.REDIS_HOST || 'localhost';

/**
 * Redis port by environment
 */
export const REDIS_PORT = parseInt(
  process.env.REDIS_PORT || (isTest ? '6380' : '6379'),
  10
);

/**
 * Redis password (production only)
 */
export const REDIS_PASSWORD = isProduction
  ? process.env.REDIS_PASSWORD || undefined // TODO: Set in production env
  : undefined;

/**
 * Redis configuration object
 */
export const REDIS_CONFIG = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: isProduction ? 5 : 3,
  connectTimeout: isProduction ? 10000 : 5000,
  lazyConnect: true,
};

// =============================================================================
// JWT / AUTHENTICATION CONFIGURATION
// =============================================================================

/**
 * JWT Secret - MUST be set in production
 */
export const JWT_SECRET = isProduction
  ? process.env.JWT_SECRET! // Will throw if not set
  : process.env.JWT_SECRET || 'dev-secret-do-not-use-in-production';

/**
 * JWT token expiration times
 */
export const JWT_CONFIG = {
  secret: JWT_SECRET,
  accessTokenExpiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || (isProduction ? '15m' : '1h'),
  refreshTokenExpiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '7d',
};

// =============================================================================
// BCRYPT CONFIGURATION
// =============================================================================

/**
 * Bcrypt rounds - higher in production for security, lower in test for speed
 */
export const BCRYPT_ROUNDS = isProduction
  ? parseInt(process.env.BCRYPT_ROUNDS || '12', 10) // ~640ms per hash
  : isTest
  ? 4 // Fast for tests
  : parseInt(process.env.BCRYPT_ROUNDS || '10', 10); // ~160ms per hash

// =============================================================================
// RATE LIMITING CONFIGURATION
// =============================================================================

/**
 * Rate limiting configuration by environment
 *
 * In test/development environments, rate limits are significantly relaxed
 * to allow load testing without hitting artificial limits.
 *
 * For load testing in production-like environments:
 *   - Set RATE_LIMIT_DISABLED=true to disable all rate limiting (NOT recommended for production)
 *   - Set LOAD_TEST_SECRET to enable bypass via X-Load-Test-Token header
 *   - Or configure individual limits via environment variables
 *
 * Load Test Bypass Header:
 *   When LOAD_TEST_SECRET is set, requests with header X-Load-Test-Token matching
 *   the secret will bypass rate limiting. Use this for load testing staging/production.
 *   Example: curl -H "X-Load-Test-Token: your-secret" https://api.example.com/health
 */
export const RATE_LIMIT_CONFIG = {
  // Global disable flag for load testing (use with caution!)
  disabled: process.env.RATE_LIMIT_DISABLED === 'true' || false,

  // Load test bypass secret (set this to enable bypass header)
  // When set, requests with X-Load-Test-Token: <secret> bypass rate limits
  loadTestSecret: process.env.LOAD_TEST_SECRET || (isTest ? 'test-load-secret' : ''),

  // Global rate limiter (all routes)
  global: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: isProduction
      ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
      : isTest
      ? 10000 // Very lenient for tests
      : parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
  },

  // Auth rate limiter (login, register)
  auth: {
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: isProduction
      ? parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10) // Strict in production
      : isTest
      ? 10000 // Very lenient for tests
      : parseInt(process.env.AUTH_RATE_LIMIT_MAX || '100', 10), // Lenient in dev
  },

  // Transaction rate limiter
  transaction: {
    windowMs: parseInt(process.env.TX_RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    maxRequests: isProduction
      ? parseInt(process.env.TX_RATE_LIMIT_MAX || '10', 10)
      : isTest
      ? 10000
      : parseInt(process.env.TX_RATE_LIMIT_MAX || '100', 10),
  },

  // API rate limiter (general API calls)
  api: {
    windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    maxRequests: isProduction
      ? parseInt(process.env.API_RATE_LIMIT_MAX || '30', 10)
      : isTest
      ? 10000
      : parseInt(process.env.API_RATE_LIMIT_MAX || '300', 10),
  },

  // Webhook rate limiter
  webhook: {
    windowMs: parseInt(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS || '3600000', 10), // 1 hour
    maxRequests: isProduction
      ? parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX || '10', 10)
      : isTest
      ? 10000
      : parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX || '100', 10),
  },

  skipFailedRequests: !isProduction,
};

// =============================================================================
// WEBHOOK CONFIGURATION
// =============================================================================

/**
 * Webhook delivery configuration
 */
export const WEBHOOK_CONFIG = {
  timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || (isProduction ? '10000' : '5000'), 10),
  retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '5', 10),
  maxFailureCount: parseInt(process.env.WEBHOOK_MAX_FAILURE_COUNT || '10', 10),
  maxPageLimit: parseInt(process.env.WEBHOOK_MAX_PAGE_LIMIT || '100', 10),
};

// =============================================================================
// API CONFIGURATION
// =============================================================================

/**
 * API configuration
 */
export const API_CONFIG = {
  bodyLimit: process.env.API_BODY_LIMIT || '10kb',
  port: parseInt(process.env.PORT || '3000', 10),
  corsOrigins: isProduction
    ? (process.env.CORS_ORIGINS || 'https://payflow.com').split(',') // TODO: Set actual origins
    : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
};

// =============================================================================
// LOGGING CONFIGURATION
// =============================================================================

/**
 * Logging configuration by environment
 */
export const LOG_CONFIG = {
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : isTest ? 'error' : 'debug'),
  prettyPrint: !isProduction && !isTest,
};

// =============================================================================
// OBSERVABILITY / TELEMETRY
// =============================================================================

/**
 * OpenTelemetry configuration
 */
export const OTEL_CONFIG = {
  enabled: isProduction || process.env.OTEL_ENABLED === 'true',
  serviceName: process.env.OTEL_SERVICE_NAME || 'payflow-api',
  exporterEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
};

// =============================================================================
// EXTERNAL SERVICES (Future Use)
// =============================================================================

/**
 * Payment gateway configuration
 * TODO: Configure when integrating payment providers
 */
export const PAYMENT_GATEWAY_CONFIG = {
  // Example: PhonePe-like configuration
  merchantId: isProduction
    ? process.env.PAYMENT_MERCHANT_ID || 'PAYFLOW_PROD' // TODO: Set in production
    : 'PGTESTPAYUAT',
  environment: isProduction ? 'PRODUCTION' : 'SANDBOX',
  enableLogging: !isProduction,
  callbackUrl: isProduction
    ? 'https://api.payflow.com/webhooks/payment' // TODO: Set actual URL
    : 'http://localhost:3000/webhooks/payment',
};

/**
 * Payment response domain for webhook verification
 */
export const PAYMENT_RESPONSE_DOMAIN = isProduction
  ? 'api.payflow.com' // TODO: Set actual domain
  : 'localhost';

// =============================================================================
// TESTING CONFIGURATION
// =============================================================================

/**
 * E2E test configuration
 * Only used in test environment
 */
export const E2E_TEST_CONFIG = {
  // Auth token for E2E tests - NEVER use in production
  authToken: isTest ? 'e2e-test-auth-token-not-for-production' : undefined,
  // Test user credentials
  testUser: isTest
    ? {
        email: 'test@example.com',
        password: 'TestPassword123!',
        phone: '+1234567890',
      }
    : undefined,
};

// =============================================================================
// SECURITY CONFIGURATION
// =============================================================================

/**
 * Security-related configuration
 */
export const SECURITY_CONFIG = {
  // Helmet configuration
  contentSecurityPolicy: isProduction,
  hsts: isProduction,
  // Cookie settings
  cookieSecure: isProduction,
  cookieSameSite: isProduction ? ('strict' as const) : ('lax' as const),
};

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate required production environment variables
 * Call this during app startup in production
 */
export const validateProductionEnv = (): void => {
  if (!isProduction) return;

  const required = [
    'JWT_SECRET',
    'MONGODB_URI',
    'REDIS_HOST',
    'REDIS_PASSWORD',
    'CORS_ORIGINS',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for production: ${missing.join(', ')}`
    );
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }
};

// =============================================================================
// DEBUG / INFO
// =============================================================================

/**
 * Get current environment info (for logging/debugging)
 */
export const getEnvironmentInfo = () => ({
  nodeEnv: NODE_ENV,
  isProduction,
  isDevelopment,
  isTest,
  isLocalDev,
  apiUrl: BASE_API_URL,
  mongoHost: MONGODB_URI.split('@').pop()?.split('/')[0] || 'localhost', // Don't leak credentials
  redisHost: REDIS_HOST,
});
