import crypto from 'crypto';
import { Transaction, ITransaction } from '../../models/Transaction';
import { TransactionStatus, EventType } from '../../types/events';
import { ApiError } from '../../middlewares/errorHandler';
import { eventBus } from '../../events/eventBus';
import { walletService } from '../wallet/wallet.service';
import { validateTransition, isTerminalState } from './transaction.state';

export interface CreateTransactionDTO {
  receiverId: string;
  amount: number;
  currency?: string;
  description?: string;
}

export interface TransactionQueryOptions {
  status?: TransactionStatus;
  limit?: number;
  offset?: number;
}

export class TransactionService {
  /**
   * Generate a unique transaction ID
   */
  private generateTransactionId(): string {
    return `txn_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  /**
   * Initiate a new transaction (Saga entry point)
   */
  async initiateTransaction(senderId: string, dto: CreateTransactionDTO): Promise<ITransaction> {
    // Validate sender and receiver are different
    if (senderId === dto.receiverId) {
      throw new ApiError(400, 'Cannot transfer to yourself');
    }

    // Validate amount
    if (dto.amount <= 0) {
      throw new ApiError(400, 'Amount must be positive');
    }

    // Verify sender has a wallet
    await walletService.getWallet(senderId);

    // Verify receiver has a wallet
    try {
      await walletService.getWallet(dto.receiverId);
    } catch {
      throw new ApiError(404, 'Receiver wallet not found');
    }

    const transactionId = this.generateTransactionId();

    // Create transaction record
    const transaction = await Transaction.create({
      transactionId,
      senderId,
      receiverId: dto.receiverId,
      amount: dto.amount,
      currency: dto.currency || 'INR',
      description: dto.description,
      status: TransactionStatus.INITIATED,
      initiatedAt: new Date(),
    });

    // Publish TRANSACTION_INITIATED event to start the Saga
    await eventBus.publish({
      eventType: EventType.TRANSACTION_INITIATED,
      transactionId,
      timestamp: new Date(),
      payload: {
        senderId,
        receiverId: dto.receiverId,
        amount: dto.amount,
        currency: dto.currency || 'INR',
      },
    });

    return transaction;
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(transactionId: string): Promise<ITransaction> {
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      throw new ApiError(404, 'Transaction not found');
    }
    return transaction;
  }

  /**
   * Get transactions for a user (as sender or receiver)
   */
  async getUserTransactions(
    userId: string,
    options: TransactionQueryOptions = {}
  ): Promise<{ transactions: ITransaction[]; total: number }> {
    const { status, limit = 20, offset = 0 } = options;

    const query: Record<string, unknown> = {
      $or: [{ senderId: userId }, { receiverId: userId }],
    };

    if (status) {
      query.status = status;
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(Math.min(limit, 100)),
      Transaction.countDocuments(query),
    ]);

    return { transactions, total };
  }

  /**
   * Update transaction status with state machine validation
   */
  async updateStatus(
    transactionId: string,
    newStatus: TransactionStatus,
    additionalData?: { failureReason?: string; completedAt?: Date }
  ): Promise<ITransaction> {
    const transaction = await this.getTransaction(transactionId);

    // Validate state transition
    validateTransition(transaction.status, newStatus, transactionId);

    const updateData: Record<string, unknown> = { status: newStatus };

    if (additionalData?.failureReason) {
      updateData.failureReason = additionalData.failureReason;
    }

    if (additionalData?.completedAt) {
      updateData.completedAt = additionalData.completedAt;
    }

    const updatedTransaction = await Transaction.findOneAndUpdate(
      { transactionId },
      updateData,
      { new: true }
    );

    if (!updatedTransaction) {
      throw new ApiError(404, 'Transaction not found');
    }

    return updatedTransaction;
  }

  /**
   * Handle DEBIT_SUCCESS event - transition to DEBITED and credit receiver
   */
  async onDebitSuccess(transactionId: string, _senderId: string, amount: number): Promise<void> {
    const transaction = await this.updateStatus(transactionId, TransactionStatus.DEBITED);

    // Now credit the receiver. If this fails, walletService will publish a
    // CREDIT_FAILED event, which will be handled by the onCreditFailed saga step.
    // Let the error propagate to be logged by a higher-level handler.
    await walletService.credit(transaction.receiverId, amount, transactionId);
  }

  /**
   * Handle DEBIT_FAILED event - transition to FAILED
   */
  async onDebitFailed(transactionId: string, reason: string): Promise<void> {
    await this.updateStatus(transactionId, TransactionStatus.FAILED, {
      failureReason: reason,
    });

    // Publish TRANSACTION_FAILED event
    await eventBus.publish({
      eventType: EventType.TRANSACTION_FAILED,
      transactionId,
      timestamp: new Date(),
      payload: {
        reason,
        refunded: false,
      },
    });
  }

  /**
   * Handle CREDIT_SUCCESS event - transition directly to COMPLETED
   */
  async onCreditSuccess(transactionId: string): Promise<void> {
    // Direct transition from DEBITED to COMPLETED (single DB update)
    const transaction = await this.updateStatus(transactionId, TransactionStatus.COMPLETED, {
      completedAt: new Date(),
    });

    // Publish TRANSACTION_COMPLETED event
    await eventBus.publish({
      eventType: EventType.TRANSACTION_COMPLETED,
      transactionId,
      timestamp: new Date(),
      payload: {
        senderId: transaction.senderId,
        receiverId: transaction.receiverId,
        amount: transaction.amount,
        currency: transaction.currency,
      },
    });
  }

  /**
   * Handle CREDIT_FAILED event - trigger compensation (refund)
   */
  async onCreditFailed(transactionId: string, reason: string): Promise<void> {
    const transaction = await this.getTransaction(transactionId);

    // Transition to REFUNDING
    await this.updateStatus(transactionId, TransactionStatus.REFUNDING);

    // Trigger refund (compensation)
    await eventBus.publish({
      eventType: EventType.REFUND_REQUESTED,
      transactionId,
      timestamp: new Date(),
      payload: {
        senderId: transaction.senderId,
        amount: transaction.amount,
        reason,
      },
    });
  }

  /**
   * Handle REFUND_COMPLETED event - transition to FAILED
   */
  async onRefundCompleted(transactionId: string): Promise<void> {
    await this.updateStatus(transactionId, TransactionStatus.FAILED, {
      failureReason: 'Credit failed, amount refunded to sender',
    });

    // Publish TRANSACTION_FAILED event
    await eventBus.publish({
      eventType: EventType.TRANSACTION_FAILED,
      transactionId,
      timestamp: new Date(),
      payload: {
        reason: 'Credit failed',
        refunded: true,
      },
    });
  }

  /**
   * Check if transaction can be modified
   */
  async canModify(transactionId: string): Promise<boolean> {
    const transaction = await this.getTransaction(transactionId);
    return !isTerminalState(transaction.status);
  }
}

export const transactionService = new TransactionService();
