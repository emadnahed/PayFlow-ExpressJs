/**
 * Error Handling Middleware
 *
 * Provides centralized error handling with consistent error response format,
 * error logging, and appropriate error sanitization for production.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger, getCorrelationId } from '../observability';
import { ErrorCode, ErrorResponse, errorCodeToStatus } from '../types/errors';

/**
 * Extended Error interface with additional properties
 */
export interface AppError extends Error {
  statusCode?: number;
  errorCode?: ErrorCode;
  isOperational?: boolean;
  validationErrors?: Record<string, string[]>;
}

/**
 * Main error handler middleware
 *
 * Catches all errors and returns a consistent JSON response format.
 * Logs errors with correlation ID for traceability.
 */
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const correlationId = getCorrelationId() || 'unknown';

  // Determine error code and status
  const errorCode = err.errorCode || ErrorCode.INTERNAL_ERROR;
  const statusCode =
    err.statusCode || errorCodeToStatus[errorCode] || 500;

  // Log error with context
  logger.error(
    {
      correlationId,
      errorCode,
      statusCode,
      error: err.message,
      stack: config.isDevelopment ? err.stack : undefined,
      path: req.path,
      method: req.method,
      isOperational: err.isOperational,
    },
    `Error: ${err.message}`
  );

  // Sanitize error message for production 5xx errors
  const message =
    config.isProduction && statusCode >= 500
      ? 'Internal server error'
      : err.message || 'An error occurred';

  // Build error response
  const response: ErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
      timestamp: new Date().toISOString(),
      correlationId,
    },
  };

  // Include validation errors if present
  if (err.validationErrors) {
    response.error.details = err.validationErrors;
  }

  res.status(statusCode).json(response);
};

/**
 * Not found handler for unmatched routes
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const correlationId = getCorrelationId() || 'unknown';

  const response: ErrorResponse = {
    success: false,
    error: {
      code: ErrorCode.VALIDATION_ERROR,
      message: `Route ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString(),
      correlationId,
    },
  };

  res.status(404).json(response);
};

/**
 * Map HTTP status codes to error codes for backward compatibility
 */
const statusToErrorCode: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.UNAUTHORIZED, // Using UNAUTHORIZED for forbidden
  404: ErrorCode.USER_NOT_FOUND, // Generic not found
  409: ErrorCode.DUPLICATE_TRANSACTION, // Generic conflict
  429: ErrorCode.RATE_LIMIT_EXCEEDED,
  500: ErrorCode.INTERNAL_ERROR,
  502: ErrorCode.WEBHOOK_DELIVERY_ERROR,
  503: ErrorCode.DATABASE_ERROR,
};

/**
 * API Error class for throwing operational errors
 *
 * Supports both old-style (statusCode, message) and new-style (ErrorCode, message) constructors
 * for backward compatibility.
 */
export class ApiError extends Error implements AppError {
  statusCode: number;
  errorCode: ErrorCode;
  isOperational: boolean;
  validationErrors?: Record<string, string[]>;

  constructor(
    codeOrStatus: ErrorCode | number,
    message: string,
    options?: {
      statusCode?: number;
      isOperational?: boolean;
      validationErrors?: Record<string, string[]>;
    }
  ) {
    super(message);

    // Determine if this is an ErrorCode or HTTP status code
    // ErrorCodes are 1000+ while HTTP status codes are < 600
    if (codeOrStatus >= 1000) {
      // New-style: ErrorCode
      this.errorCode = codeOrStatus as ErrorCode;
      this.statusCode = options?.statusCode || errorCodeToStatus[this.errorCode] || 500;
    } else {
      // Old-style: HTTP status code (backward compatibility)
      this.statusCode = codeOrStatus;
      this.errorCode = statusToErrorCode[codeOrStatus] || ErrorCode.INTERNAL_ERROR;
    }

    this.isOperational = options?.isOperational ?? true;
    this.validationErrors = options?.validationErrors;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Factory methods for common errors (using new ErrorCode style)
   */
  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(ErrorCode.UNAUTHORIZED, message);
  }

  static invalidToken(message = 'Invalid token'): ApiError {
    return new ApiError(ErrorCode.INVALID_TOKEN, message);
  }

  static tokenExpired(message = 'Token expired'): ApiError {
    return new ApiError(ErrorCode.TOKEN_EXPIRED, message);
  }

  static validationError(
    message: string,
    validationErrors?: Record<string, string[]>
  ): ApiError {
    return new ApiError(ErrorCode.VALIDATION_ERROR, message, {
      validationErrors,
    });
  }

  static insufficientBalance(message = 'Insufficient balance'): ApiError {
    return new ApiError(ErrorCode.INSUFFICIENT_BALANCE, message);
  }

  static notFound(resource: string): ApiError {
    const codeMap: Record<string, ErrorCode> = {
      user: ErrorCode.USER_NOT_FOUND,
      wallet: ErrorCode.WALLET_NOT_FOUND,
      transaction: ErrorCode.TRANSACTION_NOT_FOUND,
      webhook: ErrorCode.WEBHOOK_NOT_FOUND,
    };
    const code = codeMap[resource.toLowerCase()] || ErrorCode.RESOURCE_NOT_FOUND;
    return new ApiError(code, `${resource} not found`);
  }

  static selfTransfer(message = 'Cannot transfer to self'): ApiError {
    return new ApiError(ErrorCode.SELF_TRANSFER, message);
  }

  static duplicateTransaction(message = 'Duplicate transaction'): ApiError {
    return new ApiError(ErrorCode.DUPLICATE_TRANSACTION, message);
  }

  static alreadyExists(resource: string): ApiError {
    const codeMap: Record<string, ErrorCode> = {
      user: ErrorCode.USER_ALREADY_EXISTS,
      wallet: ErrorCode.WALLET_ALREADY_EXISTS,
    };
    const code = codeMap[resource.toLowerCase()] || ErrorCode.VALIDATION_ERROR;
    return new ApiError(code, `${resource} already exists`);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(ErrorCode.INTERNAL_ERROR, message, {
      isOperational: false,
    });
  }

  static database(message = 'Database error'): ApiError {
    return new ApiError(ErrorCode.DATABASE_ERROR, message);
  }

  static rateLimitExceeded(message = 'Rate limit exceeded'): ApiError {
    return new ApiError(ErrorCode.RATE_LIMIT_EXCEEDED, message);
  }
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
