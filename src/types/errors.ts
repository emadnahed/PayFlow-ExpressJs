/**
 * Error Codes for PayFlow API
 *
 * Categorized by error type:
 * - 1xxx: Authentication errors
 * - 2xxx: Validation errors
 * - 3xxx: Business logic errors
 * - 4xxx: Rate limiting errors
 * - 5xxx: System errors
 */

export enum ErrorCode {
  // Authentication errors (1xxx)
  UNAUTHORIZED = 1001,
  INVALID_TOKEN = 1002,
  TOKEN_EXPIRED = 1003,
  INVALID_CREDENTIALS = 1004,

  // Validation errors (2xxx)
  VALIDATION_ERROR = 2001,
  INVALID_AMOUNT = 2002,
  INVALID_INPUT = 2003,
  MISSING_REQUIRED_FIELD = 2004,

  // Business errors (3xxx)
  INSUFFICIENT_BALANCE = 3001,
  USER_NOT_FOUND = 3002,
  WALLET_NOT_FOUND = 3003,
  TRANSACTION_NOT_FOUND = 3004,
  SELF_TRANSFER = 3005,
  DUPLICATE_TRANSACTION = 3006,
  WEBHOOK_NOT_FOUND = 3007,
  USER_ALREADY_EXISTS = 3008,
  WALLET_ALREADY_EXISTS = 3009,
  RESOURCE_NOT_FOUND = 3010,

  // Rate limiting errors (4xxx)
  RATE_LIMIT_EXCEEDED = 4001,
  TOO_MANY_LOGIN_ATTEMPTS = 4002,
  TOO_MANY_TRANSACTIONS = 4003,

  // System errors (5xxx)
  INTERNAL_ERROR = 5001,
  DATABASE_ERROR = 5002,
  REDIS_ERROR = 5003,
  EVENT_BUS_ERROR = 5004,
  WEBHOOK_DELIVERY_ERROR = 5005,
}

/**
 * Error code to HTTP status code mapping
 */
export const errorCodeToStatus: Record<ErrorCode, number> = {
  // Auth errors -> 401/403
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.INVALID_TOKEN]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.INVALID_CREDENTIALS]: 401,

  // Validation errors -> 400
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INVALID_AMOUNT]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.MISSING_REQUIRED_FIELD]: 400,

  // Business errors -> 400/404/409
  [ErrorCode.INSUFFICIENT_BALANCE]: 400,
  [ErrorCode.USER_NOT_FOUND]: 404,
  [ErrorCode.WALLET_NOT_FOUND]: 404,
  [ErrorCode.TRANSACTION_NOT_FOUND]: 404,
  [ErrorCode.SELF_TRANSFER]: 400,
  [ErrorCode.DUPLICATE_TRANSACTION]: 409,
  [ErrorCode.WEBHOOK_NOT_FOUND]: 404,
  [ErrorCode.USER_ALREADY_EXISTS]: 409,
  [ErrorCode.WALLET_ALREADY_EXISTS]: 409,
  [ErrorCode.RESOURCE_NOT_FOUND]: 404,

  // Rate limiting errors -> 429
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.TOO_MANY_LOGIN_ATTEMPTS]: 429,
  [ErrorCode.TOO_MANY_TRANSACTIONS]: 429,

  // System errors -> 500/503
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.DATABASE_ERROR]: 503,
  [ErrorCode.REDIS_ERROR]: 503,
  [ErrorCode.EVENT_BUS_ERROR]: 503,
  [ErrorCode.WEBHOOK_DELIVERY_ERROR]: 502,
};

/**
 * Standard error response format
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string[]>;
    timestamp: string;
    correlationId?: string;
  };
}

/**
 * Standard success response format
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * API Response type
 */
export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
