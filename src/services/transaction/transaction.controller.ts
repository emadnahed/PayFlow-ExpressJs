import { Response, NextFunction } from 'express';
import { transactionService } from './transaction.service';
import { AuthRequest } from '../../auth/auth.types';
import { ApiError } from '../../middlewares/errorHandler';
import { TransactionStatus } from '../../types/events';
import { ITransaction } from '../../models/Transaction';

interface TransactionDTO {
  transactionId: string;
  senderId: string;
  receiverId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  description?: string;
  failureReason?: string;
  initiatedAt: Date;
  completedAt?: Date;
}

export class TransactionController {
  /**
   * Transform ITransaction to TransactionDTO for API response
   */
  private toTransactionDTO(transaction: ITransaction): TransactionDTO {
    return {
      transactionId: transaction.transactionId,
      senderId: transaction.senderId,
      receiverId: transaction.receiverId,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      description: transaction.description,
      failureReason: transaction.failureReason,
      initiatedAt: transaction.initiatedAt,
      completedAt: transaction.completedAt,
    };
  }

  /**
   * Create a new transaction
   * POST /transactions
   */
  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { receiverId, amount, currency, description } = req.body;

      const transaction = await transactionService.initiateTransaction(req.user!.userId, {
        receiverId,
        amount,
        currency,
        description,
      });

      res.status(201).json({
        success: true,
        data: {
          transaction: this.toTransactionDTO(transaction),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get transaction by ID
   * GET /transactions/:id
   */
  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const transaction = await transactionService.getTransaction(id);

      // User can only view their own transactions
      if (transaction.senderId !== req.user!.userId && transaction.receiverId !== req.user!.userId) {
        throw new ApiError(403, 'Not authorized to view this transaction');
      }

      res.status(200).json({
        success: true,
        data: {
          transaction: this.toTransactionDTO(transaction),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List user's transactions
   * GET /transactions
   */
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as TransactionStatus | undefined;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const { transactions, total } = await transactionService.getUserTransactions(
        req.user!.userId,
        { status, limit, offset }
      );

      res.status(200).json({
        success: true,
        data: {
          transactions: transactions.map((txn) => this.toTransactionDTO(txn)),
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + transactions.length < total,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const transactionController = new TransactionController();
