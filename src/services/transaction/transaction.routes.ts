import { Router, Request, Response, NextFunction } from 'express';

import { authMiddleware } from '../../auth/auth.middleware';
import { validateRequest } from '../../middlewares/validateRequest';

import { transactionController } from './transaction.controller';
import {
  createTransactionValidation,
  getTransactionValidation,
  listTransactionsValidation,
} from './transaction.validation';


const router = Router();

// All transaction routes require authentication
router.use(authMiddleware);

// POST /transactions - Create a new transaction
router.post(
  '/',
  createTransactionValidation,
  validateRequest,
  (req: Request, res: Response, next: NextFunction) => transactionController.create(req, res, next)
);

// GET /transactions - List user's transactions
router.get(
  '/',
  listTransactionsValidation,
  validateRequest,
  (req: Request, res: Response, next: NextFunction) => transactionController.list(req, res, next)
);

// GET /transactions/:id - Get transaction by ID
router.get(
  '/:id',
  getTransactionValidation,
  validateRequest,
  (req: Request, res: Response, next: NextFunction) => transactionController.getById(req, res, next)
);

export default router;
