/**
 * Unit tests for Transaction State Machine
 *
 * Tests the pure functions that manage transaction state transitions.
 * No mocking required as these are pure functions.
 */

import {
  isValidTransition,
  validateTransition,
  isTerminalState,
  getAllowedTransitions,
} from '../../../src/services/transaction/transaction.state';
import { TransactionStatus } from '../../../src/types/events';
import { ApiError } from '../../../src/middlewares/errorHandler';

describe('Transaction State Machine', () => {
  describe('isValidTransition', () => {
    describe('from INITIATED state', () => {
      it('should allow transition to DEBITED', () => {
        expect(isValidTransition(TransactionStatus.INITIATED, TransactionStatus.DEBITED)).toBe(
          true
        );
      });

      it('should allow transition to FAILED', () => {
        expect(isValidTransition(TransactionStatus.INITIATED, TransactionStatus.FAILED)).toBe(true);
      });

      it('should not allow transition to COMPLETED', () => {
        expect(isValidTransition(TransactionStatus.INITIATED, TransactionStatus.COMPLETED)).toBe(
          false
        );
      });

      it('should not allow transition to REFUNDING', () => {
        expect(isValidTransition(TransactionStatus.INITIATED, TransactionStatus.REFUNDING)).toBe(
          false
        );
      });

      it('should not allow transition to CREDITED', () => {
        expect(isValidTransition(TransactionStatus.INITIATED, TransactionStatus.CREDITED)).toBe(
          false
        );
      });
    });

    describe('from DEBITED state', () => {
      it('should allow transition to COMPLETED', () => {
        expect(isValidTransition(TransactionStatus.DEBITED, TransactionStatus.COMPLETED)).toBe(
          true
        );
      });

      it('should allow transition to REFUNDING', () => {
        expect(isValidTransition(TransactionStatus.DEBITED, TransactionStatus.REFUNDING)).toBe(
          true
        );
      });

      it('should not allow transition to INITIATED', () => {
        expect(isValidTransition(TransactionStatus.DEBITED, TransactionStatus.INITIATED)).toBe(
          false
        );
      });

      it('should not allow transition to FAILED directly', () => {
        expect(isValidTransition(TransactionStatus.DEBITED, TransactionStatus.FAILED)).toBe(false);
      });
    });

    describe('from REFUNDING state', () => {
      it('should allow transition to FAILED', () => {
        expect(isValidTransition(TransactionStatus.REFUNDING, TransactionStatus.FAILED)).toBe(true);
      });

      it('should not allow transition to COMPLETED', () => {
        expect(isValidTransition(TransactionStatus.REFUNDING, TransactionStatus.COMPLETED)).toBe(
          false
        );
      });

      it('should not allow transition back to DEBITED', () => {
        expect(isValidTransition(TransactionStatus.REFUNDING, TransactionStatus.DEBITED)).toBe(
          false
        );
      });
    });

    describe('from CREDITED state (legacy)', () => {
      it('should allow transition to COMPLETED', () => {
        expect(isValidTransition(TransactionStatus.CREDITED, TransactionStatus.COMPLETED)).toBe(
          true
        );
      });

      it('should not allow transition to FAILED', () => {
        expect(isValidTransition(TransactionStatus.CREDITED, TransactionStatus.FAILED)).toBe(false);
      });
    });

    describe('from terminal states', () => {
      it('should not allow any transition from COMPLETED', () => {
        expect(isValidTransition(TransactionStatus.COMPLETED, TransactionStatus.FAILED)).toBe(
          false
        );
        expect(isValidTransition(TransactionStatus.COMPLETED, TransactionStatus.INITIATED)).toBe(
          false
        );
        expect(isValidTransition(TransactionStatus.COMPLETED, TransactionStatus.REFUNDING)).toBe(
          false
        );
      });

      it('should not allow any transition from FAILED', () => {
        expect(isValidTransition(TransactionStatus.FAILED, TransactionStatus.COMPLETED)).toBe(
          false
        );
        expect(isValidTransition(TransactionStatus.FAILED, TransactionStatus.INITIATED)).toBe(
          false
        );
        expect(isValidTransition(TransactionStatus.FAILED, TransactionStatus.REFUNDING)).toBe(
          false
        );
      });

      it('should not allow any transition from REFUNDED (legacy)', () => {
        expect(isValidTransition(TransactionStatus.REFUNDED, TransactionStatus.COMPLETED)).toBe(
          false
        );
        expect(isValidTransition(TransactionStatus.REFUNDED, TransactionStatus.FAILED)).toBe(false);
      });
    });
  });

  describe('validateTransition', () => {
    const testTransactionId = 'txn_test_123';

    it('should not throw for valid transitions', () => {
      expect(() =>
        validateTransition(
          TransactionStatus.INITIATED,
          TransactionStatus.DEBITED,
          testTransactionId
        )
      ).not.toThrow();
    });

    it('should throw ApiError for invalid transitions', () => {
      expect(() =>
        validateTransition(
          TransactionStatus.INITIATED,
          TransactionStatus.COMPLETED,
          testTransactionId
        )
      ).toThrow(ApiError);
    });

    it('should include status names in error message', () => {
      try {
        validateTransition(
          TransactionStatus.INITIATED,
          TransactionStatus.COMPLETED,
          testTransactionId
        );
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toContain('INITIATED');
        expect((error as ApiError).message).toContain('COMPLETED');
      }
    });

    it('should include transaction ID in error message', () => {
      try {
        validateTransition(
          TransactionStatus.INITIATED,
          TransactionStatus.COMPLETED,
          testTransactionId
        );
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toContain(testTransactionId);
      }
    });

    it('should throw 400 status code for invalid transitions', () => {
      try {
        validateTransition(
          TransactionStatus.COMPLETED,
          TransactionStatus.FAILED,
          testTransactionId
        );
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).statusCode).toBe(400);
      }
    });
  });

  describe('isTerminalState', () => {
    it('should return true for COMPLETED', () => {
      expect(isTerminalState(TransactionStatus.COMPLETED)).toBe(true);
    });

    it('should return true for FAILED', () => {
      expect(isTerminalState(TransactionStatus.FAILED)).toBe(true);
    });

    it('should return true for REFUNDED (legacy)', () => {
      expect(isTerminalState(TransactionStatus.REFUNDED)).toBe(true);
    });

    it('should return false for INITIATED', () => {
      expect(isTerminalState(TransactionStatus.INITIATED)).toBe(false);
    });

    it('should return false for DEBITED', () => {
      expect(isTerminalState(TransactionStatus.DEBITED)).toBe(false);
    });

    it('should return false for REFUNDING', () => {
      expect(isTerminalState(TransactionStatus.REFUNDING)).toBe(false);
    });

    it('should return false for CREDITED (legacy)', () => {
      expect(isTerminalState(TransactionStatus.CREDITED)).toBe(false);
    });
  });

  describe('getAllowedTransitions', () => {
    it('should return [DEBITED, FAILED] for INITIATED', () => {
      const allowed = getAllowedTransitions(TransactionStatus.INITIATED);
      expect(allowed).toContain(TransactionStatus.DEBITED);
      expect(allowed).toContain(TransactionStatus.FAILED);
      expect(allowed).toHaveLength(2);
    });

    it('should return [COMPLETED, REFUNDING] for DEBITED', () => {
      const allowed = getAllowedTransitions(TransactionStatus.DEBITED);
      expect(allowed).toContain(TransactionStatus.COMPLETED);
      expect(allowed).toContain(TransactionStatus.REFUNDING);
      expect(allowed).toHaveLength(2);
    });

    it('should return [FAILED] for REFUNDING', () => {
      const allowed = getAllowedTransitions(TransactionStatus.REFUNDING);
      expect(allowed).toContain(TransactionStatus.FAILED);
      expect(allowed).toHaveLength(1);
    });

    it('should return [COMPLETED] for CREDITED (legacy)', () => {
      const allowed = getAllowedTransitions(TransactionStatus.CREDITED);
      expect(allowed).toContain(TransactionStatus.COMPLETED);
      expect(allowed).toHaveLength(1);
    });

    it('should return empty array for COMPLETED', () => {
      const allowed = getAllowedTransitions(TransactionStatus.COMPLETED);
      expect(allowed).toHaveLength(0);
    });

    it('should return empty array for FAILED', () => {
      const allowed = getAllowedTransitions(TransactionStatus.FAILED);
      expect(allowed).toHaveLength(0);
    });

    it('should return empty array for REFUNDED (legacy)', () => {
      const allowed = getAllowedTransitions(TransactionStatus.REFUNDED);
      expect(allowed).toHaveLength(0);
    });
  });

  describe('State Machine Consistency', () => {
    it('should have terminal states with no outgoing transitions', () => {
      const terminalStates = [
        TransactionStatus.COMPLETED,
        TransactionStatus.FAILED,
        TransactionStatus.REFUNDED,
      ];

      for (const state of terminalStates) {
        expect(isTerminalState(state)).toBe(true);
        expect(getAllowedTransitions(state)).toHaveLength(0);
      }
    });

    it('should have non-terminal states with at least one outgoing transition', () => {
      const nonTerminalStates = [
        TransactionStatus.INITIATED,
        TransactionStatus.DEBITED,
        TransactionStatus.REFUNDING,
        TransactionStatus.CREDITED,
      ];

      for (const state of nonTerminalStates) {
        expect(isTerminalState(state)).toBe(false);
        expect(getAllowedTransitions(state).length).toBeGreaterThan(0);
      }
    });

    it('should ensure happy path reaches COMPLETED', () => {
      // INITIATED -> DEBITED -> COMPLETED
      expect(isValidTransition(TransactionStatus.INITIATED, TransactionStatus.DEBITED)).toBe(true);
      expect(isValidTransition(TransactionStatus.DEBITED, TransactionStatus.COMPLETED)).toBe(true);
    });

    it('should ensure compensation path reaches FAILED', () => {
      // INITIATED -> DEBITED -> REFUNDING -> FAILED
      expect(isValidTransition(TransactionStatus.INITIATED, TransactionStatus.DEBITED)).toBe(true);
      expect(isValidTransition(TransactionStatus.DEBITED, TransactionStatus.REFUNDING)).toBe(true);
      expect(isValidTransition(TransactionStatus.REFUNDING, TransactionStatus.FAILED)).toBe(true);
    });

    it('should ensure early failure path reaches FAILED', () => {
      // INITIATED -> FAILED (debit fails)
      expect(isValidTransition(TransactionStatus.INITIATED, TransactionStatus.FAILED)).toBe(true);
    });
  });
});
