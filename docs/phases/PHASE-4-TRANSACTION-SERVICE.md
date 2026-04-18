# Phase 4: Transaction Service (Saga Orchestrator)

## Status: Pending

## Goals
- Initiate and coordinate money transfers
- Manage transaction state machine
- Drive the Saga flow via events
- Handle failures and trigger compensation

---

## Implementation

### Module Structure
```
src/services/transaction/
├── transaction.service.ts      # Saga coordinator
├── transaction.controller.ts   # HTTP handlers
├── transaction.routes.ts       # API routes
├── transaction.events.ts       # Event handlers
├── transaction.state.ts        # State machine
└── transaction.validation.ts   # Input validation
```

---

## State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
INITIATED ────► DEBITED ────► CREDITED ────► COMPLETED   │
                    │              │                      │
                    │              │ (credit fails)       │
                    │              ▼                      │
                    │         REFUNDING ──────────────────┘
                    │              │
                    │              ▼
                    └────────► FAILED
                (debit fails)
```

### State Transitions
```typescript
const validTransitions = {
  INITIATED: ['DEBITED', 'FAILED'],
  DEBITED: ['CREDITED', 'REFUNDING'],
  CREDITED: ['COMPLETED'],
  REFUNDING: ['FAILED'],
  COMPLETED: [],  // Terminal
  FAILED: []      // Terminal
};
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/transactions` | Yes | Initiate transfer |
| GET | `/transactions/:id` | Yes | Get transaction status |
| GET | `/transactions` | Yes | List user's transactions |

### Create Transaction Request
```typescript
interface CreateTransactionDTO {
  receiverId: string;
  amount: number;
  currency?: string;      // Default: INR
  description?: string;
}
```

### Transaction Response
```typescript
interface TransactionResponse {
  transactionId: string;
  senderId: string;
  receiverId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  initiatedAt: Date;
  completedAt?: Date;
  failureReason?: string;
}
```

---

## Saga Event Flow

### 1. Initiate Transaction
```typescript
// API: POST /transactions
async function initiateTransaction(senderId: string, dto: CreateTransactionDTO) {
  // Create transaction record
  const txn = await Transaction.create({
    transactionId: generateTxnId(),
    senderId,
    receiverId: dto.receiverId,
    amount: dto.amount,
    status: TransactionStatus.INITIATED
  });

  // Publish event to start Saga
  await eventBus.publish({
    eventType: EventType.TRANSACTION_INITIATED,
    transactionId: txn.transactionId,
    payload: { senderId, receiverId: dto.receiverId, amount: dto.amount }
  });

  return txn;
}
```

### 2. Handle Debit Result
```typescript
// Subscribe: DEBIT_SUCCESS
async function onDebitSuccess(event: DebitSuccessEvent) {
  await Transaction.findOneAndUpdate(
    { transactionId: event.transactionId },
    { status: TransactionStatus.DEBITED }
  );

  // Request credit to receiver (Ledger will handle)
  // Event continues the Saga...
}

// Subscribe: DEBIT_FAILED
async function onDebitFailed(event: DebitFailedEvent) {
  await Transaction.findOneAndUpdate(
    { transactionId: event.transactionId },
    {
      status: TransactionStatus.FAILED,
      failureReason: event.payload.reason
    }
  );

  await eventBus.publish({
    eventType: EventType.TRANSACTION_FAILED,
    transactionId: event.transactionId,
    payload: { reason: event.payload.reason, refunded: false }
  });
}
```

### 3. Handle Credit Result
```typescript
// Subscribe: CREDIT_SUCCESS
async function onCreditSuccess(event: CreditSuccessEvent) {
  await Transaction.findOneAndUpdate(
    { transactionId: event.transactionId },
    {
      status: TransactionStatus.COMPLETED,
      completedAt: new Date()
    }
  );

  await eventBus.publish({
    eventType: EventType.TRANSACTION_COMPLETED,
    transactionId: event.transactionId,
    payload: { ... }
  });
}

// Subscribe: CREDIT_FAILED
async function onCreditFailed(event: CreditFailedEvent) {
  await Transaction.findOneAndUpdate(
    { transactionId: event.transactionId },
    { status: TransactionStatus.REFUNDING }
  );

  // Trigger compensation
  await eventBus.publish({
    eventType: EventType.REFUND_REQUESTED,
    transactionId: event.transactionId,
    payload: { senderId, amount, reason: event.payload.reason }
  });
}
```

### 4. Handle Refund Completion
```typescript
// Subscribe: REFUND_COMPLETED
async function onRefundCompleted(event: RefundCompletedEvent) {
  await Transaction.findOneAndUpdate(
    { transactionId: event.transactionId },
    {
      status: TransactionStatus.FAILED,
      failureReason: 'Credit failed, refunded'
    }
  );

  await eventBus.publish({
    eventType: EventType.TRANSACTION_FAILED,
    transactionId: event.transactionId,
    payload: { reason: 'Credit failed', refunded: true }
  });
}
```

---

## E2E Tests Required

1. **Happy Path**
   - Create transaction → DEBITED → CREDITED → COMPLETED
   - Status endpoint returns correct state at each step

2. **Debit Failure**
   - Insufficient balance → FAILED (no refund needed)

3. **Credit Failure + Refund**
   - Debit succeeds → Credit fails → Refund → FAILED
   - Sender balance restored

4. **Concurrent Transfers**
   - Multiple transfers from same sender
   - Balance consistency maintained

5. **Query Operations**
   - List transactions by user
   - Filter by status
   - Pagination

---

## Files to Create

- `src/services/transaction/transaction.service.ts`
- `src/services/transaction/transaction.controller.ts`
- `src/services/transaction/transaction.routes.ts`
- `src/services/transaction/transaction.events.ts`
- `src/services/transaction/transaction.state.ts`
- `src/services/transaction/transaction.validation.ts`
- `tests/e2e/transaction.test.ts`
- `tests/e2e/saga-flow.test.ts`

---

## Success Criteria
- [ ] Transactions can be created
- [ ] State machine enforces valid transitions
- [ ] Saga completes successfully (happy path)
- [ ] Compensation works on credit failure
- [ ] All states queryable via API
- [ ] All E2E tests pass

---

## Previous Phase
← [Phase 3: Wallet Service](./PHASE-3-WALLET-SERVICE.md)

## Next Phase
→ [Phase 5: Ledger Service](./PHASE-5-LEDGER-SERVICE.md)
