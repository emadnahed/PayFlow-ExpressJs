/**
 * Ledger API Routes
 *
 * Provides endpoints for:
 * - Failure simulation configuration (test/development only)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ledgerController } from './ledger.controller';
import { simulationConfigValidation } from './ledger.validation';
import { validateRequest } from '../../middlewares/validateRequest';

const router = Router();

/**
 * GET /ledger/simulation
 * Get current simulation configuration
 */
router.get(
  '/simulation',
  (req: Request, res: Response, next: NextFunction) =>
    ledgerController.getSimulationConfig(req, res, next)
);

/**
 * POST /ledger/simulation
 * Update simulation configuration
 */
router.post(
  '/simulation',
  simulationConfigValidation,
  validateRequest,
  (req: Request, res: Response, next: NextFunction) =>
    ledgerController.updateSimulationConfig(req, res, next)
);

/**
 * POST /ledger/simulation/fail-transactions
 * Add specific transaction IDs to fail
 */
router.post(
  '/simulation/fail-transactions',
  (req: Request, res: Response, next: NextFunction) =>
    ledgerController.addFailingTransactions(req, res, next)
);

/**
 * POST /ledger/simulation/reset
 * Reset simulation state
 */
router.post(
  '/simulation/reset',
  (req: Request, res: Response, next: NextFunction) =>
    ledgerController.resetSimulation(req, res, next)
);

export default router;
