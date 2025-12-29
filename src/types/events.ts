export enum EventType {
  // Transaction lifecycle
  TRANSACTION_INITIATED = 'TRANSACTION_INITIATED',
  TRANSACTION_COMPLETED = 'TRANSACTION_COMPLETED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',

  // Debit operations
  DEBIT_SUCCESS = 'DEBIT_SUCCESS',
  DEBIT_FAILED = 'DEBIT_FAILED',

  // Credit operations
  CREDIT_SUCCESS = 'CREDIT_SUCCESS',
  CREDIT_FAILED = 'CREDIT_FAILED',

  // Refund operations
  REFUND_REQUESTED = 'REFUND_REQUESTED',
  REFUND_COMPLETED = 'REFUND_COMPLETED',
  REFUND_FAILED = 'REFUND_FAILED',
}

export enum TransactionStatus {
  INITIATED = 'INITIATED',
  DEBITED = 'DEBITED',
  CREDITED = 'CREDITED',
  COMPLETED = 'COMPLETED',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

export interface BaseEvent {
  eventType: EventType;
  transactionId: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

export interface TransactionInitiatedEvent extends BaseEvent {
  eventType: EventType.TRANSACTION_INITIATED;
  payload: {
    senderId: string;
    receiverId: string;
    amount: number;
    currency: string;
  };
}

export interface DebitSuccessEvent extends BaseEvent {
  eventType: EventType.DEBIT_SUCCESS;
  payload: {
    senderId: string;
    amount: number;
    newBalance: number;
  };
}

export interface DebitFailedEvent extends BaseEvent {
  eventType: EventType.DEBIT_FAILED;
  payload: {
    senderId: string;
    amount: number;
    reason: string;
  };
}

export interface CreditSuccessEvent extends BaseEvent {
  eventType: EventType.CREDIT_SUCCESS;
  payload: {
    receiverId: string;
    amount: number;
    newBalance: number;
  };
}

export interface CreditFailedEvent extends BaseEvent {
  eventType: EventType.CREDIT_FAILED;
  payload: {
    receiverId: string;
    amount: number;
    reason: string;
  };
}

export interface RefundRequestedEvent extends BaseEvent {
  eventType: EventType.REFUND_REQUESTED;
  payload: {
    senderId: string;
    amount: number;
    reason: string;
  };
}

export interface RefundCompletedEvent extends BaseEvent {
  eventType: EventType.REFUND_COMPLETED;
  payload: {
    senderId: string;
    amount: number;
    newBalance: number;
  };
}

export interface RefundFailedEvent extends BaseEvent {
  eventType: EventType.REFUND_FAILED;
  payload: {
    senderId: string;
    amount: number;
    reason: string;
  };
}

export interface TransactionCompletedEvent extends BaseEvent {
  eventType: EventType.TRANSACTION_COMPLETED;
  payload: {
    senderId: string;
    receiverId: string;
    amount: number;
    currency: string;
  };
}

export interface TransactionFailedEvent extends BaseEvent {
  eventType: EventType.TRANSACTION_FAILED;
  payload: {
    reason: string;
    refunded: boolean;
  };
}

export type PayFlowEvent =
  | TransactionInitiatedEvent
  | DebitSuccessEvent
  | DebitFailedEvent
  | CreditSuccessEvent
  | CreditFailedEvent
  | RefundRequestedEvent
  | RefundCompletedEvent
  | RefundFailedEvent
  | TransactionCompletedEvent
  | TransactionFailedEvent;

export type EventHandler<T extends BaseEvent = BaseEvent> = (event: T) => Promise<void>;
