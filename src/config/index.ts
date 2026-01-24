import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

// Import environment-specific configurations
import {
  NODE_ENV,
  isProduction,
  isDevelopment,
  isTest,
  isLocalDev,
  MONGODB_URI,
  MONGODB_CONFIG,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  JWT_CONFIG,
  BCRYPT_ROUNDS,
  RATE_LIMIT_CONFIG,
  WEBHOOK_CONFIG,
  API_CONFIG,
  LOG_CONFIG,
  OTEL_CONFIG,
  SECURITY_CONFIG,
  validateProductionEnv,
  getEnvironmentInfo,
} from './environments';

// Re-export environment utilities
export {
  isProduction,
  isDevelopment,
  isTest,
  isLocalDev,
  validateProductionEnv,
  getEnvironmentInfo,
};

// Re-export environment-specific configs for direct access
export * from './environments';

// Validate production environment variables on startup
if (isProduction) {
  validateProductionEnv();
}

/**
 * Main application configuration object
 *
 * This consolidates all environment-specific settings.
 * Import this for general app configuration needs.
 *
 * For environment-specific values, you can also import directly from './environments'
 */
export const config = {
  // Environment
  nodeEnv: NODE_ENV,
  isProduction,
  isDevelopment,
  isTest,
  isLocalDev,

  // Server
  port: API_CONFIG.port,

  // MongoDB
  mongodb: {
    uri: MONGODB_URI,
    ...MONGODB_CONFIG,
  },

  // Redis
  redis: {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
  },

  // JWT Authentication
  jwt: JWT_CONFIG,

  // Bcrypt
  bcrypt: {
    rounds: BCRYPT_ROUNDS,
  },

  // API
  api: {
    bodyLimit: API_CONFIG.bodyLimit,
    corsOrigins: API_CONFIG.corsOrigins,
  },

  // Rate Limiting
  rateLimit: RATE_LIMIT_CONFIG,

  // Webhooks
  webhook: WEBHOOK_CONFIG,

  // Logging
  logging: LOG_CONFIG,

  // Observability
  otel: OTEL_CONFIG,

  // Security
  security: SECURITY_CONFIG,
};
