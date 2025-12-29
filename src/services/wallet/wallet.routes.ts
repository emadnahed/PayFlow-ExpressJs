import { Router, Request, Response, NextFunction } from 'express';
import { walletController } from './wallet.controller';
import { authMiddleware } from '../../auth/auth.middleware';
import { depositValidation, getBalanceValidation, historyQueryValidation } from './wallet.validation';
import { validateRequest } from '../../middlewares/validateRequest';

const router = Router();

// All wallet routes require authentication
router.use(authMiddleware);

// GET /wallets/me - Get current user's wallet
router.get('/me', (req: Request, res: Response, next: NextFunction) => walletController.getMyWallet(req, res, next));

// GET /wallets/me/history - Get wallet operation history
router.get('/me/history', historyQueryValidation, validateRequest, (req: Request, res: Response, next: NextFunction) => walletController.getHistory(req, res, next));

// POST /wallets/me/deposit - Deposit funds (testing/admin)
router.post('/me/deposit', depositValidation, validateRequest, (req: Request, res: Response, next: NextFunction) => walletController.deposit(req, res, next));

// GET /wallets/:id/balance - Get wallet balance by ID
router.get('/:id/balance', getBalanceValidation, validateRequest, (req: Request, res: Response, next: NextFunction) => walletController.getBalance(req, res, next));

export default router;
