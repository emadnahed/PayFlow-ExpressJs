import { TransactionStatus } from '../../types/events';
import { ApiError } from '../../middlewares/errorHandler';

/**
 * Valid state transitions for the Transaction Saga
 *
 * State Machine:
 * INITIATED ────► DEBITED ────► CREDITED ────► COMPLETED
 *                    │              │
 *                    │              │ (credit fails)
 *                    │              ▼
 *                    │         REFUNDING ──────────────────┐
 *                    │              │                      │
 *                    │              ▼                      │
 *                    └────────► FAILED ◄──────────────────┘
 *                (debit fails)
 */
const validTransitions: Record<TransactionStatus, TransactionStatus[]> = {
  [TransactionStatus.INITIATED]: [TransactionStatus.DEBITED, TransactionStatus.FAILED],
  [TransactionStatus.DEBITED]: [TransactionStatus.CREDITED, TransactionStatus.REFUNDING],
  [TransactionStatus.CREDITED]: [TransactionStatus.COMPLETED],
  [TransactionStatus.REFUNDING]: [TransactionStatus.FAILED],
  [TransactionStatus.REFUNDED]: [], // Terminal state (legacy)
  [TransactionStatus.COMPLETED]: [], // Terminal state
  [TransactionStatus.FAILED]: [],    // Terminal state
};

/**
 * Check if a state transition is valid
 */
export function isValidTransition(
  currentStatus: TransactionStatus,
  newStatus: TransactionStatus
): boolean {
  const allowedTransitions = validTransitions[currentStatus];
  return allowedTransitions.includes(newStatus);
}

/**
 * Validate and perform state transition
 * Throws ApiError if transition is invalid
 */
export function validateTransition(
  currentStatus: TransactionStatus,
  newStatus: TransactionStatus,
  transactionId: string
): void {
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new ApiError(
      400,
      `Invalid state transition from ${currentStatus} to ${newStatus} for transaction ${transactionId}`
    );
  }
}

/**
 * Check if a transaction is in a terminal state
 */
export function isTerminalState(status: TransactionStatus): boolean {
  return validTransitions[status].length === 0;
}

/**
 * Get allowed next states for a given status
 */
export function getAllowedTransitions(status: TransactionStatus): TransactionStatus[] {
  return validTransitions[status];
}
