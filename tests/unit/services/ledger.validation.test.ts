/**
 * Unit tests for Ledger Validation
 *
 * Tests the express-validator chains for ledger simulation endpoints.
 */

import { validationResult } from 'express-validator';
import { Request, Response } from 'express';
import { simulationConfigValidation } from '../../../src/services/ledger/ledger.validation';

// Helper to run validation and get errors
const runBodyValidation = async (validations: any[], body: Record<string, any>) => {
  const req = {
    body,
    params: {},
    query: {},
  } as unknown as Request;

  for (const validation of validations) {
    await validation.run(req);
  }

  return validationResult(req);
};

describe('Ledger Validation', () => {
  describe('simulationConfigValidation', () => {
    describe('enabled field', () => {
      it('should pass with enabled as true', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
        });
        const errors = result.array().filter((e: any) => e.path === 'enabled');
        expect(errors).toHaveLength(0);
      });

      it('should pass with enabled as false', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: false,
        });
        const errors = result.array().filter((e: any) => e.path === 'enabled');
        expect(errors).toHaveLength(0);
      });

      it('should fail when enabled is missing', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {});
        const errors = result.array().filter((e: any) => e.path === 'enabled');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when enabled is an invalid string', async () => {
        // Note: express-validator isBoolean() coerces 'true'/'false' strings to booleans
        // Only non-boolean strings should fail
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: 'yes',
        });
        const errors = result.array().filter((e: any) => e.path === 'enabled');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('enabled must be a boolean');
      });

      it('should fail when enabled is null', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: null,
        });
        const errors = result.array().filter((e: any) => e.path === 'enabled');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('failureRate field (optional)', () => {
      it('should pass when failureRate is not provided', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
        });
        const errors = result.array().filter((e: any) => e.path === 'failureRate');
        expect(errors).toHaveLength(0);
      });

      it('should pass with failureRate of 0', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureRate: 0,
        });
        const errors = result.array().filter((e: any) => e.path === 'failureRate');
        expect(errors).toHaveLength(0);
      });

      it('should pass with failureRate of 1', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureRate: 1,
        });
        const errors = result.array().filter((e: any) => e.path === 'failureRate');
        expect(errors).toHaveLength(0);
      });

      it('should pass with failureRate of 0.5', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureRate: 0.5,
        });
        const errors = result.array().filter((e: any) => e.path === 'failureRate');
        expect(errors).toHaveLength(0);
      });

      it('should pass with small failureRate (0.01)', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureRate: 0.01,
        });
        const errors = result.array().filter((e: any) => e.path === 'failureRate');
        expect(errors).toHaveLength(0);
      });

      it('should fail when failureRate is negative', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureRate: -0.1,
        });
        const errors = result.array().filter((e: any) => e.path === 'failureRate');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('failureRate must be between 0 and 1');
      });

      it('should fail when failureRate exceeds 1', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureRate: 1.5,
        });
        const errors = result.array().filter((e: any) => e.path === 'failureRate');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('failureRate must be between 0 and 1');
      });

      it('should fail when failureRate is an invalid string', async () => {
        // Note: express-validator isFloat() coerces numeric strings
        // Only non-numeric strings should fail
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureRate: 'half',
        });
        const errors = result.array().filter((e: any) => e.path === 'failureRate');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('failTransactionIds field (optional)', () => {
      it('should pass when failTransactionIds is not provided', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
        });
        const errors = result.array().filter((e: any) => e.path === 'failTransactionIds');
        expect(errors).toHaveLength(0);
      });

      it('should pass with empty array', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failTransactionIds: [],
        });
        const errors = result.array().filter((e: any) => e.path === 'failTransactionIds');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid transaction IDs', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failTransactionIds: ['txn_123', 'txn_456', 'txn_789'],
        });
        const errors = result.array().filter((e: any) => e.path === 'failTransactionIds');
        expect(errors).toHaveLength(0);
      });

      it('should fail when failTransactionIds is not an array', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failTransactionIds: 'txn_123',
        });
        const errors = result.array().filter((e: any) => e.path === 'failTransactionIds');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('failTransactionIds must be an array');
      });

      it('should fail when array contains empty string', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failTransactionIds: ['txn_123', '', 'txn_456'],
        });
        const errors = result.array().filter((e: any) => e.path === 'failTransactionIds[1]');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when array contains non-string', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failTransactionIds: ['txn_123', 456, 'txn_789'],
        });
        const errors = result.array().filter((e: any) => e.path === 'failTransactionIds[1]');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('failureType field (optional)', () => {
      it('should pass when failureType is not provided', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
        });
        const errors = result.array().filter((e: any) => e.path === 'failureType');
        expect(errors).toHaveLength(0);
      });

      it('should pass with failureType ERROR', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureType: 'ERROR',
        });
        const errors = result.array().filter((e: any) => e.path === 'failureType');
        expect(errors).toHaveLength(0);
      });

      it('should pass with failureType TIMEOUT', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureType: 'TIMEOUT',
        });
        const errors = result.array().filter((e: any) => e.path === 'failureType');
        expect(errors).toHaveLength(0);
      });

      it('should fail with invalid failureType', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureType: 'CRASH',
        });
        const errors = result.array().filter((e: any) => e.path === 'failureType');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('failureType must be ERROR or TIMEOUT');
      });

      it('should fail with lowercase failureType', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureType: 'error',
        });
        const errors = result.array().filter((e: any) => e.path === 'failureType');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('complete validation', () => {
      it('should pass with only required field (enabled)', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
        });
        expect(result.isEmpty()).toBe(true);
      });

      it('should pass with all fields', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureRate: 0.5,
          failTransactionIds: ['txn_test_1', 'txn_test_2'],
          failureType: 'ERROR',
        });
        expect(result.isEmpty()).toBe(true);
      });

      it('should pass with typical chaos test config', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: true,
          failureRate: 0.3,
          failureType: 'TIMEOUT',
        });
        expect(result.isEmpty()).toBe(true);
      });

      it('should pass when disabling simulation', async () => {
        const result = await runBodyValidation(simulationConfigValidation, {
          enabled: false,
        });
        expect(result.isEmpty()).toBe(true);
      });
    });
  });
});
