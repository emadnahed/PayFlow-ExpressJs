import { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDuration } from './metrics';

/**
 * Normalize path to prevent high cardinality in metrics
 * Replaces dynamic segments (IDs, UUIDs) with placeholders
 */
const normalizePath = (path: string): string => {
  // Replace UUIDs
  let normalized = path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );

  // Replace MongoDB ObjectIds (24 hex characters)
  normalized = normalized.replace(/[0-9a-f]{24}/gi, ':id');

  // Replace numeric IDs
  normalized = normalized.replace(/\/\d+/g, '/:id');

  return normalized;
};

/**
 * Get the route pattern from Express request
 * Falls back to normalized path if no route is available
 */
const getRoutePath = (req: Request): string => {
  // Try to get the matched route pattern
  if (req.route?.path) {
    const basePath = req.baseUrl || '';
    return basePath + req.route.path;
  }

  // Fall back to normalized path
  return normalizePath(req.path);
};

/**
 * HTTP metrics middleware
 * Records request count and duration for Prometheus
 */
export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Skip metrics for the metrics endpoint itself
  if (req.path === '/metrics') {
    next();
    return;
  }

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationNs = Number(end - start);
    const durationSeconds = durationNs / 1e9;

    const labels = {
      method: req.method,
      path: getRoutePath(req),
      status: res.statusCode.toString(),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationSeconds);
  });

  next();
};
