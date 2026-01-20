# PayFlow API Reference

## Base URL

- Development: `http://localhost:3000`
- Production: `https://api.payflow.com`

## Authentication

PayFlow uses JWT (JSON Web Token) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

## Rate Limiting

| Endpoint Category | Limit |
|-------------------|-------|
| Global | 100 requests / 15 minutes |
| Auth (login/register) | 5 attempts / 15 minutes |
| Transactions | 10 / minute per user |

## Idempotency

Use the `X-Idempotency-Key` header for POST/PUT/PATCH requests to prevent duplicate processing:

```
X-Idempotency-Key: unique-request-id-123
```

- Keys must be alphanumeric with dashes/underscores
- Maximum length: 64 characters
- Keys are cached for 24 hours

## Error Codes

| Range | Category | Examples |
|-------|----------|----------|
| 1xxx | Authentication | 1001: Unauthorized, 1002: Token expired, 1005: Forbidden |
| 2xxx | Validation | 2001: Invalid input, 2002: Missing field, 2003: Invalid format |
| 3xxx | Business Logic | 3001: Insufficient balance, 3002: User not found, 3006: Duplicate |
| 4xxx | Rate Limiting | 4001: Too many requests |
| 5xxx | System | 5001: Internal error |

### Complete Error Code Reference

| Code | Name | HTTP Status |
|------|------|-------------|
| 1001 | UNAUTHORIZED | 401 |
| 1002 | TOKEN_EXPIRED | 401 |
| 1003 | INVALID_TOKEN | 401 |
| 1004 | TOKEN_REVOKED | 401 |
| 1005 | FORBIDDEN | 403 |
| 2001 | VALIDATION_ERROR | 400 |
| 2002 | MISSING_FIELD | 400 |
| 2003 | INVALID_INPUT | 400 |
| 3001 | INSUFFICIENT_BALANCE | 400 |
| 3002 | USER_NOT_FOUND | 404 |
| 3003 | WALLET_NOT_FOUND | 404 |
| 3004 | TRANSACTION_NOT_FOUND | 404 |
| 3005 | INVALID_TRANSACTION_STATE | 400 |
| 3006 | DUPLICATE_RESOURCE | 409 |
| 3007 | SELF_TRANSFER | 400 |
| 4001 | RATE_LIMITED | 429 |
| 5001 | INTERNAL_ERROR | 500 |

---

## Authentication Endpoints

### POST /auth/register

Register a new user account.

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "phone": "+1234567890"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "userId": "user_507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "isEmailVerified": false
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

### POST /auth/login

Authenticate and receive tokens.

**Request:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "userId": "user_507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "isEmailVerified": false
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

### POST /auth/refresh

Refresh an expired access token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### GET /auth/me

Get current authenticated user profile.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Wallet Endpoints

### GET /wallets/me

Get current user's wallet.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "wallet": {
      "walletId": "wal_507f1f77bcf86cd799439012",
      "userId": "user_507f1f77bcf86cd799439011",
      "balance": 1500.50,
      "currency": "USD",
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T12:45:00.000Z"
    }
  }
}
```

### POST /wallets/me/deposit

Deposit funds into wallet.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "amount": 1000.00,
  "idempotencyKey": "deposit_unique_key_123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Deposit successful",
    "newBalance": 2500.50,
    "operationId": "op_507f1f77bcf86cd799439013",
    "idempotent": false
  }
}
```

**Note:** If the same `idempotencyKey` is used again, `idempotent: true` and `message: "Deposit already processed"`.

### GET /wallets/me/history

Get wallet operation history.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `limit` (optional): Number of records (1-100, default: 20)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "operations": [
      {
        "id": "507f1f77bcf86cd799439020",
        "type": "DEBIT",
        "amount": 100.00,
        "balanceAfter": 1400.50,
        "transactionId": "txn_abc123",
        "createdAt": "2024-01-15T14:30:00.000Z"
      }
    ]
  }
}
```

### GET /wallets/{id}/balance

Get balance for a specific wallet.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "balance": 1500.50,
    "currency": "USD"
  }
}
```

---

## Transaction Endpoints

### POST /transactions

Create a new money transfer.

**Headers:**
- `Authorization: Bearer <token>`
- `X-Idempotency-Key: unique-key` (recommended)

**Request:**
```json
{
  "receiverId": "507f1f77bcf86cd799439013",
  "amount": 100.50,
  "currency": "USD",
  "description": "Payment for services"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "transactionId": "txn_1705322400_abc123",
      "senderId": "user_507f1f77bcf86cd799439011",
      "receiverId": "user_507f1f77bcf86cd799439013",
      "amount": 100.50,
      "currency": "USD",
      "status": "INITIATED",
      "description": "Payment for services",
      "createdAt": "2024-01-15T14:30:00.000Z"
    }
  }
}
```

### GET /transactions

List user's transactions.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `status` (optional): INITIATED, DEBITED, CREDITED, COMPLETED, REFUNDING, REFUNDED, FAILED
- `limit` (optional): 1-100 (default: 20)
- `offset` (optional): default 0

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transactions": [...],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 45,
      "hasMore": true
    }
  }
}
```

### GET /transactions/{id}

Get transaction details.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "507f1f77bcf86cd799439030",
    "transactionId": "txn_1705322400_abc123",
    "senderId": "507f1f77bcf86cd799439011",
    "receiverId": "507f1f77bcf86cd799439013",
    "amount": 100.50,
    "currency": "USD",
    "status": "COMPLETED",
    "description": "Payment for services",
    "createdAt": "2024-01-15T14:30:00.000Z",
    "updatedAt": "2024-01-15T14:30:05.000Z"
  }
}
```

