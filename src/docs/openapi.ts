/**
 * OpenAPI Specification Generator
 *
 * Generates OpenAPI 3.0.3 specification for the PayFlow API.
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

- **User Authentication**: JWT-based authentication with secure password hashing
- **Wallet Management**: Create and manage digital wallets
- **Transactions**: Send money between wallets with saga-based orchestration
- **Ledger**: Complete transaction history with double-entry bookkeeping
- **Webhooks**: Event notifications for transaction status changes
- **Observability**: Full metrics and tracing support

## Rate Limiting

- Global: 100 requests / 15 minutes
- Auth endpoints: 5 attempts / 15 minutes
- Transactions: 10 / minute per user

## Idempotency

Use the \`X-Idempotency-Key\` header for POST/PUT/PATCH requests to prevent duplicate processing.
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
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Wallets', description: 'Wallet management' },
      { name: 'Transactions', description: 'Money transfer operations' },
      { name: 'Ledger', description: 'Transaction history' },
      { name: 'Webhooks', description: 'Webhook management' },
      { name: 'Health', description: 'Health check endpoints' },
    ],
    paths: {
      '/auth/register': {
        post: {
          summary: 'Register new user',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RegisterRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'User created successfully',
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
          },
        },
      },
      '/auth/login': {
        post: {
          summary: 'Login user',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginRequest' },
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
            '429': {
              description: 'Too many login attempts',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/wallets': {
        post: {
          summary: 'Create a new wallet',
          tags: ['Wallets'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateWalletRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Wallet created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WalletResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '409': {
              description: 'Wallet already exists for user',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
        get: {
          summary: 'Get current user wallet',
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
      '/wallets/{walletId}': {
        get: {
          summary: 'Get wallet by ID',
          tags: ['Wallets'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'walletId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
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
      '/transactions': {
        post: {
          summary: 'Create a new transaction',
          tags: ['Transactions'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'X-Idempotency-Key',
              in: 'header',
              description: 'Unique key to prevent duplicate transactions',
              schema: { type: 'string', maxLength: 64 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateTransactionRequest' },
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
            '429': {
              description: 'Too many transactions',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
        get: {
          summary: 'List transactions',
          tags: ['Transactions'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 20, maximum: 100 },
            },
            {
              name: 'status',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'],
              },
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
      '/transactions/{transactionId}': {
        get: {
          summary: 'Get transaction by ID',
          tags: ['Transactions'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'transactionId',
              in: 'path',
              required: true,
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
      '/ledger': {
        get: {
          summary: 'Get ledger entries',
          tags: ['Ledger'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 20, maximum: 100 },
            },
          ],
          responses: {
            '200': {
              description: 'Ledger entries',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LedgerListResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/webhooks': {
        post: {
          summary: 'Register a webhook',
          tags: ['Webhooks'],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateWebhookRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Webhook registered',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WebhookResponse' },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
        get: {
          summary: 'List webhooks',
          tags: ['Webhooks'],
          security: [{ bearerAuth: [] }],
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
      '/health': {
        get: {
          summary: 'Health check',
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
          },
        },
      },
      '/health/live': {
        get: {
          summary: 'Liveness probe',
          tags: ['Health'],
          responses: {
            '200': {
              description: 'Service is alive',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
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
          description: 'JWT token obtained from login',
        },
      },
      responses: {
        Unauthorized: {
          description: 'Unauthorized - Invalid or missing token',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
      schemas: {
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password', 'name'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', minLength: 8, example: 'SecurePass123!' },
            name: { type: 'string', example: 'John Doe' },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            password: { type: 'string', example: 'SecurePass123!' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    name: { type: 'string' },
                  },
                },
                token: { type: 'string' },
              },
            },
          },
        },
        CreateWalletRequest: {
          type: 'object',
          properties: {
            initialBalance: { type: 'number', minimum: 0, default: 0 },
          },
        },
        WalletResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                balance: { type: 'number' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        CreateTransactionRequest: {
          type: 'object',
          required: ['receiverWalletId', 'amount'],
          properties: {
            receiverWalletId: { type: 'string' },
            amount: { type: 'number', minimum: 0.01, example: 100.5 },
            description: { type: 'string', example: 'Payment for services' },
          },
        },
        TransactionResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                transactionId: { type: 'string' },
                senderWalletId: { type: 'string' },
                receiverWalletId: { type: 'string' },
                amount: { type: 'number' },
                status: {
                  type: 'string',
                  enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'],
                },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
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
                  items: { $ref: '#/components/schemas/TransactionResponse/properties/data' },
                },
                pagination: { $ref: '#/components/schemas/Pagination' },
              },
            },
          },
        },
        LedgerListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                entries: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      transactionId: { type: 'string' },
                      walletId: { type: 'string' },
                      type: { type: 'string', enum: ['DEBIT', 'CREDIT'] },
                      amount: { type: 'number' },
                      balanceAfter: { type: 'number' },
                      createdAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
                pagination: { $ref: '#/components/schemas/Pagination' },
              },
            },
          },
        },
        CreateWebhookRequest: {
          type: 'object',
          required: ['url', 'events'],
          properties: {
            url: { type: 'string', format: 'uri', example: 'https://example.com/webhook' },
            events: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['TRANSACTION_COMPLETED', 'TRANSACTION_FAILED', 'TRANSACTION_REFUNDED'],
              },
            },
            secret: { type: 'string', description: 'Optional secret for webhook signing' },
          },
        },
        WebhookResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                url: { type: 'string' },
                events: { type: 'array', items: { type: 'string' } },
                isActive: { type: 'boolean' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
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
                  items: { $ref: '#/components/schemas/WebhookResponse/properties/data' },
                },
              },
            },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'healthy' },
            version: { type: 'string', example: '1.0.0' },
            uptime: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 100 },
            totalPages: { type: 'integer', example: 5 },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'integer', example: 2001 },
                message: { type: 'string', example: 'Validation error' },
                details: {
                  type: 'object',
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
