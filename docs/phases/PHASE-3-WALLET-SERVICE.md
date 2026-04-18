# Phase 3: Wallet Service

## Status: Pending

## Goals
- Core money operations (debit/credit)
- Balance management with atomic updates
- Idempotency for safe retries
- Event publishing for Saga coordination

---

## Implementation

### Module Structure
```
src/services/wallet/
├── wallet.service.ts       # Business logic
├── wallet.controller.ts    # HTTP handlers
├── wallet.routes.ts        # API routes
├── wallet.events.ts        # Event handlers
└── wallet.validation.ts    # Input validation
```

---

## Core Operations

### Service Interface
```typescript
interface WalletService {
  getWallet(userId: string): Promise<IWallet>;
  getBalance(userId: string): Promise<number>;

  // Saga operations (called via events)
  debit(userId: string, amount: number, txnId: string): Promise<DebitResult>;
  credit(userId: string, amount: number, txnId: string): Promise<CreditResult>;
  refund(userId: string, amount: number, txnId: string): Promise<RefundResult>;

  // Testing/admin
  deposit(userId: string, amount: number): Promise<IWallet>;
}
```

### Operation Results
```typescript
interface OperationResult {
  success: boolean;
  newBalance: number;
  operationId: string;
  idempotent: boolean;  // true if this was a replay
}
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/wallets/me` | Yes | Get user's wallet |
| GET | `/wallets/:id/balance` | Yes | Get wallet balance |
| POST | `/wallets/me/deposit` | Yes | Add funds (testing) |

---

## Idempotency Implementation

### Operation Log Model
```typescript
interface IWalletOperation {
  operationId: string;      // txnId + operation type
  walletId: string;
  type: 'DEBIT' | 'CREDIT' | 'REFUND';
  amount: number;
  resultBalance: number;
  createdAt: Date;
}
```

### Idempotency Logic
```typescript
async function debit(userId: string, amount: number, txnId: string) {
  const operationId = `${txnId}:DEBIT`;

  // Check for existing operation
  const existing = await WalletOperation.findOne({ operationId });
  if (existing) {
    return { success: true, newBalance: existing.resultBalance, idempotent: true };
  }

  // Perform atomic debit
  const wallet = await Wallet.findOneAndUpdate(
    { userId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true }
  );

  if (!wallet) {
    throw new InsufficientBalanceError();
  }

  // Log operation
  await WalletOperation.create({ operationId, walletId: wallet.walletId, ... });

  return { success: true, newBalance: wallet.balance, idempotent: false };
}
```

---

## Event Handling

### Events Published
```typescript
// On successful debit
eventBus.publish({
  eventType: EventType.DEBIT_SUCCESS,
  transactionId: txnId,
  payload: { senderId, amount, newBalance }
});

// On failed debit
eventBus.publish({
  eventType: EventType.DEBIT_FAILED,
  transactionId: txnId,
  payload: { senderId, amount, reason: 'INSUFFICIENT_BALANCE' }
});
```

### Events Subscribed
```typescript
// Listen for transaction initiation
eventBus.subscribe(EventType.TRANSACTION_INITIATED, handleDebitRequest);

// Listen for refund requests
eventBus.subscribe(EventType.REFUND_REQUESTED, handleRefund);
```

---

## E2E Tests Required

1. **Balance Operations**
   - Get wallet returns correct balance
   - Deposit increases balance
   - Concurrent deposits handled correctly

2. **Debit Operations**
   - Successful debit reduces balance
   - Insufficient balance returns error
   - Idempotent debit returns cached result

3. **Credit Operations**
   - Successful credit increases balance
   - Idempotent credit returns cached result

4. **Refund Operations**
   - Refund restores balance
   - Idempotent refund returns cached result

5. **Event Integration**
   - DEBIT_SUCCESS published on success
   - DEBIT_FAILED published on failure

---

## Files to Create

- `src/services/wallet/wallet.service.ts`
- `src/services/wallet/wallet.controller.ts`
- `src/services/wallet/wallet.routes.ts`
- `src/services/wallet/wallet.events.ts`
- `src/services/wallet/wallet.validation.ts`
- `src/models/WalletOperation.ts`
- `tests/e2e/wallet.test.ts`

---

## Success Criteria
- [ ] Wallet balance can be read
- [ ] Deposits work correctly
- [ ] Debit/credit are atomic
- [ ] Operations are idempotent
- [ ] Events published correctly
- [ ] All E2E tests pass

---

## Previous Phase
← [Phase 2: Authentication](./PHASE-2-AUTHENTICATION.md)

## Next Phase
→ [Phase 4: Transaction Service](./PHASE-4-TRANSACTION-SERVICE.md)
