/**
 * Ledger Controller
 *
 * Handles HTTP requests for ledger operations,
 * primarily failure simulation configuration for testing.
 */

import { Request, Response, NextFunction } from 'express';

import { config } from '../../config';
import { ApiError } from '../../middlewares/errorHandler';

import { ledgerSimulation, FailureType } from './ledger.simulation';

interface SimulationConfigRequest {
  enabled: boolean;
  failureRate?: number;
  failTransactionIds?: string[];
  failureType?: FailureType;
}

class LedgerController {
  /**
   * Get current simulation configuration
   * GET /ledger/simulation
   */
  async getSimulationConfig(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!config.isTest && !config.isDevelopment) {
        throw new ApiError(403, 'Simulation API only available in test/development environments');
      }

      const simulationConfig = ledgerSimulation.getConfig();

      res.status(200).json({
        success: true,
        data: {
          simulation: simulationConfig,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update simulation configuration
   * POST /ledger/simulation
   *
   * Behavior:
   * - When enabled=true: Updates config with provided values. Omitted fields preserve existing values.
   * - When enabled=false: Disables simulation and clears failTransactionIds.
   * - Use POST /ledger/simulation/reset to fully reset all config to defaults.
   */
  async updateSimulationConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!config.isTest && !config.isDevelopment) {
        throw new ApiError(403, 'Simulation API only available in test/development environments');
      }

      const { enabled, failureRate, failTransactionIds, failureType } =
        req.body as SimulationConfigRequest;

      if (enabled) {
        // Enable with provided values; omitted fields preserve existing values
        ledgerSimulation.enable({
          failureRate,
          failTransactionIds: failTransactionIds ? new Set(failTransactionIds) : undefined,
          failureType,
        });
      } else {
        // Disable clears the fail list
        ledgerSimulation.disable();
      }

      const simulationConfig = ledgerSimulation.getConfig();

      res.status(200).json({
        success: true,
        data: {
          simulation: simulationConfig,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add transaction IDs to fail
   * POST /ledger/simulation/fail-transactions
   */
  async addFailingTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!config.isTest && !config.isDevelopment) {
        throw new ApiError(403, 'Simulation API only available in test/development environments');
      }

      const { transactionIds } = req.body as { transactionIds: string[] };

      if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
        throw new ApiError(400, 'transactionIds must be a non-empty array');
      }

      ledgerSimulation.addFailingTransactionIds(transactionIds);

      const simulationConfig = ledgerSimulation.getConfig();

      res.status(200).json({
        success: true,
        data: {
          simulation: simulationConfig,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset simulation state
   * POST /ledger/simulation/reset
   */
  async resetSimulation(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!config.isTest && !config.isDevelopment) {
        throw new ApiError(403, 'Simulation API only available in test/development environments');
      }

      ledgerSimulation.reset();

      res.status(200).json({
        success: true,
        data: {
          simulation: ledgerSimulation.getConfig(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const ledgerController = new LedgerController();
