/**
 * Unit Tests: WalletController
 *
 * Tests HTTP request handling with walletService mocked.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../src/auth/auth.types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetWallet = jest.fn();
const mockGetWalletById = jest.fn();
const mockDeposit = jest.fn();
const mockGetOperationHistory = jest.fn();

jest.mock('../../../src/services/wallet/wallet.service', () => ({
  walletService: {
    getWallet: (...a: unknown[]) => mockGetWallet(...a),
    getWalletById: (...a: unknown[]) => mockGetWalletById(...a),
    deposit: (...a: unknown[]) => mockDeposit(...a),
    getOperationHistory: (...a: unknown[]) => mockGetOperationHistory(...a),
  },
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { WalletController } from '../../../src/services/wallet/wallet.controller';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fakeWallet = {
  walletId: 'w1',
  userId: 'u1',
  balance: 500,
  currency: 'INR',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildReq(overrides: Partial<{
  user: Record<string, unknown>;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
}> = {}): AuthRequest {
  return {
    user: 'user' in overrides ? overrides.user : { userId: 'u1' },
    body: overrides.body ?? {},
    params: overrides.params ?? {},
    query: overrides.query ?? {},
  } as unknown as AuthRequest;
}

function buildRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WalletController (unit)', () => {
  let controller: WalletController;
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WalletController();
    next = jest.fn();
  });

  // ── getMyWallet ───────────────────────────────────────────────────────────

  describe('getMyWallet', () => {
    it('should respond 200 with wallet data', async () => {
      mockGetWallet.mockResolvedValue(fakeWallet);
      const req = buildReq();
      const res = buildRes();

      await controller.getMyWallet(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.data.wallet.walletId).toBe('w1');
      expect(body.data.wallet.balance).toBe(500);
    });

    it('should throw 401 when no user on request', async () => {
      const req = buildReq({ user: undefined as never });
      const res = buildRes();

      await controller.getMyWallet(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    it('should forward wallet-not-found error', async () => {
      mockGetWallet.mockRejectedValue(new Error('Wallet not found'));
      const req = buildReq();
      const res = buildRes();

      await controller.getMyWallet(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ── getBalance ────────────────────────────────────────────────────────────

  describe('getBalance', () => {
    it('should respond 200 with balance when user owns the wallet', async () => {
      mockGetWalletById.mockResolvedValue(fakeWallet); // userId matches
      const req = buildReq({ params: { id: 'w1' }, user: { userId: 'u1' } });
      const res = buildRes();

      await controller.getBalance(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.data.balance).toBe(500);
    });

    it('should throw 403 when user does not own the wallet', async () => {
      mockGetWalletById.mockResolvedValue({ ...fakeWallet, userId: 'other_user' });
      const req = buildReq({ params: { id: 'w1' }, user: { userId: 'u1' } });
      const res = buildRes();

      await controller.getBalance(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
  });

  // ── deposit ───────────────────────────────────────────────────────────────

  describe('deposit', () => {
    it('should respond 200 with deposit result', async () => {
      mockDeposit.mockResolvedValue({
        newBalance: 600,
        operationId: 'op_1',
        idempotent: false,
      });
      const req = buildReq({ body: { amount: 100 } });
      const res = buildRes();

      await controller.deposit(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.data.newBalance).toBe(600);
      expect(body.data.message).toContain('Deposit successful');
    });

    it('should say "already processed" for idempotent deposits', async () => {
      mockDeposit.mockResolvedValue({
        newBalance: 500,
        operationId: 'op_1',
        idempotent: true,
      });
      const req = buildReq({ body: { amount: 100, idempotencyKey: 'k1' } });
      const res = buildRes();

      await controller.deposit(req, res, next);

      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.data.message).toContain('already processed');
    });
  });

  // ── getHistory ────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('should respond 200 with operation history', async () => {
      mockGetOperationHistory.mockResolvedValue([
        { operationId: 'op_1', type: 'DEPOSIT', amount: 100, resultBalance: 600, createdAt: new Date() },
      ]);
      const req = buildReq({ query: { limit: '5' } });
      const res = buildRes();

      await controller.getHistory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.data.operations).toHaveLength(1);
    });

    it('should cap limit at 100', async () => {
      mockGetOperationHistory.mockResolvedValue([]);
      const req = buildReq({ query: { limit: '999' } });
      const res = buildRes();

      await controller.getHistory(req, res, next);

      expect(mockGetOperationHistory).toHaveBeenCalledWith('u1', 100);
    });
  });
});
