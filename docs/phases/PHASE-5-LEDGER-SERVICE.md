# Phase 5: Ledger Service & Compensation

## Status: Pending

## Goals
- Credit receiver wallet via events
- Simulate failures for testing rollback logic
- Complete the Saga compensation flow

---

## Implementation

### Module Structure
```
src/services/ledger/
├── ledger.service.ts       # Credit logic
├── ledger.events.ts        # Event handlers
└── ledger.simulation.ts    # Failure injection for testing
```

---

## Why a Separate Ledger Service?

In real payment systems:
- **Wallet Service** = manages sender's money (debits, refunds)
- **Ledger Service** = manages receiver's money (credits)

This separation allows:
- Independent scaling
- Different failure domains
- Clearer audit trails
- Testing compensation logic

---

## Event Handling

### Events Subscribed
```typescript
// Listen for successful debit (triggers credit)
eventBus.subscribe(EventType.DEBIT_SUCCESS, handleCreditRequest);
```

### Credit Flow
```typescript
async function handleCreditRequest(event: DebitSuccessEvent) {
  const { transactionId, payload } = event;
  const { receiverId, amount } = getTransactionDetails(transactionId);

  try {
    // Check for simulated failure
    if (shouldSimulateFailure(transactionId)) {
      throw new SimulatedFailureError('Credit simulation failure');
    }

    // Credit receiver wallet
    const result = await walletService.credit(receiverId, amount, transactionId);

    // Publish success
    await eventBus.publish({
      eventType: EventType.CREDIT_SUCCESS,
      transactionId,
      payload: { receiverId, amount, newBalance: result.newBalance }
    });

  } catch (error) {
    // Publish failure (triggers refund)
    await eventBus.publish({
      eventType: EventType.CREDIT_FAILED,
      transactionId,
      payload: { receiverId, amount, reason: error.message }
    });
  }
}
```

---

## Failure Simulation

### Configuration
```typescript
interface FailureSimulation {
  enabled: boolean;
  failureRate: number;          // 0-1, percentage of failures
  failTransactionIds: string[]; // Specific txns to fail
  failureType: 'ERROR' | 'TIMEOUT';
}
```

### Environment Variables
```bash
# .env
LEDGER_SIMULATE_FAILURES=false
LEDGER_FAILURE_RATE=0.1
```

### API for Testing
```typescript
// Toggle failure simulation (test environment only)
POST /ledger/simulation
{
  "enabled": true,
  "failureRate": 0.5,
  "failTransactionIds": ["txn_123", "txn_456"]
}
```

---

## Compensation Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    CREDIT FAILURE COMPENSATION               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Ledger: Credit fails                                    │
│     └──► Publish CREDIT_FAILED                              │
│                                                              │
│  2. Transaction Service: Receives CREDIT_FAILED             │
│     └──► Update status to REFUNDING                         │
│     └──► Publish REFUND_REQUESTED                           │
│                                                              │
│  3. Wallet Service: Receives REFUND_REQUESTED               │
│     └──► Refund sender (credit back)                        │
│     └──► Publish REFUND_COMPLETED                           │
│                                                              │
│  4. Transaction Service: Receives REFUND_COMPLETED          │
│     └──► Update status to FAILED                            │
│     └──► Publish TRANSACTION_FAILED                         │
│                                                              │
│  5. Notification/Webhook: Notify sender of failure          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Money Safety Guarantees

| Scenario | Before Saga | After Saga | Net Effect |
|----------|-------------|------------|------------|
| Success | A: 100, B: 50 | A: 90, B: 60 | Transfer complete |
| Debit Fail | A: 100, B: 50 | A: 100, B: 50 | No change |
| Credit Fail | A: 100, B: 50 | A: 100, B: 50 | Refunded |

**Core Guarantee**: Money is never lost, duplicated, or partially moved.

---

## E2E Tests Required

1. **Credit Success Path**
   - DEBIT_SUCCESS triggers credit
   - CREDIT_SUCCESS published
   - Receiver balance increased

2. **Credit Failure Path**
   - Enable failure simulation
   - Credit fails → CREDIT_FAILED
   - Refund triggered → REFUND_COMPLETED
   - Sender balance restored

3. **Failure Simulation**
   - Toggle simulation on/off
   - Specific transaction ID failures
   - Failure rate works correctly

4. **Idempotency**
   - Duplicate DEBIT_SUCCESS doesn't double-credit

---

## Files to Create

- `src/services/ledger/ledger.service.ts`
- `src/services/ledger/ledger.events.ts`
- `src/services/ledger/ledger.simulation.ts`
- `tests/e2e/ledger.test.ts`
- `tests/e2e/compensation.test.ts`

---

## Success Criteria
- [ ] Credit succeeds on DEBIT_SUCCESS
- [ ] Credit failure triggers refund
- [ ] Sender balance restored after refund
- [ ] Failure simulation works
- [ ] Money never lost or duplicated
- [ ] All E2E tests pass

---

## Previous Phase
← [Phase 4: Transaction Service](./PHASE-4-TRANSACTION-SERVICE.md)

## Next Phase
→ [Phase 6: Notifications & Webhooks](./PHASE-6-WEBHOOKS.md)
