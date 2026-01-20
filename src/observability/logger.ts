import pino from 'pino';

import { config } from '../config';

/**
 * Pino logger configuration
 * - Production: JSON logs at info level
 * - Development: Pretty printed logs at debug level
 * - Test: Disabled for cleaner test output
 */
export const logger = pino({
  level: config.isTest ? 'silent' : config.isProduction ? 'info' : 'debug',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'payflow',
    env: config.nodeEnv,
  },
  ...(config.isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});

// Child logger factory for service-specific logging
export const createServiceLogger = (serviceName: string) => {
  return logger.child({ service: serviceName });
};