### Transaction States

```
INITIATED → DEBITED → CREDITED → COMPLETED
                ↓           ↓
            REFUNDING ← ←  ←
                ↓
            REFUNDED / FAILED
```

---

## Webhook Endpoints

### POST /webhooks

Create a webhook subscription.

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "url": "https://example.com/webhook",
  "events": ["TRANSACTION_COMPLETED", "TRANSACTION_FAILED"],
  "secret": "your-webhook-secret-min-16-chars"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "webhook": {
      "webhookId": "whk_507f1f77bcf86cd799439040",
      "url": "https://example.com/webhook",
      "events": ["TRANSACTION_COMPLETED", "TRANSACTION_FAILED"],
      "secret": "your-webhook-secret-min-16-chars",
      "isActive": true,
      "failureCount": 0,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Note:** The `secret` is only returned on webhook creation for security.

### GET /webhooks

List all webhooks.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `isActive` (optional): boolean
- `limit` (optional): 1-100
- `offset` (optional): default 0

### GET /webhooks/{id}

Get webhook details.

### PATCH /webhooks/{id}

Update a webhook.

**Request:**
```json
{
  "events": ["TRANSACTION_COMPLETED"],
  "isActive": false
}
```

### DELETE /webhooks/{id}

Delete a webhook subscription.

### GET /webhooks/{id}/logs

Get delivery logs for a webhook.

**Query Parameters:**
- `status` (optional): PENDING, SUCCESS, FAILED, RETRYING
- `limit` (optional): 1-100
- `offset` (optional): default 0

### Webhook Events

| Event | Description |
|-------|-------------|
| TRANSACTION_INITIATED | Transaction created |
| TRANSACTION_COMPLETED | Transaction successfully completed |
| TRANSACTION_FAILED | Transaction failed |
| DEBIT_SUCCESS | Sender wallet debited |
| DEBIT_FAILED | Debit operation failed |
| CREDIT_SUCCESS | Receiver wallet credited |
| CREDIT_FAILED | Credit operation failed |
| REFUND_REQUESTED | Refund initiated |
| REFUND_COMPLETED | Refund successful |
| REFUND_FAILED | Refund failed |

### Webhook Payload

```json
{
  "event": "TRANSACTION_COMPLETED",
  "timestamp": "2024-01-15T14:30:05.000Z",
  "data": {
    "transactionId": "txn_1705322400_abc123",
    "senderId": "507f1f77bcf86cd799439011",
    "receiverId": "507f1f77bcf86cd799439013",
    "amount": 100.50,
    "status": "COMPLETED"
  }
}
```

### Webhook Signature

Verify webhook authenticity using HMAC-SHA256:

```javascript
const crypto = require('crypto');

const signature = req.headers['x-webhook-signature'];
const timestamp = req.headers['x-webhook-timestamp'];
const payload = JSON.stringify(req.body);

const expected = crypto
  .createHmac('sha256', webhookSecret)
  .update(`${timestamp}.${payload}`)
  .digest('hex');

const isValid = crypto.timingSafeEqual(
  Buffer.from(signature),
  Buffer.from(expected)
);
```

---

## Ledger Simulation Endpoints (Test/Dev Only)

These endpoints are only available in `test` and `development` environments.

### GET /ledger/simulation

Get current simulation configuration.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "simulation": {
      "enabled": false,
      "failureRate": 0,
      "failTransactionIds": [],
      "failureType": "ERROR"
    }
  }
}
```

### POST /ledger/simulation

Enable or disable failure simulation.

**Request (Enable):**
```json
{
  "enabled": true,
  "failureRate": 0.5,
  "failureType": "ERROR"
}
```

**Request (Disable):**
```json
{
  "enabled": false
}
```

### POST /ledger/simulation/fail-transactions

Add specific transaction IDs to fail.

**Request:**
```json
{
  "transactionIds": ["txn_abc123", "txn_def456"]
}
```

### POST /ledger/simulation/reset

Reset simulation to default state.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "simulation": {
      "enabled": false,
      "failureRate": 0,
      "failTransactionIds": [],
      "failureType": "ERROR"
    }
  }
}
```

---

## Health Endpoints

### GET /health

Full health check with dependency status.

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T14:30:00.000Z",
  "services": {
    "database": {
      "connected": true,
      "readyState": 1
    },
    "eventBus": {
      "connected": true
    }
  }
}
```

### GET /health/live

Kubernetes liveness probe.

**Response (200):**
```json
{
  "status": "alive",
  "timestamp": "2024-01-15T14:30:00.000Z"
}
```

### GET /health/ready

Kubernetes readiness probe.

**Response (200):**
```json
{
  "status": "ready",
  "timestamp": "2024-01-15T14:30:00.000Z"
}
```

### GET /metrics

Prometheus metrics endpoint.

**Response (200):** `text/plain`

```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/health",status="200"} 1234

# HELP transaction_duration_seconds Transaction processing time
# TYPE transaction_duration_seconds histogram
transaction_duration_seconds_bucket{le="0.1"} 100
...
```

---

## Error Response Format

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": 3001,
    "message": "Insufficient balance",
    "details": {
      "required": 100.50,
      "available": 50.00
    },
    "timestamp": "2024-01-15T14:30:00.000Z",
    "correlationId": "req_abc123def456"
  }
}
```

---

## Interactive Documentation

Access the interactive API documentation at:

- **Scalar API Reference:** `http://localhost:3000/api-docs`
- **OpenAPI JSON Spec:** `http://localhost:3000/api-docs.json`
