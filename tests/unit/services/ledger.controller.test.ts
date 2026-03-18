/**
 * Unit Tests: LedgerController
 *
 * Tests HTTP handlers for ledger simulation config with ledgerSimulation
 * and config mocked.
 */

import { Request, Response, NextFunction } from 'express';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetConfig = jest.fn();
const mockEnable = jest.fn();
const mockDisable = jest.fn();
const mockAddFailingTransactionIds = jest.fn();
const mockReset = jest.fn();

jest.mock('../../../src/services/ledger/ledger.simulation', () => ({
  ledgerSimulation: {
    getConfig: (...a: unknown[]) => mockGetConfig(...a),
    enable: (...a: unknown[]) => mockEnable(...a),
    disable: (...a: unknown[]) => mockDisable(...a),
    addFailingTransactionIds: (...a: unknown[]) => mockAddFailingTransactionIds(...a),
    reset: (...a: unknown[]) => mockReset(...a),
  },
}));

const mockConfig = { isTest: true, isDevelopment: false };
jest.mock('../../../src/config', () => ({
  config: mockConfig,
}));

// ── Import ────────────────────────────────────────────────────────────────────

import { ledgerController } from '../../../src/services/ledger/ledger.controller';

// ── Helpers ───────────────────────────────────────────────────────────────────

const defaultSimConfig = {
  enabled: false,
  failureRate: 0,
  failTransactionIds: [],
  failureType: 'ERROR',
};

function buildReq(body: Record<string, unknown> = {}): Request {
  return { body } as unknown as Request;
}

function buildRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LedgerController (unit)', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
    mockGetConfig.mockReturnValue(defaultSimConfig);
  });

  // ── getSimulationConfig ───────────────────────────────────────────────────

  describe('getSimulationConfig', () => {
    it('should respond 200 with simulation config', async () => {
      const req = buildReq();
      const res = buildRes();

      await ledgerController.getSimulationConfig(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.success).toBe(true);
      expect(body.data.simulation).toEqual(defaultSimConfig);
    });

    it('should call next(403) when not in test/dev environment', async () => {
      mockConfig.isTest = false;
      mockConfig.isDevelopment = false;
      const req = buildReq();
      const res = buildRes();

      await ledgerController.getSimulationConfig(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));

      // restore
      mockConfig.isTest = true;
    });
  });

  // ── updateSimulationConfig ────────────────────────────────────────────────

  describe('updateSimulationConfig', () => {
    it('should call enable() when enabled=true', async () => {
      const req = buildReq({ enabled: true, failureRate: 0.5 });
      const res = buildRes();

      await ledgerController.updateSimulationConfig(req, res, next);

      expect(mockEnable).toHaveBeenCalledWith(
        expect.objectContaining({ failureRate: 0.5 })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should call disable() when enabled=false', async () => {
      const req = buildReq({ enabled: false });
      const res = buildRes();

      await ledgerController.updateSimulationConfig(req, res, next);

      expect(mockDisable).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ── addFailingTransactions ────────────────────────────────────────────────

  describe('addFailingTransactions', () => {
    it('should add transaction IDs and respond 200', async () => {
      const req = buildReq({ transactionIds: ['txn_1', 'txn_2'] });
      const res = buildRes();

      await ledgerController.addFailingTransactions(req, res, next);

      expect(mockAddFailingTransactionIds).toHaveBeenCalledWith(['txn_1', 'txn_2']);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should call next(400) when transactionIds is empty array', async () => {
      const req = buildReq({ transactionIds: [] });
      const res = buildRes();

      await ledgerController.addFailingTransactions(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    it('should call next(400) when transactionIds is missing', async () => {
      const req = buildReq({});
      const res = buildRes();

      await ledgerController.addFailingTransactions(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  // ── resetSimulation ───────────────────────────────────────────────────────

  describe('resetSimulation', () => {
    it('should call reset() and respond 200', async () => {
      const req = buildReq();
      const res = buildRes();

      await ledgerController.resetSimulation(req, res, next);

      expect(mockReset).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
