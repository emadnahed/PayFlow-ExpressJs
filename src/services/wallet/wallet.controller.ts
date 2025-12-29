import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { walletService } from './wallet.service';
import { AuthRequest } from '../../auth/auth.types';
import { ApiError } from '../../middlewares/errorHandler';

export class WalletController {
  /**
   * Get current user's wallet
   * GET /wallets/me
   */
  async getMyWallet(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Not authenticated');
      }

      const wallet = await walletService.getWallet(req.user.userId);

      res.status(200).json({
        success: true,
        data: {
          wallet: {
            walletId: wallet.walletId,
            userId: wallet.userId,
            balance: wallet.balance,
            currency: wallet.currency,
            isActive: wallet.isActive,
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get wallet balance
   * GET /wallets/:id/balance
   */
  async getBalance(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Not authenticated');
      }

      const { id } = req.params;

      // Users can only check their own wallet balance (unless admin - future feature)
      const wallet = await walletService.getWalletById(id);

      if (wallet.userId !== req.user.userId) {
        throw new ApiError(403, 'Not authorized to view this wallet');
      }

      res.status(200).json({
        success: true,
        data: {
          walletId: wallet.walletId,
          balance: wallet.balance,
          currency: wallet.currency,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deposit funds to wallet (for testing/admin)
   * POST /wallets/me/deposit
   */
  async deposit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const error = new ApiError(400, 'Validation failed');
        (error as ApiError & { validationErrors: Record<string, string[]> }).validationErrors = errors.array().reduce((acc, err) => {
          const field = (err as { path: string }).path;
          if (!acc[field]) acc[field] = [];
          acc[field].push(err.msg);
          return acc;
        }, {} as Record<string, string[]>);
        throw error;
      }

      if (!req.user) {
        throw new ApiError(401, 'Not authenticated');
      }

      const { amount } = req.body;
      const result = await walletService.deposit(req.user.userId, amount);

      res.status(200).json({
        success: true,
        data: {
          message: 'Deposit successful',
          newBalance: result.newBalance,
          operationId: result.operationId,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get wallet operation history
   * GET /wallets/me/history
   */
  async getHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'Not authenticated');
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const operations = await walletService.getOperationHistory(req.user.userId, Math.min(limit, 100));

      res.status(200).json({
        success: true,
        data: {
          operations: operations.map((op: any) => ({
            operationId: op.operationId,
            type: op.type,
            amount: op.amount,
            resultBalance: op.resultBalance,
            transactionId: op.transactionId,
            createdAt: op.createdAt,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const walletController = new WalletController();
