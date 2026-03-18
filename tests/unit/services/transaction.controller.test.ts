/**
 * Unit Tests: TransactionController
 *
 * Tests HTTP request handling with transactionService fully mocked.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../src/auth/auth.types';
import { TransactionStatus } from '../../../src/types/events';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockInitiate = jest.fn();
const mockGetTransaction = jest.fn();
const mockGetUserTransactions = jest.fn();

jest.mock('../../../src/services/transaction/transaction.service', () => ({
  transactionService: {
    initiateTransaction: (...a: unknown[]) => mockInitiate(...a),
    getTransaction: (...a: unknown[]) => mockGetTransaction(...a),
    getUserTransactions: (...a: unknown[]) => mockGetUserTransactions(...a),
  },
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { TransactionController } from '../../../src/services/transaction/transaction.controller';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTxn(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: 'txn_1',
    senderId: 'user_s',
    receiverId: 'user_r',
    amount: 100,
    currency: 'INR',
    status: TransactionStatus.INITIATED,
    initiatedAt: new Date(),
    ...overrides,
  };
}

function buildReq(
  overrides: Partial<{
    body: Record<string, unknown>;
    params: Record<string, string>;
    query: Record<string, string>;
    user: Record<string, unknown>;
  }> = {}
): AuthRequest {
  return {
    body: overrides.body ?? {},
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    user: overrides.user ?? { userId: 'user_s' },
  } as unknown as AuthRequest;
}

function buildRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TransactionController (unit)', () => {
  let controller: TransactionController;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TransactionController();
    next = jest.fn();
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should respond 201 with the created transaction', async () => {
      const txn = makeTxn();
      mockInitiate.mockResolvedValue(txn);
      const req = buildReq({ body: { receiverId: 'user_r', amount: 100 } });
      const res = buildRes();

      await controller.create(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.success).toBe(true);
      expect(body.data.transaction.transactionId).toBe('txn_1');
    });

    it('should forward errors to next', async () => {
      mockInitiate.mockRejectedValue(new Error('Cannot transfer to yourself'));
      const req = buildReq({ body: { receiverId: 'user_s', amount: 100 } });
      const res = buildRes();

      await controller.create(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ── getById ──────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return 200 with the transaction', async () => {
      const txn = makeTxn({ senderId: 'user_s' });
      mockGetTransaction.mockResolvedValue(txn);
      const req = buildReq({ params: { id: 'txn_1' }, user: { userId: 'user_s' } });
      const res = buildRes();

      await controller.getById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.data.transaction.transactionId).toBe('txn_1');
    });

    it('should throw 403 when user is not sender or receiver', async () => {
      const txn = makeTxn({ senderId: 'other_sender', receiverId: 'other_receiver' });
      mockGetTransaction.mockResolvedValue(txn);
      const req = buildReq({ params: { id: 'txn_1' }, user: { userId: 'user_s' } });
      const res = buildRes();

      await controller.getById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it('should allow receiver to view transaction', async () => {
      const txn = makeTxn({ senderId: 'someone_else', receiverId: 'user_s' });
      mockGetTransaction.mockResolvedValue(txn);
      const req = buildReq({ params: { id: 'txn_1' }, user: { userId: 'user_s' } });
      const res = buildRes();

      await controller.getById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ── list ─────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return 200 with paginated transactions', async () => {
      mockGetUserTransactions.mockResolvedValue({
        transactions: [makeTxn()],
        total: 1,
      });
      const req = buildReq({ query: { limit: '10', offset: '0' } });
      const res = buildRes();

      await controller.list(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.data.pagination.total).toBe(1);
      expect(body.data.transactions).toHaveLength(1);
    });

    it('should apply status filter from query', async () => {
      mockGetUserTransactions.mockResolvedValue({ transactions: [], total: 0 });
      const req = buildReq({ query: { status: 'COMPLETED' } });
      const res = buildRes();

      await controller.list(req, res, next);

      expect(mockGetUserTransactions).toHaveBeenCalledWith('user_s', {
        status: 'COMPLETED',
        limit: 20,
        offset: 0,
      });
    });

    it('should compute hasMore correctly', async () => {
      mockGetUserTransactions.mockResolvedValue({
        transactions: [makeTxn(), makeTxn({ transactionId: 'txn_2' })],
        total: 5,
      });
      const req = buildReq({ query: { limit: '2', offset: '0' } });
      const res = buildRes();

      await controller.list(req, res, next);

      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.data.pagination.hasMore).toBe(true);
    });
  });
});
