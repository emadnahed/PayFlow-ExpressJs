/**
 * OpenAPI Specification Generator
 *
 * Generates OpenAPI 3.0.3 specification for the PayFlow API.
 * Comprehensive documentation for all endpoints.
 */

import { config } from '../config';

/**
 * OpenAPI specification type
 */
export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
    contact?: {
      name: string;
      email?: string;
    };
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  tags: Array<{
    name: string;
    description: string;
  }>;
  paths: Record<string, unknown>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
    responses?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  };
  security?: Array<Record<string, string[]>>;
}

/**
 * Generate OpenAPI specification
 */
export const generateOpenAPI = (): OpenAPISpec => {
  const baseUrl = config.isProduction
    ? 'https://api.payflow.com'
    : `http://localhost:${config.port}`;

  return {
    openapi: '3.0.3',
    info: {
      title: 'PayFlow API',
      version: '1.0.0',
      description: `
# PayFlow API

Event-driven UPI-like transaction system with the following features:

## Features
- **User Authentication**: JWT-based authentication with secure password hashing
- **Wallet Management**: Create and manage digital wallets with deposit functionality
- **Transactions**: Send money between wallets with saga-based orchestration
- **Webhooks**: Event notifications for transaction status changes
- **Observability**: Full metrics, tracing, and structured logging

## Rate Limiting
| Endpoint | Limit |
|----------|-------|
| Global | 100 requests / 15 minutes |
| Auth (login/register) | 5 attempts / 15 minutes |
| Transactions | 10 / minute per user |

## Idempotency
Use the \`X-Idempotency-Key\` header for POST/PUT/PATCH requests to prevent duplicate processing.
Keys must be alphanumeric with dashes/underscores, max 64 characters.

## Error Codes
| Range | Category |
|-------|----------|
| 1xxx | Authentication errors |
| 2xxx | Validation errors |
| 3xxx | Business logic errors |
| 4xxx | Rate limiting errors |
| 5xxx | System errors |
      `.trim(),
      contact: {
        name: 'PayFlow Support',
      },
    },
    servers: [
      {
        url: baseUrl,
        description: config.isProduction ? 'Production' : 'Development',
      },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication and user management' },
      { name: 'Wallets', description: 'Wallet operations and balance management' },
      { name: 'Transactions', description: 'Money transfer operations' },
      { name: 'Webhooks', description: 'Webhook subscription management' },
      { name: 'Ledger', description: 'Ledger simulation (testing only)' },
      { name: 'Health', description: 'Health check and monitoring endpoints' },
    ],
    paths: {
      // ==================== AUTH ENDPOINTS ====================
      '/auth/register': {
        post: {
          summary: 'Register a new user',
          description:
            'Creates a new user account with email and password. A wallet is automatically created for the user.',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RegisterRequest' },
                example: {
                  name: 'John Doe',
                  email: 'john@example.com',
                  password: 'SecurePass123!',
                  phone: '+1234567890',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'User registered successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthResponse' },
                },
              },
            },
            '400': {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '409': {
              description: 'User already exists',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '429': { $ref: '#/components/responses/RateLimited' },
          },
        },
      },
      '/auth/login': {
        post: {
          summary: 'Login user',
          description: 'Authenticates a user and returns access and refresh tokens.',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginRequest' },
                example: {
                  email: 'john@example.com',
                  password: 'SecurePass123!',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Login successful',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthResponse' },
                },
              },
            },
            '401': {
              description: 'Invalid credentials',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '429': { $ref: '#/components/responses/RateLimited' },
          },
        },
      },
      '/auth/refresh': {
        post: {
          summary: 'Refresh access token',
          description: 'Uses a refresh token to obtain a new access token.',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RefreshTokenRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Token refreshed successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthResponse' },
                },
              },
            },
            '401': {
              description: 'Invalid or expired refresh token',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/auth/me': {
        get: {
          summary: 'Get current user',
          description: 'Returns the authenticated user profile.',
          tags: ['Auth'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'User profile',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UserResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },

      // ==================== WALLET ENDPOINTS ====================
      '/wallets/me': {
        get: {
          summary: 'Get my wallet',
          description: "Returns the current user's wallet with balance.",
          tags: ['Wallets'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Wallet details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WalletResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': {
              description: 'Wallet not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/wallets/me/history': {
        get: {
          summary: 'Get wallet history',
          description: "Returns the operation history for the current user's wallet.",
          tags: ['Wallets'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'limit',
              in: 'query',
              description: 'Number of records to return',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            '200': {
              description: 'Wallet operation history',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WalletHistoryResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/wallets/me/deposit': {
        post: {
          summary: 'Deposit funds',
          description: "Deposits funds into the current user's wallet. For testing/admin purposes.",
          tags: ['Wallets'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DepositRequest' },
                example: {
                  amount: 1000.0,
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Deposit successful',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WalletResponse' },
                },
              },
            },
            '400': {
              description: 'Invalid amount',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/wallets/{id}/balance': {
        get: {
          summary: 'Get wallet balance',
          description: 'Returns the balance for a specific wallet by ID.',
          tags: ['Wallets'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Wallet ID',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Wallet balance',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BalanceResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': {
              description: 'Not authorized to view this wallet',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '404': {
              description: 'Wallet not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },

      // ==================== TRANSACTION ENDPOINTS ====================
      '/transactions': {
        post: {
          summary: 'Create a transaction',
          description:
            'Initiates a money transfer from the sender to the receiver. Uses saga pattern for reliability.',
          tags: ['Transactions'],
          security: [{ bearerAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateTransactionRequest' },
                example: {
                  receiverId: '507f1f77bcf86cd799439011',
                  amount: 100.5,
                  currency: 'USD',
                  description: 'Payment for services',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Transaction initiated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TransactionResponse' },
                },
              },
            },
            '400': {
              description: 'Validation error or insufficient balance',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimited' },
          },
        },
        get: {
          summary: 'List transactions',
          description: 'Returns a list of transactions for the current user.',
          tags: ['Transactions'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'status',
              in: 'query',
              description: 'Filter by transaction status',
              schema: {
                type: 'string',
                enum: [
                  'INITIATED',
                  'DEBITED',
                  'CREDITED',
                  'COMPLETED',
                  'REFUNDING',
                  'REFUNDED',
                  'FAILED',
                ],
              },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Number of records to return',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'offset',
              in: 'query',
              description: 'Number of records to skip',
              schema: { type: 'integer', minimum: 0, default: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'List of transactions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TransactionListResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/transactions/{id}': {
        get: {
          summary: 'Get transaction by ID',
          description: 'Returns details of a specific transaction.',
          tags: ['Transactions'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Transaction ID',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Transaction details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TransactionResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': {
              description: 'Not authorized to view this transaction',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '404': {
              description: 'Transaction not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },

      // ==================== WEBHOOK ENDPOINTS ====================
      '/webhooks': {
        post: {
          summary: 'Create webhook subscription',
          description:
            'Registers a new webhook to receive event notifications. Only HTTPS URLs are allowed.',
          tags: ['Webhooks'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateWebhookRequest' },
                example: {
                  url: 'https://example.com/webhook',
                  events: ['TRANSACTION_COMPLETED', 'TRANSACTION_FAILED'],
                  secret: 'your-webhook-secret-min-16-chars',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Webhook created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WebhookResponse' },
                },
              },
            },
            '400': {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '409': {
              description: 'Webhook with this URL already exists',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
        get: {
          summary: 'List webhooks',
          description: 'Returns all webhook subscriptions for the current user.',
          tags: ['Webhooks'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'isActive',
              in: 'query',
              description: 'Filter by active status',
              schema: { type: 'boolean' },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', minimum: 0, default: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'List of webhooks',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WebhookListResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/webhooks/{id}': {
        get: {
          summary: 'Get webhook by ID',
          description: 'Returns details of a specific webhook subscription.',
          tags: ['Webhooks'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Webhook details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WebhookResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': {
              description: 'Webhook not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
        patch: {
          summary: 'Update webhook',
          description: 'Updates an existing webhook subscription.',
          tags: ['Webhooks'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateWebhookRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Webhook updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WebhookResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': {
              description: 'Webhook not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
        delete: {
          summary: 'Delete webhook',
          description: 'Deletes a webhook subscription.',
          tags: ['Webhooks'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Webhook deleted',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      message: { type: 'string', example: 'Webhook deleted successfully' },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': {
              description: 'Webhook not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/webhooks/{id}/logs': {
        get: {
          summary: 'Get webhook delivery logs',
          description: 'Returns the delivery history for a specific webhook.',
          tags: ['Webhooks'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'status',
              in: 'query',
              description: 'Filter by delivery status',
              schema: {
                type: 'string',
                enum: ['PENDING', 'SUCCESS', 'FAILED', 'RETRYING'],
              },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'offset',
              in: 'query',
              schema: { type: 'integer', minimum: 0, default: 0 },
            },
          ],
          responses: {
            '200': {
              description: 'Webhook delivery logs',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WebhookLogsResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': {
              description: 'Webhook not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },

      // ==================== LEDGER SIMULATION ENDPOINTS ====================
      '/ledger/simulation': {
        get: {
          summary: 'Get simulation config',
          description:
            'Returns the current ledger simulation configuration. For testing purposes only.',
          tags: ['Ledger'],
          responses: {
            '200': {
              description: 'Simulation configuration',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SimulationConfigResponse' },
                },
              },
            },
          },
        },
        post: {
          summary: 'Update simulation config',
          description: 'Updates the ledger simulation configuration. For testing purposes only.',
          tags: ['Ledger'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SimulationConfigRequest' },
                example: {
                  enabled: true,
                  failureRate: 0.1,
                  failureType: 'ERROR',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Configuration updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SimulationConfigResponse' },
                },
              },
            },
          },
        },
      },
      '/ledger/simulation/fail-transactions': {
        post: {
          summary: 'Add failing transactions',
          description: 'Adds specific transaction IDs to the fail list.',
          tags: ['Ledger'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    transactionIds: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Transactions added to fail list',
            },
          },
        },
      },
      '/ledger/simulation/reset': {
        post: {
          summary: 'Reset simulation',
          description: 'Resets all simulation state to defaults.',
          tags: ['Ledger'],
          responses: {
            '200': {
              description: 'Simulation reset',
            },
          },
        },
      },

      // ==================== HEALTH ENDPOINTS ====================
      '/health': {
        get: {
          summary: 'Health check',
          description:
            'Returns the overall health status of the service including database and event bus connectivity.',
          tags: ['Health'],
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
            '503': {
              description: 'Service is unhealthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
          },
        },
      },
      '/health/live': {
        get: {
          summary: 'Liveness probe',
          description: 'Kubernetes liveness probe. Returns 200 if the process is running.',
          tags: ['Health'],
          responses: {
            '200': {
              description: 'Service is alive',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'alive' },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/health/ready': {
        get: {
          summary: 'Readiness probe',
          description:
            'Kubernetes readiness probe. Returns 200 if the service is ready to accept traffic.',
          tags: ['Health'],
          responses: {
            '200': {
              description: 'Service is ready',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ready' },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
            '503': {
              description: 'Service is not ready',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'not ready' },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/metrics': {
        get: {
          summary: 'Prometheus metrics',
          description: 'Returns metrics in Prometheus text format for monitoring.',
          tags: ['Health'],
          responses: {
            '200': {
              description: 'Prometheus format metrics',
              content: {
                'text/plain': {
                  schema: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },

    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /auth/login',
        },
      },
      parameters: {
        IdempotencyKey: {
          name: 'X-Idempotency-Key',
          in: 'header',
          description:
            'Unique key to prevent duplicate requests. Alphanumeric with dashes/underscores, max 64 chars.',
          schema: { type: 'string', maxLength: 64, pattern: '^[a-zA-Z0-9_-]+$' },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Unauthorized - Invalid or missing token',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                error: {
                  code: 1001,
                  message: 'Unauthorized',
                  timestamp: '2024-01-15T10:30:00.000Z',
                  correlationId: 'abc123',
                },
              },
            },
          },
        },
        RateLimited: {
          description: 'Too many requests',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                error: {
                  code: 4001,
                  message: 'Too many requests, please try again later',
                  timestamp: '2024-01-15T10:30:00.000Z',
                },
              },
            },
          },
        },
      },
      schemas: {
        // ==================== AUTH SCHEMAS ====================
        RegisterRequest: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: {
              type: 'string',
              minLength: 2,
              maxLength: 100,
              description: 'Full name of the user',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Email address (must be unique)',
            },
            password: {
              type: 'string',
              minLength: 8,
              description: 'Password (min 8 chars, must contain uppercase, lowercase, and number)',
            },
            phone: {
              type: 'string',
              pattern: '^[+]?[\\d\\s-]{10,15}$',
              description: 'Phone number (optional)',
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        RefreshTokenRequest: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string', description: 'Refresh token from login' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: { $ref: '#/components/schemas/User' },
                token: { type: 'string', description: 'JWT access token' },
                refreshToken: { type: 'string', description: 'Refresh token' },
              },
            },
          },
        },
        UserResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { $ref: '#/components/schemas/User' },
          },
        },

        // ==================== WALLET SCHEMAS ====================
        Wallet: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            balance: { type: 'number', format: 'double' },
            currency: { type: 'string', default: 'USD' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        WalletResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { $ref: '#/components/schemas/Wallet' },
          },
        },
        BalanceResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                balance: { type: 'number', format: 'double' },
                currency: { type: 'string' },
              },
            },
          },
        },
        DepositRequest: {
          type: 'object',
          required: ['amount'],
          properties: {
            amount: {
              type: 'number',
              format: 'double',
              minimum: 0.01,
              description: 'Amount to deposit (max 2 decimal places)',
            },
            idempotencyKey: {
              type: 'string',
              maxLength: 64,
              description: 'Optional idempotency key',
            },
          },
        },
        WalletHistoryResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                operations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      type: { type: 'string', enum: ['DEPOSIT', 'DEBIT', 'CREDIT', 'REFUND'] },
                      amount: { type: 'number' },
                      balanceAfter: { type: 'number' },
                      transactionId: { type: 'string' },
                      createdAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },

        // ==================== TRANSACTION SCHEMAS ====================
        CreateTransactionRequest: {
          type: 'object',
          required: ['receiverId', 'amount'],
          properties: {
            receiverId: {
              type: 'string',
              description: 'ID of the receiver user',
            },
            amount: {
              type: 'number',
              format: 'double',
              minimum: 0.01,
              description: 'Amount to transfer (max 2 decimal places)',
            },
            currency: {
              type: 'string',
              minLength: 3,
              maxLength: 3,
              default: 'USD',
              description: '3-letter currency code',
            },
            description: {
              type: 'string',
              maxLength: 255,
              description: 'Transaction description',
            },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            transactionId: { type: 'string', description: 'Unique transaction identifier' },
            senderId: { type: 'string' },
            receiverId: { type: 'string' },
            senderWalletId: { type: 'string' },
            receiverWalletId: { type: 'string' },
            amount: { type: 'number', format: 'double' },
            currency: { type: 'string' },
            status: {
              type: 'string',
              enum: [
                'INITIATED',
                'DEBITED',
                'CREDITED',
                'COMPLETED',
                'REFUNDING',
                'REFUNDED',
                'FAILED',
              ],
              description: 'Current transaction status',
            },
            description: { type: 'string' },
            failureReason: { type: 'string', description: 'Reason for failure (if failed)' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        TransactionResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { $ref: '#/components/schemas/Transaction' },
          },
        },
        TransactionListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                transactions: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Transaction' },
                },
                pagination: { $ref: '#/components/schemas/Pagination' },
              },
            },
          },
        },

        // ==================== WEBHOOK SCHEMAS ====================
        CreateWebhookRequest: {
          type: 'object',
          required: ['url', 'events'],
          properties: {
            url: {
              type: 'string',
              format: 'uri',
              description: 'HTTPS URL to receive webhook events',
            },
            events: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'string',
                enum: [
                  'TRANSACTION_INITIATED',
                  'TRANSACTION_COMPLETED',
                  'TRANSACTION_FAILED',
                  'DEBIT_SUCCESS',
                  'DEBIT_FAILED',
                  'CREDIT_SUCCESS',
                  'CREDIT_FAILED',
                  'REFUND_REQUESTED',
                  'REFUND_COMPLETED',
                  'REFUND_FAILED',
                ],
              },
              description: 'Events to subscribe to',
            },
            secret: {
              type: 'string',
              minLength: 16,
              description: 'Secret for webhook signature verification (min 16 chars)',
            },
          },
        },
        UpdateWebhookRequest: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            events: {
              type: 'array',
              items: { type: 'string' },
            },
            isActive: { type: 'boolean' },
          },
        },
        Webhook: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            url: { type: 'string' },
            events: {
              type: 'array',
              items: { type: 'string' },
            },
            isActive: { type: 'boolean' },
            failureCount: { type: 'integer' },
            lastDeliveryAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        WebhookResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { $ref: '#/components/schemas/Webhook' },
          },
        },
        WebhookListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                webhooks: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Webhook' },
                },
                pagination: { $ref: '#/components/schemas/Pagination' },
              },
            },
          },
        },
        WebhookDeliveryLog: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            webhookId: { type: 'string' },
            eventType: { type: 'string' },
            status: {
              type: 'string',
              enum: ['PENDING', 'SUCCESS', 'FAILED', 'RETRYING'],
            },
            httpStatus: { type: 'integer' },
            attempts: { type: 'integer' },
            lastAttemptAt: { type: 'string', format: 'date-time' },
            nextRetryAt: { type: 'string', format: 'date-time' },
            error: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        WebhookLogsResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                logs: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/WebhookDeliveryLog' },
                },
                pagination: { $ref: '#/components/schemas/Pagination' },
              },
            },
          },
        },

        // ==================== LEDGER SCHEMAS ====================
        SimulationConfigRequest: {
          type: 'object',
          required: ['enabled'],
          properties: {
            enabled: { type: 'boolean', description: 'Enable/disable simulation mode' },
            failureRate: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Rate of random failures (0-1)',
            },
            failTransactionIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific transaction IDs to fail',
            },
            failureType: {
              type: 'string',
              enum: ['ERROR', 'TIMEOUT'],
              description: 'Type of simulated failure',
            },
          },
        },
        SimulationConfigResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                failureRate: { type: 'number' },
                failTransactionIds: {
                  type: 'array',
                  items: { type: 'string' },
                },
                failureType: { type: 'string' },
              },
            },
          },
        },

        // ==================== HEALTH SCHEMAS ====================
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'unhealthy'] },
            timestamp: { type: 'string', format: 'date-time' },
            services: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    connected: { type: 'boolean' },
                    readyState: { type: 'integer' },
                  },
                },
                eventBus: {
                  type: 'object',
                  properties: {
                    connected: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },

        // ==================== COMMON SCHEMAS ====================
        Pagination: {
          type: 'object',
          properties: {
            limit: { type: 'integer', example: 20 },
            offset: { type: 'integer', example: 0 },
            total: { type: 'integer', example: 100 },
            hasMore: { type: 'boolean' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'integer',
                  description:
                    'Error code (1xxx=auth, 2xxx=validation, 3xxx=business, 4xxx=rate limit, 5xxx=system)',
                },
                message: { type: 'string' },
                details: {
                  type: 'object',
                  description: 'Validation error details',
                  additionalProperties: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
                timestamp: { type: 'string', format: 'date-time' },
                correlationId: { type: 'string' },
              },
            },
          },
        },
      },
    },

    security: [{ bearerAuth: [] }],
  };
};
