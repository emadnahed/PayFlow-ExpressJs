/**
 * Unit Tests: log-context utilities
 *
 * Tests AsyncLocalStorage-based context: getCorrelationId, getLogContext,
 * addLogContext, and runWithContext.
 */

// ── Import ────────────────────────────────────────────────────────────────────

import {
  asyncLocalStorage,
  getCorrelationId,
  getLogContext,
  addLogContext,
  runWithContext,
  LogContext,
} from '../../../src/observability/log-context';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('log-context utilities', () => {

  // ── getCorrelationId ───────────────────────────────────────────────────────

  describe('getCorrelationId', () => {
    it('should return undefined when called outside async context', () => {
      expect(getCorrelationId()).toBeUndefined();
    });

    it('should return the correlationId from the current async context', () => {
      const context: LogContext = { correlationId: 'test-corr-123' };
      let result: string | undefined;

      asyncLocalStorage.run(context, () => {
        result = getCorrelationId();
      });

      expect(result).toBe('test-corr-123');
    });
  });

  // ── getLogContext ──────────────────────────────────────────────────────────

  describe('getLogContext', () => {
    it('should return undefined when called outside async context', () => {
      expect(getLogContext()).toBeUndefined();
    });

    it('should return the full log context when inside async context', () => {
      const context: LogContext = {
        correlationId: 'corr-456',
        userId: 'user_1',
        transactionId: 'txn_1',
      };
      let result: LogContext | undefined;

      asyncLocalStorage.run(context, () => {
        result = getLogContext();
      });

      expect(result).toEqual(context);
    });
  });

  // ── addLogContext ──────────────────────────────────────────────────────────

  describe('addLogContext', () => {
    it('should be a no-op when called outside async context', () => {
      // Should not throw
      expect(() => addLogContext({ userId: 'u1' })).not.toThrow();
    });

    it('should merge additional fields into the current context', () => {
      const context: LogContext = { correlationId: 'corr-789' };

      asyncLocalStorage.run(context, () => {
        addLogContext({ userId: 'user_2', transactionId: 'txn_2' });

        const store = asyncLocalStorage.getStore();
        expect(store?.userId).toBe('user_2');
        expect(store?.transactionId).toBe('txn_2');
        expect(store?.correlationId).toBe('corr-789'); // preserved
      });
    });

    it('should overwrite existing field if added again', () => {
      const context: LogContext = { correlationId: 'corr-old' };

      asyncLocalStorage.run(context, () => {
        addLogContext({ correlationId: 'corr-new' });
        expect(getCorrelationId()).toBe('corr-new');
      });
    });
  });

  // ── runWithContext ─────────────────────────────────────────────────────────

  describe('runWithContext', () => {
    it('should run a function with the provided context', () => {
      const context: LogContext = { correlationId: 'run-corr-1', userId: 'u99' };
      let capturedCorrelationId: string | undefined;

      runWithContext(context, () => {
        capturedCorrelationId = getCorrelationId();
      });

      expect(capturedCorrelationId).toBe('run-corr-1');
    });

    it('should return the value returned by the function', () => {
      const context: LogContext = { correlationId: 'test' };
      const result = runWithContext(context, () => 42);
      expect(result).toBe(42);
    });

    it('should make getLogContext return the full context inside fn', () => {
      const context: LogContext = { correlationId: 'run-corr-2', userId: 'u100' };
      let capturedContext: LogContext | undefined;

      runWithContext(context, () => {
        capturedContext = getLogContext();
      });

      expect(capturedContext).toEqual(context);
    });

    it('should isolate context to within the run boundary', () => {
      const context: LogContext = { correlationId: 'inner' };
      runWithContext(context, () => {
        expect(getCorrelationId()).toBe('inner');
      });

      // Outside the run, context is gone
      expect(getCorrelationId()).toBeUndefined();
    });
  });

  // ── asyncLocalStorage ─────────────────────────────────────────────────────

  describe('asyncLocalStorage instance', () => {
    it('should be exported as a valid AsyncLocalStorage instance', () => {
      expect(asyncLocalStorage).toBeDefined();
      expect(typeof asyncLocalStorage.run).toBe('function');
      expect(typeof asyncLocalStorage.getStore).toBe('function');
    });

    it('should return undefined store outside of run', () => {
      expect(asyncLocalStorage.getStore()).toBeUndefined();
    });
  });
});
