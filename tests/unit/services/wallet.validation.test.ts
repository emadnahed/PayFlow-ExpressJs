/**
 * Unit tests for Wallet Validation
 *
 * Tests the express-validator chains for wallet endpoints.
 */

import { validationResult } from 'express-validator';
import { Request, Response } from 'express';
import {
  depositValidation,
  getBalanceValidation,
  historyQueryValidation,
} from '../../../src/services/wallet/wallet.validation';

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

const runParamValidation = async (validations: any[], params: Record<string, any>) => {
  const req = {
    body: {},
    params,
    query: {},
  } as unknown as Request;

  for (const validation of validations) {
    await validation.run(req);
  }

  return validationResult(req);
};

const runQueryValidation = async (validations: any[], query: Record<string, any>) => {
  const req = {
    body: {},
    params: {},
    query,
  } as unknown as Request;

  for (const validation of validations) {
    await validation.run(req);
  }

  return validationResult(req);
};

describe('Wallet Validation', () => {
  describe('depositValidation', () => {
    describe('amount field', () => {
      it('should pass with valid amount', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 100.0,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors).toHaveLength(0);
      });

      it('should pass with minimum valid amount (0.01)', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 0.01,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors).toHaveLength(0);
      });

      it('should pass with amount having 2 decimal places', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 99.99,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors).toHaveLength(0);
      });

      it('should fail when amount is missing', async () => {
        const result = await runBodyValidation(depositValidation, {});
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Amount is required');
      });

      it('should fail when amount is zero', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 0,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when amount is negative', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: -50,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when amount has more than 2 decimal places', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 100.123,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Amount can have at most 2 decimal places');
      });

      it('should fail when amount is a string', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 'one hundred',
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should pass with large valid amount', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 1000000.0,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors).toHaveLength(0);
      });
    });

    describe('idempotencyKey field (optional)', () => {
      it('should pass when idempotencyKey is not provided', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 100,
        });
        const errors = result.array().filter((e: any) => e.path === 'idempotencyKey');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid idempotencyKey', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 100,
          idempotencyKey: 'unique-key-123',
        });
        const errors = result.array().filter((e: any) => e.path === 'idempotencyKey');
        expect(errors).toHaveLength(0);
      });

      it('should pass with idempotencyKey exactly 64 characters', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 100,
          idempotencyKey: 'a'.repeat(64),
        });
        const errors = result.array().filter((e: any) => e.path === 'idempotencyKey');
        expect(errors).toHaveLength(0);
      });

      it('should fail when idempotencyKey exceeds 64 characters', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 100,
          idempotencyKey: 'a'.repeat(65),
        });
        const errors = result.array().filter((e: any) => e.path === 'idempotencyKey');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Idempotency key must be between 1 and 64 characters');
      });

      it('should fail when idempotencyKey is empty string', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 100,
          idempotencyKey: '',
        });
        const errors = result.array().filter((e: any) => e.path === 'idempotencyKey');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when idempotencyKey is not a string', async () => {
        const result = await runBodyValidation(depositValidation, {
          amount: 100,
          idempotencyKey: 12345,
        });
        const errors = result.array().filter((e: any) => e.path === 'idempotencyKey');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Idempotency key must be a string');
      });
    });
  });

  describe('getBalanceValidation', () => {
    it('should pass with valid wallet ID', async () => {
      const result = await runParamValidation(getBalanceValidation, {
        id: 'wallet_123',
      });
      const errors = result.array().filter((e: any) => e.path === 'id');
      expect(errors).toHaveLength(0);
    });

    it('should fail when wallet ID is missing', async () => {
      const result = await runParamValidation(getBalanceValidation, {});
      const errors = result.array().filter((e: any) => e.path === 'id');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].msg).toBe('Wallet ID is required');
    });

    it('should pass with UUID format wallet ID', async () => {
      const result = await runParamValidation(getBalanceValidation, {
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      const errors = result.array().filter((e: any) => e.path === 'id');
      expect(errors).toHaveLength(0);
    });
  });

  describe('historyQueryValidation', () => {
    it('should pass when no query params provided', async () => {
      const result = await runQueryValidation(historyQueryValidation, {});
      expect(result.isEmpty()).toBe(true);
    });

    it('should pass with valid limit', async () => {
      const result = await runQueryValidation(historyQueryValidation, {
        limit: '20',
      });
      const errors = result.array().filter((e: any) => e.path === 'limit');
      expect(errors).toHaveLength(0);
    });

    it('should pass with limit exactly 1', async () => {
      const result = await runQueryValidation(historyQueryValidation, {
        limit: '1',
      });
      const errors = result.array().filter((e: any) => e.path === 'limit');
      expect(errors).toHaveLength(0);
    });

    it('should pass with limit exactly 100', async () => {
      const result = await runQueryValidation(historyQueryValidation, {
        limit: '100',
      });
      const errors = result.array().filter((e: any) => e.path === 'limit');
      expect(errors).toHaveLength(0);
    });

    it('should fail when limit is 0', async () => {
      const result = await runQueryValidation(historyQueryValidation, {
        limit: '0',
      });
      const errors = result.array().filter((e: any) => e.path === 'limit');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].msg).toBe('Limit must be between 1 and 100');
    });

    it('should fail when limit exceeds 100', async () => {
      const result = await runQueryValidation(historyQueryValidation, {
        limit: '101',
      });
      const errors = result.array().filter((e: any) => e.path === 'limit');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].msg).toBe('Limit must be between 1 and 100');
    });

    it('should fail when limit is negative', async () => {
      const result = await runQueryValidation(historyQueryValidation, {
        limit: '-1',
      });
      const errors = result.array().filter((e: any) => e.path === 'limit');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when limit is not a number', async () => {
      const result = await runQueryValidation(historyQueryValidation, {
        limit: 'abc',
      });
      const errors = result.array().filter((e: any) => e.path === 'limit');
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
