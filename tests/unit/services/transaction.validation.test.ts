/**
 * Unit tests for Transaction Validation
 *
 * Tests the express-validator chains for transaction endpoints.
 */

import { validationResult } from 'express-validator';
import { Request, Response } from 'express';
import {
  createTransactionValidation,
  getTransactionValidation,
  listTransactionsValidation,
} from '../../../src/services/transaction/transaction.validation';
import { TransactionStatus } from '../../../src/types/events';

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

describe('Transaction Validation', () => {
  describe('createTransactionValidation', () => {
    describe('receiverId field', () => {
      it('should pass with valid receiverId', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_receiver_123',
          amount: 100,
        });
        const errors = result.array().filter((e: any) => e.path === 'receiverId');
        expect(errors).toHaveLength(0);
      });

      it('should fail when receiverId is missing', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          amount: 100,
        });
        const errors = result.array().filter((e: any) => e.path === 'receiverId');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Receiver ID is required');
      });

      it('should fail when receiverId is empty string', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: '',
          amount: 100,
        });
        const errors = result.array().filter((e: any) => e.path === 'receiverId');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when receiverId is not a string', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 12345,
          amount: 100,
        });
        const errors = result.array().filter((e: any) => e.path === 'receiverId');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Receiver ID must be a string');
      });
    });

    describe('amount field', () => {
      it('should pass with valid amount', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100.5,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors).toHaveLength(0);
      });

      it('should pass with minimum valid amount (0.01)', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 0.01,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors).toHaveLength(0);
      });

      it('should fail when amount is missing', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Amount is required');
      });

      it('should fail when amount is zero', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 0,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when amount is negative', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: -50,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when amount has more than 2 decimal places', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100.123,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Amount can have at most 2 decimal places');
      });

      it('should pass with integer amount', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100,
        });
        const errors = result.array().filter((e: any) => e.path === 'amount');
        expect(errors).toHaveLength(0);
      });
    });

    describe('currency field (optional)', () => {
      it('should pass when currency is not provided', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100,
        });
        const errors = result.array().filter((e: any) => e.path === 'currency');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid 3-letter currency code', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100,
          currency: 'USD',
        });
        const errors = result.array().filter((e: any) => e.path === 'currency');
        expect(errors).toHaveLength(0);
      });

      it('should pass with various valid currency codes', async () => {
        const currencies = ['EUR', 'GBP', 'JPY', 'INR', 'AUD'];
        for (const currency of currencies) {
          const result = await runBodyValidation(createTransactionValidation, {
            receiverId: 'user_123',
            amount: 100,
            currency,
          });
          const errors = result.array().filter((e: any) => e.path === 'currency');
          expect(errors).toHaveLength(0);
        }
      });

      it('should fail when currency is not 3 characters', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100,
          currency: 'US',
        });
        const errors = result.array().filter((e: any) => e.path === 'currency');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Currency must be a 3-letter code');
      });

      it('should fail when currency exceeds 3 characters', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100,
          currency: 'USDD',
        });
        const errors = result.array().filter((e: any) => e.path === 'currency');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when currency is not a string', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100,
          currency: 123,
        });
        const errors = result.array().filter((e: any) => e.path === 'currency');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('description field (optional)', () => {
      it('should pass when description is not provided', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100,
        });
        const errors = result.array().filter((e: any) => e.path === 'description');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid description', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100,
          description: 'Payment for services',
        });
        const errors = result.array().filter((e: any) => e.path === 'description');
        expect(errors).toHaveLength(0);
      });

      it('should pass with description exactly 255 characters', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100,
          description: 'a'.repeat(255),
        });
        const errors = result.array().filter((e: any) => e.path === 'description');
        expect(errors).toHaveLength(0);
      });

      it('should fail when description exceeds 255 characters', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100,
          description: 'a'.repeat(256),
        });
        const errors = result.array().filter((e: any) => e.path === 'description');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Description cannot exceed 255 characters');
      });

      it('should fail when description is not a string', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_123',
          amount: 100,
          description: 12345,
        });
        const errors = result.array().filter((e: any) => e.path === 'description');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('complete validation', () => {
      it('should pass with all required fields', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_receiver',
          amount: 50.0,
        });
        expect(result.isEmpty()).toBe(true);
      });

      it('should pass with all fields', async () => {
        const result = await runBodyValidation(createTransactionValidation, {
          receiverId: 'user_receiver',
          amount: 50.0,
          currency: 'USD',
          description: 'Test payment',
        });
        expect(result.isEmpty()).toBe(true);
      });

      it('should fail with multiple missing fields', async () => {
        const result = await runBodyValidation(createTransactionValidation, {});
        const errors = result.array();
        expect(errors.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('getTransactionValidation', () => {
    it('should pass with valid transaction ID', async () => {
      const result = await runParamValidation(getTransactionValidation, {
        id: 'txn_123abc',
      });
      const errors = result.array().filter((e: any) => e.path === 'id');
      expect(errors).toHaveLength(0);
    });

    it('should fail when transaction ID is missing', async () => {
      const result = await runParamValidation(getTransactionValidation, {});
      const errors = result.array().filter((e: any) => e.path === 'id');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].msg).toBe('Transaction ID is required');
    });

    it('should pass with UUID format transaction ID', async () => {
      const result = await runParamValidation(getTransactionValidation, {
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      const errors = result.array().filter((e: any) => e.path === 'id');
      expect(errors).toHaveLength(0);
    });
  });

  describe('listTransactionsValidation', () => {
    it('should pass with no query parameters', async () => {
      const result = await runQueryValidation(listTransactionsValidation, {});
      expect(result.isEmpty()).toBe(true);
    });

    describe('status filter', () => {
      it('should pass with valid status INITIATED', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          status: TransactionStatus.INITIATED,
        });
        const errors = result.array().filter((e: any) => e.path === 'status');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid status COMPLETED', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          status: TransactionStatus.COMPLETED,
        });
        const errors = result.array().filter((e: any) => e.path === 'status');
        expect(errors).toHaveLength(0);
      });

      it('should pass with valid status FAILED', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          status: TransactionStatus.FAILED,
        });
        const errors = result.array().filter((e: any) => e.path === 'status');
        expect(errors).toHaveLength(0);
      });

      it('should pass with all valid statuses', async () => {
        const statuses = Object.values(TransactionStatus);
        for (const status of statuses) {
          const result = await runQueryValidation(listTransactionsValidation, {
            status,
          });
          const errors = result.array().filter((e: any) => e.path === 'status');
          expect(errors).toHaveLength(0);
        }
      });

      it('should fail with invalid status', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          status: 'INVALID_STATUS',
        });
        const errors = result.array().filter((e: any) => e.path === 'status');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('limit parameter', () => {
      it('should pass with valid limit', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          limit: '50',
        });
        const errors = result.array().filter((e: any) => e.path === 'limit');
        expect(errors).toHaveLength(0);
      });

      it('should pass with limit exactly 1', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          limit: '1',
        });
        const errors = result.array().filter((e: any) => e.path === 'limit');
        expect(errors).toHaveLength(0);
      });

      it('should pass with limit exactly 100', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          limit: '100',
        });
        const errors = result.array().filter((e: any) => e.path === 'limit');
        expect(errors).toHaveLength(0);
      });

      it('should fail when limit is 0', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          limit: '0',
        });
        const errors = result.array().filter((e: any) => e.path === 'limit');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when limit exceeds 100', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          limit: '101',
        });
        const errors = result.array().filter((e: any) => e.path === 'limit');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail when limit is negative', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          limit: '-5',
        });
        const errors = result.array().filter((e: any) => e.path === 'limit');
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('offset parameter', () => {
      it('should pass with valid offset', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          offset: '10',
        });
        const errors = result.array().filter((e: any) => e.path === 'offset');
        expect(errors).toHaveLength(0);
      });

      it('should pass with offset of 0', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          offset: '0',
        });
        const errors = result.array().filter((e: any) => e.path === 'offset');
        expect(errors).toHaveLength(0);
      });

      it('should fail with negative offset', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          offset: '-1',
        });
        const errors = result.array().filter((e: any) => e.path === 'offset');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].msg).toBe('Offset must be a non-negative integer');
      });
    });

    describe('combined parameters', () => {
      it('should pass with all valid parameters', async () => {
        const result = await runQueryValidation(listTransactionsValidation, {
          status: TransactionStatus.COMPLETED,
          limit: '20',
          offset: '10',
        });
        expect(result.isEmpty()).toBe(true);
      });
    });
  });
});
