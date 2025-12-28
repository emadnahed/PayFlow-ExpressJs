# 💸 PayFlow  
### Event-Driven UPI-Like Transaction System (Express.js + Saga)

PayFlow is a **production-inspired, event-driven backend system** that simulates **UPI-style money transfers** using **Express.js** and the **Saga pattern**.

It demonstrates how **real payment systems ensure money safety**, handle failures gracefully, and scale using **events instead of tight service coupling**.

> Core guarantee: **Money is never lost, duplicated, or partially moved — even during failures.**

---

## 🚀 Why This Project Matters

Payment systems are fundamentally different from CRUD applications:

- Partial success is unacceptable  
- Failures must be reversible  
- Distributed databases cannot rely on ACID transactions  
- External consumers need reliable status updates  

PayFlow models how **modern fintech backends** solve these problems using **event-driven architecture + Saga choreography**.

---

## 🧠 Key Engineering Concepts Demonstrated

- Event-driven service communication  
- Saga pattern (choreography)  
- Compensating transactions (refunds)  
- Transaction state machines  
- Idempotent, failure-tolerant workflows  
- Clear internal vs external system boundaries  

---

## 🏗️ High-Level Architecture

```
Client / Merchant App
        ↓
API Gateway (Express)
        ↓
Event Bus (Redis Pub/Sub)
        ↓
------------------------------------------------
| Transaction Service (Saga initiator)         |
| Wallet Service (Debit / Refund)              |
| Ledger Service (Credit receiver)             |
| Notification Service                         |
| Webhook Dispatcher (Outbound callbacks)      |
------------------------------------------------
```

---

## 🧩 Services & Responsibilities

### 🧾 Transaction Service
- Starts money transfers
- Maintains transaction state
- Decides final success or failure
- Drives the Saga via events

### 💰 Wallet Service
- Manages user balances
- Debits sender
- Refunds sender during compensation

### 🏦 Ledger Service
- Credits receiver wallet
- Can simulate failures for testing rollback logic

### 📩 Notification Service
- Sends non-critical alerts

### 🔔 Webhook Dispatcher
- Sends transaction status updates to external clients
- Mimics real payment gateway callbacks

---

## 🔁 Saga Flow (UPI-Style Money Transfer)

1. Transaction initiated → `TRANSACTION_INITIATED`
2. Sender debited → `DEBIT_SUCCESS / DEBIT_FAILED`
3. Receiver credited → `CREDIT_SUCCESS / CREDIT_FAILED`
4. Finalize transaction → `TRANSACTION_COMPLETED`
5. Compensation on failure → `REFUND_COMPLETED`

Money safety is guaranteed at every step.

---

## 🔄 Transaction State Machine

```
INITIATED → DEBITED → CREDITED → COMPLETED
```
Failure:
```
DEBITED → REFUNDED → FAILED
```

---

## 📣 Event Naming Convention

```
TRANSACTION_INITIATED
DEBIT_SUCCESS
DEBIT_FAILED
CREDIT_SUCCESS
CREDIT_FAILED
REFUND_REQUESTED
REFUND_COMPLETED
TRANSACTION_COMPLETED
TRANSACTION_FAILED
```

---

## 🔔 Webhooks (Outbound)

External systems receive final transaction updates via secure webhooks.

Example payload:
```json
{
  "event": "TRANSACTION_COMPLETED",
  "transactionId": "txn_847293",
  "status": "SUCCESS",
  "amount": 500,
  "currency": "INR"
}
```

---

## 🛠️ Tech Stack

- Express.js (TypeScript)
- Redis Pub/Sub
- MongoDB / PostgreSQL
- JWT Authentication
- BullMQ (optional)
- Docker & Docker Compose

---

## 🎯 What Recruiters See

- Distributed systems maturity  
- Real payment-flow modeling  
- Saga-based consistency  
- Event-driven architecture  
- Webhook-based integrations  

---

## 🏁 Final Note

PayFlow demonstrates **how real payment systems are designed**, not just how APIs are written.