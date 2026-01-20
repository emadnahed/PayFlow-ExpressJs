import { Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';

import { asyncLocalStorage, LogContext } from './log-context';
import { logger } from './logger';

/**
 * Correlation ID middleware
 * - Extracts or generates a correlation ID for each request
 * - Stores it in AsyncLocalStorage for access throughout the request lifecycle
 * - Adds correlation ID to response headers
 */
export const correlationMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    uuid();

  res.setHeader('x-correlation-id', correlationId);

  const context: LogContext = {
    correlationId,
  };

  asyncLocalStorage.run(context, () => {
    // Log request start
    logger.info(
      {
        correlationId,
        method: req.method,
        path: req.path,
        query: req.query,
        userAgent: req.headers['user-agent'],
      },
      'Request started'
    );

    // Log response on finish
    res.on('finish', () => {
      logger.info(
        {
          correlationId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
        },
        'Request completed'
      );
    });

    next();
  });
};
