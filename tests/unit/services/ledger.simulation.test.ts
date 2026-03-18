/**
 * Unit Tests: LedgerSimulation
 *
 * Tests enable/disable/shouldFail/simulateFailure/addFailingTransactionIds/reset.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../../src/config', () => ({
  config: { isTest: true, isDevelopment: false, isProduction: false },
}));

// ── Import ────────────────────────────────────────────────────────────────────

// The module exports a singleton; we import both and reset() between tests.
import { SimulatedFailureError, ledgerSimulation } from '../../../src/services/ledger/ledger.simulation';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LedgerSimulation (unit)', () => {
  beforeEach(() => {
    ledgerSimulation.reset();
  });

  // ── getConfig ─────────────────────────────────────────────────────────────

  describe('getConfig', () => {
    it('should return default config after reset', () => {
      const cfg = ledgerSimulation.getConfig();
      expect(cfg.enabled).toBe(false);
      expect(cfg.failureRate).toBe(0);
      expect(cfg.failTransactionIds).toEqual([]);
      expect(cfg.failureType).toBe('ERROR');
    });
  });

  // ── enable / disable ──────────────────────────────────────────────────────

  describe('enable / disable', () => {
    it('should enable simulation with provided config', () => {
      ledgerSimulation.enable({ failureRate: 0.5, failureType: 'ERROR' });

      const cfg = ledgerSimulation.getConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.failureRate).toBe(0.5);
    });

    it('should disable simulation and clear failTransactionIds', () => {
      ledgerSimulation.enable({ failTransactionIds: new Set(['txn_1']) });
      ledgerSimulation.disable();

      const cfg = ledgerSimulation.getConfig();
      expect(cfg.enabled).toBe(false);
      expect(cfg.failTransactionIds).toEqual([]);
    });
  });

  // ── shouldFail ────────────────────────────────────────────────────────────

  describe('shouldFail', () => {
    it('should return false when simulation is disabled', () => {
      expect(ledgerSimulation.shouldFail('txn_1')).toBe(false);
    });

    it('should return true for a specific failing transaction ID', () => {
      ledgerSimulation.enable({ failTransactionIds: new Set(['txn_fail']) });
      expect(ledgerSimulation.shouldFail('txn_fail')).toBe(true);
    });

    it('should return false for transactions not in the fail list', () => {
      ledgerSimulation.enable({ failTransactionIds: new Set(['txn_fail']) });
      expect(ledgerSimulation.shouldFail('txn_ok')).toBe(false);
    });

    it('should return true for 100% failure rate', () => {
      ledgerSimulation.enable({ failureRate: 1 });
      expect(ledgerSimulation.shouldFail('any_txn')).toBe(true);
    });

    it('should return false for 0% failure rate (no specific ID)', () => {
      ledgerSimulation.enable({ failureRate: 0 });
      expect(ledgerSimulation.shouldFail('any_txn')).toBe(false);
    });
  });

  // ── simulateFailure ───────────────────────────────────────────────────────

  describe('simulateFailure', () => {
    it('should resolve without error when simulation disabled', async () => {
      await expect(ledgerSimulation.simulateFailure('txn_1')).resolves.toBeUndefined();
    });

    it('should throw SimulatedFailureError for a failing transaction', async () => {
      ledgerSimulation.enable({ failTransactionIds: new Set(['txn_fail']) });
      await expect(ledgerSimulation.simulateFailure('txn_fail')).rejects.toThrow(
        SimulatedFailureError
      );
    });

    it('should resolve without error for a non-failing transaction', async () => {
      ledgerSimulation.enable({ failTransactionIds: new Set(['txn_fail']) });
      await expect(ledgerSimulation.simulateFailure('txn_ok')).resolves.toBeUndefined();
    });

    it('should throw SimulatedFailureError even for TIMEOUT type after delay', async () => {
      jest.useFakeTimers();
      ledgerSimulation.enable({
        failTransactionIds: new Set(['txn_timeout']),
        failureType: 'TIMEOUT',
      });

      const promise = ledgerSimulation.simulateFailure('txn_timeout');

      // Advance timers past the 30 second timeout
      jest.advanceTimersByTime(31000);

      await expect(promise).rejects.toThrow(SimulatedFailureError);
      jest.useRealTimers();
    });
  });

  // ── addFailingTransactionIds ──────────────────────────────────────────────

  describe('addFailingTransactionIds', () => {
    it('should add transaction IDs to the failing set', () => {
      ledgerSimulation.enable();
      ledgerSimulation.addFailingTransactionIds(['txn_1', 'txn_2']);
      const cfg = ledgerSimulation.getConfig();
      expect(cfg.failTransactionIds).toContain('txn_1');
      expect(cfg.failTransactionIds).toContain('txn_2');
    });
  });

  // ── removeFailingTransactionIds ───────────────────────────────────────────

  describe('removeFailingTransactionIds', () => {
    it('should remove specific transaction IDs from the failing set', () => {
      ledgerSimulation.enable({ failTransactionIds: new Set(['txn_1', 'txn_2', 'txn_3']) });
      ledgerSimulation.removeFailingTransactionIds(['txn_1', 'txn_2']);
      const cfg = ledgerSimulation.getConfig();
      expect(cfg.failTransactionIds).not.toContain('txn_1');
      expect(cfg.failTransactionIds).not.toContain('txn_2');
      expect(cfg.failTransactionIds).toContain('txn_3');
    });

    it('should be a no-op when removing IDs not in the set', () => {
      ledgerSimulation.enable({ failTransactionIds: new Set(['txn_a']) });
      expect(() => ledgerSimulation.removeFailingTransactionIds(['txn_missing'])).not.toThrow();
      expect(ledgerSimulation.getConfig().failTransactionIds).toContain('txn_a');
    });
  });

  // ── clearFailingTransactionIds ────────────────────────────────────────────

  describe('clearFailingTransactionIds', () => {
    it('should clear all failing transaction IDs', () => {
      ledgerSimulation.enable({ failTransactionIds: new Set(['txn_1', 'txn_2']) });
      ledgerSimulation.clearFailingTransactionIds();
      expect(ledgerSimulation.getConfig().failTransactionIds).toEqual([]);
    });

    it('should keep simulation enabled after clearing IDs', () => {
      ledgerSimulation.enable({ failTransactionIds: new Set(['txn_1']) });
      ledgerSimulation.clearFailingTransactionIds();
      expect(ledgerSimulation.getConfig().enabled).toBe(true);
    });
  });

  // ── reset ─────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('should restore all defaults', () => {
      ledgerSimulation.enable({ failureRate: 0.9, failTransactionIds: new Set(['txn_x']) });
      ledgerSimulation.reset();

      const cfg = ledgerSimulation.getConfig();
      expect(cfg.enabled).toBe(false);
      expect(cfg.failureRate).toBe(0);
      expect(cfg.failTransactionIds).toEqual([]);
    });
  });

  // ── production guard ──────────────────────────────────────────────────────

  describe('production environment guard', () => {
    it('should be a no-op in production (enable is blocked)', async () => {
      jest.resetModules();
      jest.doMock('../../../src/config', () => ({
        config: { isTest: false, isDevelopment: false, isProduction: true },
      }));
      jest.doMock('../../../src/observability', () => ({
        logger: { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() },
      }));

      const { ledgerSimulation: prodSim } = await import(
        '../../../src/services/ledger/ledger.simulation'
      );

      // enable() should be blocked in production
      prodSim.enable({ failureRate: 1 });
      expect(prodSim.getConfig().enabled).toBe(false);
    });

    it('should be a no-op in production (addFailingTransactionIds is blocked)', async () => {
      jest.resetModules();
      jest.doMock('../../../src/config', () => ({
        config: { isTest: false, isDevelopment: false, isProduction: true },
      }));
      jest.doMock('../../../src/observability', () => ({
        logger: { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() },
      }));

      const { ledgerSimulation: prodSim } = await import(
        '../../../src/services/ledger/ledger.simulation'
      );

      // addFailingTransactionIds() should be a no-op in production
      prodSim.addFailingTransactionIds(['txn_prod']);
      expect(prodSim.getConfig().failTransactionIds).toEqual([]);
    });
  });
});
